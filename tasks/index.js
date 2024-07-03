const { task } = require("hardhat/config")
const { deterministicAddress, deterministicDeploy } = require("./deployer2")

const SAFE_FACTORY = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2"
const SAFE_SINGLETON = "0x3E5c63644E683549055b9Be8653de26E0B4CD36E"

task("printAddress", "Print deterministic address")
	.setAction(async ({ }, hre) => {
		await deterministicAddress(hre,
			"FortiusSafeFactory",
			[SAFE_FACTORY, SAFE_SINGLETON],
			['address', 'address']
		)
		await deterministicAddress(hre, "TimelockModule")
	})

task("deterministicDeploy", "Deploy contracts with deterministic address")
	.setAction(async ({ }, hre) => {
		await deterministicDeploy(hre,
			"FortiusSafeFactory",
			[SAFE_FACTORY, SAFE_SINGLETON],
			['address', 'address']
		)
		await deterministicDeploy(hre, "TimelockModule")
	})
