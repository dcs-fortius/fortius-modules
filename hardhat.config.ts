import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-solhint";
import "hardhat-deploy";
import "solidity-coverage";
import "./tasks"

import { HardhatUserConfig } from "hardhat/config";

const accounts = [process.env.DEPLOYER_KEY || "6560c34f0c94d9ffdb745a7bbb95ca080c93bbc4ad151420a640e1d0d202d0bf"];

const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: { default: 0 },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  networks: {
    localhost: {
      chainId: 1337,
      url: 'http://127.0.0.1:7545',
      accounts,
      live: false,
      saveDeployments: true,
    },
    arbitrum: {
      chainId: 42161,
      url: "https://arb1.arbitrum.io/rpc",
      accounts,
      live: true,
      saveDeployments: true,
    },
    polygon: {
      chainId: 137,
      url: "https://rpc.ankr.com/polygon",
      accounts,
      live: true,
      saveDeployments: true,
    },
    optimism: {
      chainId: 10,
      url: "https://optimism.blockpi.network/v1/rpc/public",
      accounts,
      live: true,
      saveDeployments: true,
    },
    base: {
      chainId: 8453,
      url: "https://mainnet.base.org",
      accounts,
      live: true,
      saveDeployments: true,
    },
    sepolia: {
      chainId: 11155111,
      url: "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
      accounts,
      live: true,
      saveDeployments: true,
    }
  },
  solidity: {
    compilers: [{
      version: '0.8.18',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        metadata: {
          bytecodeHash: 'none',
        },
      },
    }],
  },
};

export default config;
