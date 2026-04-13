const hre = require("hardhat");

// Uniswap V4 PoolManager addresses
const POOL_MANAGERS = {
  arbitrum_sepolia: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
  base_sepolia: "0x498581ff718922c3f8e6a244956af099b2652b2b",
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const poolManager = POOL_MANAGERS[network];
  if (!poolManager) {
    throw new Error(`No PoolManager configured for network: ${network}. Use arbitrum_sepolia or base_sepolia.`);
  }

  const registryAddress = process.env.CONTRACT_ADDRESS || hre.ethers.ZeroAddress;

  console.log(`Deploying AutoDCAHook to ${network}...`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`PoolManager: ${poolManager}`);
  console.log(`Registry:    ${registryAddress}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:     ${hre.ethers.formatEther(balance)} ETH`);

  const Hook = await hre.ethers.getContractFactory("AutoDCAHook");
  const hook = await Hook.deploy(poolManager, registryAddress);
  await hook.waitForDeployment();

  const address = await hook.getAddress();
  console.log(`\nAutoDCAHook deployed to: ${address}`);
  console.log(`\nAdd to .env: DCA_HOOK_ADDRESS=${address}`);

  if (network === "arbitrum_sepolia") {
    console.log(`Explorer: https://sepolia.arbiscan.io/address/${address}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
