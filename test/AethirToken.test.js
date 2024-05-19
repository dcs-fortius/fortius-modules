const { expect } = require('chai')

describe('AethirToken', () => {
  before(async function () {
    this.wallets = waffle.provider.getWallets()
    this.dev = this.wallets[0]
    this.adminWallet = this.wallets[1]
    this.externalWallet = this.wallets[2]
    this.onetimeWallet = this.wallets[3]
    this.vestingWallet = this.wallets[4]
    this.newWallet = this.wallets[5]
  })

  beforeEach(async function () {
    const AethirToken = await ethers.getContractFactory('AethirToken', this.dev)
    this.token = await AethirToken.deploy(this.adminWallet.address)
    await this.token.deployed()
  })

  it('should mint tokens to token contract', async function () {
    await expect(this.token.connect(this.dev).mint(100)).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(this.token.connect(this.adminWallet).mint(100)).to.not.be.reverted
    expect(await this.token.totalSupply()).to.equal('100')
    expect(await this.token.balanceOf(this.token.address)).to.equal('100')
  })

  it('should not mint more tokens than max supply', async function () {
    const maxSupply = await this.token.MAX_SUPPLY()
    await expect(this.token.connect(this.adminWallet).mint(maxSupply)).to.not.be.reverted
    await expect(this.token.connect(this.adminWallet).mint(1)).to.be.revertedWith('Cannot mint more than max supply')
  })

  it('should transfer tokens to whitelisted account', async function () {
    await expect(this.token.connect(this.adminWallet).mint(100)).to.not.be.reverted

    await expect(
      this.token.connect(this.dev).transferToWhitelisted(this.externalWallet.address, 100)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(
      this.token.connect(this.adminWallet).transferToWhitelisted(this.externalWallet.address, 100)
    ).to.be.revertedWith('Cannot transfer more than max allowed amount')

    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, 100)).to.not.be
      .reverted
    await expect(this.token.connect(this.adminWallet).transferToWhitelisted(this.externalWallet.address, 100)).to.not.be
      .reverted
    expect(await this.token.transferredAmount(this.externalWallet.address)).to.equal('100')
    expect(await this.token.balanceOf(this.externalWallet.address)).to.equal('100')
    expect(await this.token.balanceOf(this.token.address)).to.equal('0')

    await expect(
      this.token.connect(this.adminWallet).transferToWhitelisted(this.externalWallet.address, 1)
    ).to.be.revertedWith('Cannot transfer more than max allowed amount')
  })

  it('should add whitelisted', async function () {
    await expect(this.token.connect(this.dev).addWhitelisted(this.externalWallet.address, '100')).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    await expect(
      this.token.connect(this.adminWallet).addWhitelisted('0x0000000000000000000000000000000000000000', '100')
    ).to.be.revertedWith('Account is the zero address')
    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.token.address, '100')).to.be.revertedWith(
      'Account is the token address'
    )
    await expect(
      this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, '0')
    ).to.be.revertedWith('Max amount must be greater than 0')

    const tx = this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, '100')
    await expect(tx).to.not.be.reverted
    await expect(tx).to.emit(this.token, 'WhitelistedAdded').withArgs(this.externalWallet.address, '100')
    await expect(
      this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, '100')
    ).to.be.revertedWith('Account was whitelisted')
    expect(await this.token.allowedAmount(this.externalWallet.address)).to.equal('100')
  })

  it('should not add whitelisted more than max supply', async function () {
    const maxSupply = await this.token.MAX_SUPPLY()
    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.onetimeWallet.address, maxSupply)).to.not.be
      .reverted
    expect(await this.token.remainWhitelisted()).to.equal(maxSupply)
    await expect(
      this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, 1)
    ).to.be.revertedWith('Cannot whitelist more than max supply')
  })

  it('should remove whitelisted', async function () {
    await expect(this.token.connect(this.dev).removeWhitelisted(this.externalWallet.address)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    )
    await expect(
      this.token.connect(this.adminWallet).removeWhitelisted(this.externalWallet.address)
    ).to.be.revertedWith('Account is not whitelisted')

    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, '100')).to.not.be
      .reverted
    const tx = this.token.connect(this.adminWallet).removeWhitelisted(this.externalWallet.address)
    await expect(tx).to.not.be.reverted
    await expect(tx).to.emit(this.token, 'WhitelistedRemoved').withArgs(this.externalWallet.address)
    expect(await this.token.allowedAmount(this.externalWallet.address)).to.equal(0)
  })

  it('should update whitelisted max amount', async function () {
    await expect(
      this.token.connect(this.dev).updateWhitelistedMaxAmount(this.externalWallet.address, '200')
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(
      this.token.connect(this.adminWallet).updateWhitelistedMaxAmount(this.externalWallet.address, '200')
    ).to.be.revertedWith('Account is not whitelisted')

    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, '100')).to.not.be
      .reverted
    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.onetimeWallet.address, '100')).to.not.be
      .reverted
    await expect(
      this.token.connect(this.adminWallet).updateWhitelistedMaxAmount(this.externalWallet.address, '0')
    ).to.be.revertedWith('Max amount must be greater than 0')

    const tx = this.token.connect(this.adminWallet).updateWhitelistedMaxAmount(this.externalWallet.address, '200')
    await expect(tx).to.not.be.reverted
    await expect(tx).to.emit(this.token, 'WhitelistedMaxAmountUpdated').withArgs(this.externalWallet.address, '200')

    const maxSupply = await this.token.MAX_SUPPLY()
    await expect(
      this.token.connect(this.adminWallet).updateWhitelistedMaxAmount(this.externalWallet.address, maxSupply)
    ).to.be.revertedWith('Cannot whitelist more than max supply')

    expect(await this.token.allowedAmount(this.externalWallet.address)).to.equal('200')
  })

  it('should update whitelisted address', async function () {
    await expect(
      this.token.connect(this.dev).updateWhitelistedAddress(this.externalWallet.address, this.newWallet.address)
    ).to.be.revertedWith('Ownable: caller is not the owner')
    await expect(
      this.token.connect(this.adminWallet).updateWhitelistedAddress(this.externalWallet.address, this.newWallet.address)
    ).to.be.revertedWith('Account is not whitelisted')

    await expect(this.token.connect(this.adminWallet).mint(100)).to.not.be.reverted
    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, '100')).to.not.be
      .reverted
    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.onetimeWallet.address, '100')).to.not.be
      .reverted
    await expect(this.token.connect(this.adminWallet).transferToWhitelisted(this.externalWallet.address, 50)).to.not.be
      .reverted

    await expect(
      this.token
        .connect(this.adminWallet)
        .updateWhitelistedAddress(this.externalWallet.address, this.onetimeWallet.address)
    ).to.be.revertedWith('New address was whitelisted')
    await expect(
      this.token
        .connect(this.adminWallet)
        .updateWhitelistedAddress(this.externalWallet.address, '0x0000000000000000000000000000000000000000')
    ).to.be.revertedWith('New address is the zero address')

    const tx = this.token
      .connect(this.adminWallet)
      .updateWhitelistedAddress(this.externalWallet.address, this.newWallet.address)
    await expect(tx).to.not.be.reverted
    await expect(tx)
      .to.emit(this.token, 'WhitelistedAddressUpdated')
      .withArgs(this.externalWallet.address, this.newWallet.address)

    expect(await this.token.allowedAmount(this.externalWallet.address)).to.equal('0')
    expect(await this.token.allowedAmount(this.newWallet.address)).to.equal('100')
    expect(await this.token.transferredAmount(this.externalWallet.address)).to.equal('0')
    expect(await this.token.transferredAmount(this.newWallet.address)).to.equal('50')
  })

  it('should allow transfer token back and update transfered counter', async function () {
    await expect(this.token.connect(this.adminWallet).mint(200)).to.not.be.reverted
    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.externalWallet.address, '100')).to.not.be
      .reverted
    await expect(this.token.connect(this.adminWallet).addWhitelisted(this.onetimeWallet.address, '100')).to.not.be
      .reverted
    await expect(this.token.connect(this.adminWallet).transferToWhitelisted(this.externalWallet.address, 50)).to.not.be
      .reverted
    await expect(this.token.connect(this.adminWallet).transferToWhitelisted(this.onetimeWallet.address, 50)).to.not.be
      .reverted

    // transfer back less than transferredAmount
    await expect(this.token.connect(this.externalWallet).transfer(this.token.address, 10)).to.not.be.reverted
    expect(await this.token.allowedAmount(this.externalWallet.address)).to.equal('100')
    expect(await this.token.transferredAmount(this.externalWallet.address)).to.equal('40')

    // transfer back more than transferredAmount
    await expect(this.token.connect(this.onetimeWallet).transfer(this.externalWallet.address, 50)).to.not.be.reverted
    await expect(this.token.connect(this.externalWallet).transfer(this.token.address, 50)).to.not.be.reverted
    expect(await this.token.allowedAmount(this.externalWallet.address)).to.equal('100')
    expect(await this.token.transferredAmount(this.externalWallet.address)).to.equal('0')
  })
})
