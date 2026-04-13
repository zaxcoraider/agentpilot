const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const registryAddress = process.env.CONTRACT_ADDRESS || hre.ethers.ZeroAddress;

  console.log(`Deploying SimpleDCA to ${network}...`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Registry:  ${registryAddress}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:   ${hre.ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error("Deployer has no ETH. Fund the wallet first.");
  }

  const DCA = await hre.ethers.getContractFactory("SimpleDCA");
  const dca = await DCA.deploy(registryAddress);
  await dca.waitForDeployment();

  const address = await dca.getAddress();
  console.log(`\nSimpleDCA deployed to: ${address}`);
  console.log(`\nAdd to .env: DCA_HOOK_ADDRESS=${address}`);

  if (network === "arbitrum_sepolia") {
    console.log(`Explorer: https://sepolia.arbiscan.io/address/${address}`);
  } else if (network === "xlayer") {
    console.log(`Explorer: https://www.okx.com/explorer/xlayer/address/${address}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
