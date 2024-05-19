const { task } = require("hardhat/config")
const { BigNumber } = require('ethers')

function expandTo18Decimals(n) {
	return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

task('accounts', 'Prints the list of accounts', async (_args, hre) => {
	const accounts = await hre.ethers.getSigners();
	for (const account of accounts) {
		console.log(account.address);
	}
});

task("send", "Send token")
	.addParam("account", "Account address")
	.setAction(async ({ account }, hre) => {
		const tokenAddress = (await hre.deployments.get("AethirToken")).address
		console.log('Token Address:', tokenAddress)
		const token = await hre.ethers.getContractAt('AethirToken', tokenAddress)
		console.log(await token.transfer(account, expandTo18Decimals('50000000')));
	})

task("transferOwnership", "Send token")
	.addParam("account", "Account address")
	.setAction(async ({ account }, hre) => {
		const tokenAddress = (await hre.deployments.get("AethirToken")).address
		console.log('Token Address:', tokenAddress)
		const token = await hre.ethers.getContractAt('AethirToken', tokenAddress)
		console.log(await token.transferOwnership(account));

		const vesterAddress = (await hre.deployments.get("VestingWallet")).address
		console.log('Vester Address:', vesterAddress)
		const vester = await hre.ethers.getContractAt('VestingWallet', vesterAddress)
		console.log(await vester.transferOwnership(account));
	})

task("check", "Send token")
	.setAction(async ({  }, hre) => {
		const tokenAddress = (await hre.deployments.get("AethirToken")).address
		console.log('Token Address:', tokenAddress)
		const token = await hre.ethers.getContractAt('AethirToken', tokenAddress)
		console.log(await token.allowedAmount('0xa2ae19D0423c8D43f3382C6807017Cc799CC6314'));
		console.log(await token.transferedAmount('0xa2ae19D0423c8D43f3382C6807017Cc799CC6314'));
	
		const vesterAddress = (await hre.deployments.get("VestingWallet")).address
		console.log('Vester Address:', vesterAddress)
		const vester = await hre.ethers.getContractAt('VestingWallet', vesterAddress)
		console.log(await vester.getDistribution("0xa2ae19D0423c8D43f3382C6807017Cc799CC6314"))
	})
