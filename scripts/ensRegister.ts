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

  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const secret =
    "0x" +
    Array.from(random)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  // Submit our commitment to the smart contract
  const name = namehash.normalize("१११");
  const ownerAddress = await signer.getAddress();
  const duration = BigNumber.from("31536000"); // 1 year in seconds
  const isAvailable = await controller.available(name);
  if (!isAvailable) {
    console.log(`${name} is not available`);
    return;
  }
  // Creating commitment to commit to ens controller
  const commitment = await controller.makeCommitmentWithConfig(
    name,
    ownerAddress,
    secret,
    PUBLIC_RESOLVER_ADDRESS,
    ownerAddress
  );
  console.log("Commitment:", commitment);
  let commitReceipt: FlashbotsBundleResolution;
  let registerCount = 0;
  let isCommitBundleIncluded: boolean;
  let isRegisterBundleIncluded: boolean;
  // Add 10% to account for price fluctuation; the difference is refunded.
  const price = (await controller.rentPrice(name, duration)).mul(110).div(100);
  const minCommitmentAge = await controller.minCommitmentAge();
  const waitDuration = minCommitmentAge.mul(1000).toNumber();
  console.log("Commiting to ENS...");
  provider.on("block", async (blockNumber) => {
    if (!isCommitBundleIncluded) {
      try {
        const bundleResponse: FlashbotsTransaction = await flashbotsProvider.sendBundle(
          [
            {
              transaction: {
                chainId: 5,
                type: 2,
                to: controller.address,
                data: controller.interface.encodeFunctionData("commit", [commitment]),
                maxFeePerGas: BigNumber.from(10).pow(9).mul(3),
                maxPriorityFeePerGas: BigNumber.from(10).pow(9).mul(2),
                gasLimit: BigNumber.from(60000),
              },
              signer,
            },
          ],
          blockNumber + 1
        );
        if ("error" in bundleResponse) {
          console.log("error: ", bundleResponse.error);
        }
        commitReceipt = await (bundleResponse as FlashbotsTransactionResponse).wait();
        if (FlashbotsBundleResolution[commitReceipt] === "BundleIncluded") {
          isCommitBundleIncluded = true;
        }
        console.log("Commit => Block Number: ", blockNumber, " Status: ", FlashbotsBundleResolution[commitReceipt]);
      } catch (e) {
        console.log(e);
      }
    }

    if (isCommitBundleIncluded && !isRegisterBundleIncluded) {
      if (registerCount === 0) {
        console.log("Commit Bundle included so registering the name...");
        await new Promise((resolve) => setTimeout(resolve, waitDuration));
      }
      registerCount++;
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
                maxFeePerGas: BigNumber.from(10).pow(9).mul(3),
                maxPriorityFeePerGas: BigNumber.from(10).pow(9).mul(2),
                gasLimit: BigNumber.from(300000),
              },
              signer,
            },
          ],
          blockNumber + 1
        );
        if ("error" in bundleResponse) {
          console.log("error: ", bundleResponse.error);
        }
        const receipt = await (bundleResponse as FlashbotsTransactionResponse).wait();
        console.log("Register => Block Number: ", blockNumber, " Status: ", FlashbotsBundleResolution[receipt]);
        if (FlashbotsBundleResolution[receipt] === "BundleIncluded") {
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
