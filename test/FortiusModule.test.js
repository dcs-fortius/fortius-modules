const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FortiusModule", function () {
  let fortiusModule;
  let gnosisSafe;
  let mockToken;
  let owner, trader, approver, otherAccount;

  const salt = ethers.utils.formatBytes32String("salt");
  const initialAllowanceAmount = 1000;

  beforeEach(async function () {
    [owner, trader, approver, otherAccount] = await ethers.getSigners();

    // Deploy the mock GnosisSafe
    const GnosisSafeMock = await ethers.getContractFactory("GnosisSafeMock");
    gnosisSafe = await GnosisSafeMock.deploy();
    await gnosisSafe.deployed();

    // Deploy the FortiusModule
    const FortiusModule = await ethers.getContractFactory("FortiusModule");
    fortiusModule = await FortiusModule.deploy();
    await fortiusModule.deployed();

    // Set roles
    await fortiusModule.setRole(trader.address, 1); // Trader role
    await fortiusModule.setRole(approver.address, 2); // Approver role
    await fortiusModule.setRole(owner.address, 3); // Owner role

    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Test Token", "TTK", 18, ethers.utils.parseUnits("10000", 18));
    await mockToken.deployed();

    // Set allowances
    await fortiusModule.setAllowance(trader.address, mockToken.address, initialAllowanceAmount, 60); // Allowance for trader
  });

  describe("Propose Transaction", function () {
    it("should allow trader to propose a transaction", async function () {
      const recipients = [otherAccount.address];
      const values = [ethers.utils.parseUnits("100", 18)];

      const txHash = await fortiusModule.propose(
        gnosisSafe.address,
        mockToken.address,
        recipients,
        values,
        Math.floor(Date.now() / 1000),
        true,
        salt
      );

      const transaction = await fortiusModule.transactions(gnosisSafe.address, txHash);
      expect(transaction.status).to.equal(1); // Proposed status
    });

    it("should reject proposal with mismatched recipients and values length", async function () {
      const recipients = [otherAccount.address];
      const values = [ethers.utils.parseUnits("100", 18), ethers.utils.parseUnits("50", 18)];

      await expect(
        fortiusModule.propose(
          gnosisSafe.address,
          mockToken.address,
          recipients,
          values,
          Math.floor(Date.now() / 1000),
          true,
          salt
        )
      ).to.be.revertedWith("Recipients and values length mismatch");
    });

    it("should reject proposal if allowance is exceeded", async function () {
      const recipients = [otherAccount.address];
      const values = [ethers.utils.parseUnits("2000", 18)];

      await expect(
        fortiusModule.propose(
          gnosisSafe.address,
          mockToken.address,
          recipients,
          values,
          Math.floor(Date.now() / 1000),
          true,
          salt
        )
      ).to.be.revertedWith("Proposer allowance exceeded or newSpent <= proposerAllowance.amount");
    });
  });

  describe("Approve Transaction", function () {
    let txHash;

    beforeEach(async function () {
      const recipients = [otherAccount.address];
      const values = [ethers.utils.parseUnits("100", 18)];

      txHash = await fortiusModule.propose(
        gnosisSafe.address,
        mockToken.address,
        recipients,
        values,
        Math.floor(Date.now() / 1000),
        true,
        salt
      );
    });

    it("should allow approver to approve a transaction", async function () {
      await fortiusModule.connect(approver).approve(gnosisSafe.address, txHash);

      const transaction = await fortiusModule.transactions(gnosisSafe.address, txHash);
      expect(transaction.status).to.equal(2); // Approved status
    });

    it("should not approve a transaction if the status is not 'Proposed'", async function () {
      await expect(fortiusModule.connect(approver).approve(gnosisSafe.address, txHash)).to.be.revertedWith(
        "Transaction not proposed or already approved"
      );
    });
  });

  describe("Execute Transaction", function () {
    let txHash;

    beforeEach(async function () {
      const recipients = [otherAccount.address];
      const values = [ethers.utils.parseUnits("100", 18)];

      txHash = await fortiusModule.propose(
        gnosisSafe.address,
        mockToken.address,
        recipients,
        values,
        Math.floor(Date.now() / 1000),
        true,
        salt
      );
      await fortiusModule.connect(approver).approve(gnosisSafe.address, txHash);
    });

    it("should allow owner to execute a transaction", async function () {
      await fortiusModule.connect(owner).execute(gnosisSafe.address, txHash);
      const transaction = await fortiusModule.transactions(gnosisSafe.address, txHash);
      expect(transaction.status).to.equal(3); // Executed status
    });

    it("should reject execution if not enough approvals", async function () {
      await fortiusModule.connect(approver).approve(gnosisSafe.address, txHash);
      await expect(fortiusModule.connect(owner).execute(gnosisSafe.address, txHash)).to.be.revertedWith(
        "Insufficient approvals"
      );
    });
  });

  describe("Cancel Transaction", function () {
    let txHash;

    beforeEach(async function () {
      const recipients = [otherAccount.address];
      const values = [ethers.utils.parseUnits("100", 18)];

      txHash = await fortiusModule.propose(
        gnosisSafe.address,
        mockToken.address,
        recipients,
        values,
        Math.floor(Date.now() / 1000),
        true,
        salt
      );
    });

    it("should allow trader to cancel a transaction", async function () {
      await fortiusModule.connect(trader).cancel(txHash);
      const transaction = await fortiusModule.transactions(gnosisSafe.address, txHash);
      expect(transaction.status).to.equal(4); // Cancelled status
    });

    it("should reject cancellation after execution", async function () {
      await fortiusModule.connect(approver).approve(gnosisSafe.address, txHash);
      await fortiusModule.connect(owner).execute(gnosisSafe.address, txHash);
      await expect(fortiusModule.connect(trader).cancel(txHash)).to.be.revertedWith("Item already executed");
    });
  });

  describe("Allowance Functions", function () {
    it("should allow setting an allowance", async function () {
      await fortiusModule.setAllowance(trader.address, mockToken.address, 1000, 60);

      const allowance = await fortiusModule.getAllowance(
        gnosisSafe.address,
        trader.address,
        mockToken.address
      );
      expect(allowance.amount).to.equal(1000);
    });

    it("should allow resetting an allowance", async function () {
      await fortiusModule.setAllowance(trader.address, mockToken.address, 1000, 60);
      await fortiusModule.resetAllowance(trader.address, mockToken.address);

      const allowance = await fortiusModule.getAllowance(
        gnosisSafe.address,
        trader.address,
        mockToken.address
      );
      expect(allowance.spent).to.equal(0);
    });

    it("should allow deleting an allowance", async function () {
      await fortiusModule.setAllowance(trader.address, mockToken.address, 1000, 60);
      await fortiusModule.deleteAllowance(trader.address, mockToken.address);

      const allowance = await fortiusModule.getAllowance(
        gnosisSafe.address,
        trader.address,
        mockToken.address
      );
      expect(allowance.amount).to.equal(0);
    });
  });
});
