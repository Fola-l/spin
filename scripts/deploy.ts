import { network } from "hardhat";

// The already-deployed FLD ERC-20 token on Sepolia.
const FLD_TOKEN_ADDRESS = "0x7512d35cB4e66d98232830764dCE7a8997Ac9FEc";

const { ethers } = await network.create({ network: "sepolia" });

const [deployer] = await ethers.getSigners();
console.log("Deploying with account:", deployer.address);
console.log("Owner (teacher) address:", deployer.address);

const staking = await ethers.deployContract("ClassroomStaking", [
  FLD_TOKEN_ADDRESS,
  deployer.address,
]);
await staking.waitForDeployment();

const address = await staking.getAddress();
console.log("\nClassroomStaking deployed to:", address);
console.log(
  "\nNext step: paste this address into STAKING_CONTRACT_ADDRESS in src/web3/config.ts",
);
