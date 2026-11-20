const path = require("path");
require("@nomicfoundation/hardhat-toolbox");

// Load .env from backend or root
const envPath = require("fs").existsSync(path.resolve(__dirname, "../backend/.env"))
  ? path.resolve(__dirname, "../backend/.env")
  : path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "paris"
    }
  },

  networks: {
    // Hardhat local network
    hardhat: {
      chainId: 1337
    },

    // Localhost / Ganache
    localhost: {
      url: "http://127.0.0.1:7545"
    },

    // Ganache
    ganache: {
      url: "http://127.0.0.1:7545",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },

    // Sepolia Testnet
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: 10000000000
    },

    // Goerli Testnet
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 5,
      gasPrice: 10000000000
    },

    // Ethereum Mainnet (use with caution)
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
      gasPrice: 20000000000
    }
  },

  paths: {
    root: path.resolve(__dirname, ".."),
    sources: path.resolve(__dirname, "../backend/contracts"),
    tests: path.resolve(__dirname, "./test"),
    cache: path.resolve(__dirname, "./cache"),
    artifacts: path.resolve(__dirname, "./artifacts")
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};
