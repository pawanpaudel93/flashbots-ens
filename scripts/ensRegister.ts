import { ethers } from "hardhat";
import { webcrypto } from "crypto";
import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
  FlashbotsTransaction,
  FlashbotsTransactionResponse,
} from "@flashbots/ethers-provider-bundle";
import { BigNumber, Signer } from "ethers";
const namehash = require("@ensdomains/eth-ens-namehash");
// eslint-disable-next-line no-undef
const crypto = webcrypto as unknown as Crypto;

const REGISTRAR_CONTROLLER_ADDRESS = "0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5";
const PUBLIC_RESOLVER_ADDRESS = "0x4B1488B7a6B320d2D721406204aBc3eeAa9AD329";
const FLASHBOT_CONNECTION_URL = "https://relay-goerli.flashbots.net";

async function main() {
  const provider = new ethers.providers.WebSocketProvider(process.env.ALCHEMY_WEBSOCKET_URL as string, "goerli");
  const signer: Signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);
  const controller = await ethers.getContractAt("IETHRegistrarController", REGISTRAR_CONTROLLER_ADDRESS, signer);
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, signer, FLASHBOT_CONNECTION_URL, "goerli");

  // Preparing arguments for the commit and register transaction
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const secret =
    "0x" +
    Array.from(random)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const name = namehash.normalize("sharebazaari"); // name should be atleast 3 characters long
  if (name.length < 3) {
    throw new Error("Name should be atleast 3 characters long");
  }
  const ownerAddress = await signer.getAddress();
  const duration = 31536000; // 1 year in seconds
  const isAvailable = await controller.available(name);
  if (!isAvailable) {
    throw new Error(`${name} is not available`);
  }
  // Add 10% to account for price fluctuation; the difference is refunded.
  const price = (await controller.rentPrice(name, duration)).mul(110).div(100);
  const minCommitmentAge = await controller.minCommitmentAge();
  const waitDuration = minCommitmentAge.mul(1000).toNumber(); // waitDuration in milliseconds

  // Creating commitment to commit to ens controller
  const commitment = await controller.makeCommitmentWithConfig(
    name,
    ownerAddress,
    secret,
    PUBLIC_RESOLVER_ADDRESS,
    ownerAddress
  );
  console.log("Commitment:", commitment);
  console.log("Commiting to eth registrar controller...");
  const commitTx = await controller.commit(commitment, {
    maxFeePerGas: ethers.utils.parseUnits("3", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"),
    gasLimit: BigNumber.from(60000),
  });
  await commitTx.wait();
  console.log("Committed to eth registrar controller");

  console.log(`Waiting for ${waitDuration / 1000}secs to register the ENS name: ${name}...`);
  await new Promise((resolve) => setTimeout(resolve, waitDuration));
  let isRegisterBundleIncluded: boolean;
  provider.on("block", async (blockNumber) => {
    const targetBlockNumber = blockNumber + 1;
    if (!isRegisterBundleIncluded) {
      console.log("Registering the name in the block number: ", targetBlockNumber);
      try {
        const bundleResponse: FlashbotsTransaction = await flashbotsProvider.sendBundle(
          [
            {
              transaction: {
                chainId: 5,
                type: 2,
                value: price,
                to: controller.address,
                data: controller.interface.encodeFunctionData("registerWithConfig", [
                  name,
                  ownerAddress,
                  duration,
                  secret,
                  PUBLIC_RESOLVER_ADDRESS,
                  ownerAddress,
                ]),
                maxFeePerGas: ethers.utils.parseUnits("3", "gwei"),
                maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"),
                gasLimit: 300000,
              },
              signer,
            },
          ],
          targetBlockNumber
        );
        if ("error" in bundleResponse) {
          console.log("error: ", bundleResponse.error);
        }
        const receipt = await (bundleResponse as FlashbotsTransactionResponse).wait();
        console.log(`Register => Block Number: ${targetBlockNumber} | Status: ${FlashbotsBundleResolution[receipt]}`);
        if (FlashbotsBundleResolution.BundleIncluded === receipt) {
          isRegisterBundleIncluded = true;
          console.log("Register Bundle included");
          console.log("Registered successfully!");
          provider.off("block");
          provider.removeAllListeners();
          provider.destroy();
        }
      } catch (e) {
        console.log(e);
      }
    }
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
