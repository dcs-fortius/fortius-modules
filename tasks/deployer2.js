const ethers = require("ethers")

const IDeployer = new ethers.utils.Interface([
    'function deploy(bytes bytecode, bytes32 salt) external payable returns (address deployedAddress_)',
    'function deployAndInit(bytes bytecode, bytes32 salt, bytes init) external payable returns (address deployedAddress_)',
    'function deployedAddress(bytes bytecode, address sender, bytes32 salt) external view returns (address deployedAddress_)',
    'event Deployed(bytes32 indexed bytecodeHash, bytes32 indexed salt, address indexed deployedAddress)',
])
const deployer2Address = "0x98b2920d53612483f91f12ed7754e51b4a77919e"

async function isContract(hre, value) {
    const result = await hre.ethers.provider.getCode(value)
    if (result === "0x") {
        return false;
    }
    return true;
}

const deterministicAddress = async (hre, name, params = [], paramTypes = []) => {
    const [deployer] = await hre.ethers.getSigners()
    const deployer2 = new hre.ethers.Contract(deployer2Address, IDeployer, deployer)
    const artifact = await hre.artifacts.readArtifact(`contracts/${name}.sol:${name}`)
    const factory = new hre.ethers.ContractFactory(artifact.abi, artifact.bytecode)
    const bytecode = factory.getDeployTransaction(...params).data
    const salt = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['string', ...paramTypes],
        [name, ...params]
    ));
    const address = await deployer2.deployedAddress(bytecode, deployer.address, salt)
    console.log(`${name}:`, address, (await isContract(hre, address)) ? ". Deployed" : ". Not deployed yet")
}

const deterministicDeploy = async (hre, name, params = [], paramTypes = []) => {
    const [deployer] = await hre.ethers.getSigners()
    const deployer2 = new hre.ethers.Contract(deployer2Address, IDeployer, deployer)
    const artifact = await hre.artifacts.readArtifact(`contracts/${name}.sol:${name}`)
    const factory = new hre.ethers.ContractFactory(artifact.abi, artifact.bytecode)
    const bytecode = factory.getDeployTransaction(...params).data
    const salt = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['string', ...paramTypes],
        [name, ...params]
    ));
    console.log(`Deploy ${name}. Salt:`, salt)
    const txResponse = await deployer2.deploy(bytecode, salt)
    console.log(`Txhash:`, txResponse.hash)

    const txReceipt = await txResponse.wait()
    const events = txReceipt.logs || []
    for (let log of events) {
        try {
            const event = IDeployer.parseLog(log)
            if (event.name == 'Deployed') {
                console.log(`${name} address:`, event.args.deployedAddress)
            }
        } catch (err) { }
    }
}

module.exports = {
    deterministicAddress,
    deterministicDeploy
}