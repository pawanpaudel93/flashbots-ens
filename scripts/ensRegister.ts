import { ethers } from "hardhat";
import { webcrypto } from "crypto";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { BigNumber, Signer } from "ethers";
const crypto = webcrypto as unknown as Crypto;

async function main() {
  const signer: Signer = (await ethers.getSigners())[0];
  const controller = await ethers.getContractAt(
    "IETHRegistrarController",
    "0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5",
    signer
  );
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const secret =
    "0x" +
    Array.from(random)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  // Submit our commitment to the smart contract
  const name = "rowdy";
  const ownerAddress = await signer.getAddress();
  const duration = BigNumber.from("31536000"); // 1 year in seconds
  const publicResolver = "0x4B1488B7a6B320d2D721406204aBc3eeAa9AD329";
  const isAvailable = await controller.available(name);
  if (!isAvailable) {
    console.log(`${name} is not available`);
    return;
  }
  const commitment = await controller.makeCommitmentWithConfig(
    name,
    ownerAddress,
    secret,
    publicResolver,
    ownerAddress
  );
  console.log("Commitment:", commitment);
  console.log("Committing to ENS...");
  const commitTx = await controller.commit(commitment);
  await commitTx.wait();
  // Add 10% to account for price fluctuation; the difference is refunded.
  const price = (await controller.rentPrice(name, duration)).mul(110).div(100);
  await new Promise((resolve) => setTimeout(resolve, 60000));
  console.log("Registering for name...");
  const registerTx = await controller.registerWithConfig(
    name,
    ownerAddress,
    duration,
    secret,
    publicResolver,
    ownerAddress,
    {
      value: price,
    }
  );
  await registerTx.wait();
  console.log("Registered successfully!");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
