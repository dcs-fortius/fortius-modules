const { expect } = require('chai')

describe('VestingWallet', () => {
  before(async function () {
    this.wallets = waffle.provider.getWallets()
    this.dev = this.wallets[0]
    this.adminWallet = this.wallets[1]

    this.beneficiary = this.wallets[2]
    this.newBeneficiary = this.wallets[3]
    this.newBeneficiary2 = this.wallets[4]
  })

  beforeEach(async function () {
    const blockNumber = ethers.provider.getBlockNumber()
    const block = await ethers.provider.getBlock(blockNumber)
    this.tge = block.timestamp

    const AethirToken = await ethers.getContractFactory('AethirToken', this.dev)
    this.token = await AethirToken.deploy(this.adminWallet.address)
    await this.token.deployed()

    const VestingWallet = await ethers.getContractFactory('VestingWallet', this.dev)
    this.vestor = await VestingWallet.deploy(this.token.address)
    await this.vestor.deployed()

    await this.vestor.transferOwnership(this.adminWallet.address)
  })

  const expectDistribution = (actual, expected) => {
    expect(actual[0]).to.equal(expected.totalAmount)
    expect(actual[1]).to.equal(expected.distributedAmount)
    expect(actual[2].length).to.equal(expected.schedules.length)
    for (let i = 0; i < actual[2].length; i++) {
      expect(actual[2][i].date).to.equal(expected.schedules[i].date)
      expect(actual[2][i].amount).to.equal(expected.schedules[i].amount)
    }
  }

  it('should not allow 0x00 module', async function () {
    const VestingWallet = await ethers.getContractFactory('VestingWallet', this.dev)
    await expect(VestingWallet.deploy('0x0000000000000000000000000000000000000000')).to.be.revertedWith(
      'Token cannot be zero'
    )
  })

  it('should add distribution', async function () {
    const dates = [this.tge, this.tge + 60 * 60, this.tge + 60 * 60 * 2]
    const amounts = [10, 20, 30]

    await expect(
      this.vestor.connect(this.dev).addDistribution(this.beneficiary.address, 60, dates, amounts)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(
      this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 0, dates, amounts)
    ).to.be.revertedWith('Total amount should be greater than 0')
    await expect(
      this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 100, [], [])
    ).to.be.revertedWith('No schedules found')
    await expect(
      this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 100, dates, [...amounts, 40])
    ).to.be.revertedWith('Dates and amounts length mismatch')
    await expect(
      this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 100, dates, amounts)
    ).to.be.revertedWith('Total amount should equal the sum of amounts')
    await expect(this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 60, dates, amounts)).to
      .not.be.reverted
    await expect(
      this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 60, dates, amounts)
    ).to.be.revertedWith('Distribution already exists')

    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 60,
      distributedAmount: 0,
      schedules: [
        { date: this.tge, amount: 10 },
        { date: this.tge + 60 * 60, amount: 20 },
        { date: this.tge + 60 * 60 * 2, amount: 30 },
      ],
    })
  })

  it('should update distribution', async function () {
    const dates = [this.tge, this.tge + 60 * 60, this.tge + 60 * 60 * 2]
    const amounts = [10, 20, 30]

    await expect(
      this.vestor.connect(this.dev).updateDistribution(this.beneficiary.address, 60, dates, amounts)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(
      this.vestor.connect(this.adminWallet).updateDistribution(this.beneficiary.address, 0, dates, amounts)
    ).to.be.revertedWith('Total amount should be greater than 0')
    await expect(
      this.vestor.connect(this.adminWallet).updateDistribution(this.beneficiary.address, 60, [], [])
    ).to.be.revertedWith('No schedules found')
    await expect(
      this.vestor.connect(this.adminWallet).updateDistribution(this.beneficiary.address, 100, dates, [...amounts, 40])
    ).to.be.revertedWith('Dates and amounts length mismatch')
    await expect(
      this.vestor.connect(this.adminWallet).updateDistribution(this.beneficiary.address, 60, dates, amounts)
    ).to.be.revertedWith('No distribution found')

    // Setup: add distribution
    await this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 60, dates, amounts)

    await expect(
      this.vestor
        .connect(this.adminWallet)
        .updateDistribution(this.beneficiary.address, 100, [this.tge - 60 * 60, ...dates], [40, ...amounts])
    ).to.be.revertedWith('Cannot add new dates before today')
    await expect(
      this.vestor.connect(this.adminWallet).updateDistribution(this.beneficiary.address, 100, dates, amounts)
    ).to.be.revertedWith('Total amount should equal the sum of amounts')
    await expect(
      this.vestor
        .connect(this.adminWallet)
        .updateDistribution(this.beneficiary.address, 100, [...dates, this.tge + 60 * 60 * 3], [...amounts, 40])
    ).to.not.be.reverted
    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 100,
      distributedAmount: 0,
      schedules: [
        { date: this.tge, amount: 10 },
        { date: this.tge + 60 * 60, amount: 20 },
        { date: this.tge + 60 * 60 * 2, amount: 30 },
        { date: this.tge + 60 * 60 * 3, amount: 40 },
      ],
    })

    await expect(
      this.vestor
        .connect(this.adminWallet)
        .updateDistribution(this.beneficiary.address, 50, dates.slice(1), amounts.slice(1))
    ).to.not.be.reverted
    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 50,
      distributedAmount: 0,
      schedules: [
        { date: this.tge + 60 * 60, amount: 20 },
        { date: this.tge + 60 * 60 * 2, amount: 30 },
      ],
    })
  })

  it('should change distribution address', async function () {
    const dates = [this.tge, this.tge + 60 * 60, this.tge + 60 * 60 * 2]
    const amounts = [10, 20, 30]

    await expect(
      this.vestor.connect(this.dev).changeDistributionAddress(this.beneficiary.address, this.newBeneficiary.address)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(
      this.vestor
        .connect(this.adminWallet)
        .changeDistributionAddress(this.beneficiary.address, this.newBeneficiary.address)
    ).to.be.revertedWith('No distribution found')

    // Setup: add distribution
    await this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 60, dates, amounts)
    await this.vestor.connect(this.adminWallet).addDistribution(this.newBeneficiary.address, 60, dates, amounts)

    await expect(
      this.vestor
        .connect(this.adminWallet)
        .changeDistributionAddress(this.beneficiary.address, this.newBeneficiary.address)
    ).to.be.revertedWith('Distribution already exists')

    await expect(
      this.vestor
        .connect(this.adminWallet)
        .changeDistributionAddress(this.beneficiary.address, this.newBeneficiary2.address)
    ).to.not.be.reverted

    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 0,
      distributedAmount: 0,
      schedules: [],
    })
    expectDistribution(await this.vestor.getDistribution(this.newBeneficiary2.address), {
      totalAmount: 60,
      distributedAmount: 0,
      schedules: [
        { date: this.tge, amount: 10 },
        { date: this.tge + 60 * 60, amount: 20 },
        { date: this.tge + 60 * 60 * 2, amount: 30 },
      ],
    })
  })

  it('should delete distribution', async function () {
    const dates = [this.tge, this.tge + 60 * 60, this.tge + 60 * 60 * 2]
    const amounts = [10, 20, 30]

    await expect(this.vestor.connect(this.dev).deleteDistribution(this.beneficiary.address)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    await expect(this.vestor.connect(this.adminWallet).deleteDistribution(this.beneficiary.address)).to.be.revertedWith(
      'No distribution found'
    )

    // Setup: add distribution
    await this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 60, dates, amounts)

    await expect(this.vestor.connect(this.adminWallet).deleteDistribution(this.beneficiary.address)).to.not.be.reverted
    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 10,
      distributedAmount: 0,
      schedules: [
        { date: this.tge, amount: 10 },
        { date: 0, amount: 0 },
        { date: 0, amount: 0 },
      ],
    })
  })

  it('should release token', async function () {
    const dates = [this.tge, this.tge + 60 * 60, this.tge + 60 * 60 * 2]
    const amounts = [10, 20, 30]

    await expect(this.vestor.connect(this.adminWallet).release(this.beneficiary.address)).to.be.revertedWith(
      'No distribution found'
    )

    // Setup: mint token, whitelist, transfer to vestor, add distribution
    await this.token.connect(this.adminWallet).mint(200)
    await this.token.connect(this.adminWallet).addWhitelisted(this.vestor.address, 200)
    await this.token.connect(this.adminWallet).transferToWhitelisted(this.vestor.address, 200)
    await this.vestor.connect(this.adminWallet).addDistribution(this.beneficiary.address, 60, dates, amounts)

    await expect(this.vestor.release(this.beneficiary.address)).to.not.be.reverted
    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 60,
      distributedAmount: 10,
      schedules: [
        { date: 0, amount: 0 },
        { date: this.tge + 60 * 60, amount: 20 },
        { date: this.tge + 60 * 60 * 2, amount: 30 },
      ],
    })
    expect(await this.token.balanceOf(this.beneficiary.address)).to.equal(10)

    await ethers.provider.send('evm_increaseTime', [60 * 60])
    await ethers.provider.send('evm_mine')

    await expect(this.vestor.release(this.beneficiary.address)).to.not.be.reverted
    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 60,
      distributedAmount: 30,
      schedules: [
        { date: 0, amount: 0 },
        { date: 0, amount: 0 },
        { date: this.tge + 60 * 60 * 2, amount: 30 },
      ],
    })
    expect(await this.token.balanceOf(this.beneficiary.address)).to.equal(30)

    await ethers.provider.send('evm_increaseTime', [60 * 60])
    await ethers.provider.send('evm_mine')
    await expect(this.vestor.release(this.beneficiary.address)).to.not.be.reverted
    expectDistribution(await this.vestor.getDistribution(this.beneficiary.address), {
      totalAmount: 60,
      distributedAmount: 60,
      schedules: [
        { date: 0, amount: 0 },
        { date: 0, amount: 0 },
        { date: 0, amount: 0 },
      ],
    })
    expect(await this.token.balanceOf(this.beneficiary.address)).to.equal(60)
  })
})
