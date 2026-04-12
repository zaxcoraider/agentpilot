const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Deploying to ${network}...`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} OKB`);

  const Registry = await hre.ethers.getContractFactory("AgentPilotRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`\nAgentPilotRegistry deployed to: ${address}`);

  if (network === "xlayer") {
    console.log(`\nVerify on X Layer Explorer:`);
    console.log(`https://www.oklink.com/xlayer/address/${address}`);
  } else {
    console.log(`\nVerify on X Layer Testnet Explorer:`);
    console.log(`https://www.oklink.com/xlayer-test/address/${address}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
