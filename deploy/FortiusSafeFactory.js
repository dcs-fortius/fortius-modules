const SAFE_FACTORY = {
  137: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2"
};

const SAFE_SINGLETON = {
  137: "0x3E5c63644E683549055b9Be8653de26E0B4CD36E"
};

module.exports = async function ({ getNamedAccounts, deployments, getChainId }) {
  const { deploy } = deployments
  const chainId = await getChainId()

  const { deployer } = await getNamedAccounts()

  await deploy("FortiusSafeFactory", {
    from: deployer,
    args: [SAFE_FACTORY[chainId], SAFE_SINGLETON[chainId]],
    log: true,
  })
}

module.exports.tags = ["FortiusSafeFactory"]