import type { NextFunction, Request, Response } from "express";
import {
  Capsule as CapsuleServer,
  Environment,
  SuccessfulSignatureRes,
  hexStringToBase64,
} from "@usecapsule/server-sdk";
import { createCapsuleAccount, createCapsuleViemClient } from "@usecapsule/viem-v2-integration";
import { hashMessage, http } from "viem";
import type { WalletClient, LocalAccount, SignableMessage, Hash } from "viem";
import { createModularAccountAlchemyClient } from "@alchemy/aa-alchemy";
import { BatchUserOperationCallData, WalletClientSigner, arbitrumSepolia } from "@alchemy/aa-core";
import { encodeFunctionData } from "viem";
import Example from "../../artifacts/Example.json" assert { type: "json" };

const EXAMPLE_CONTRACT_ADDRESS = "0x7920b6d8b07f0b9a3b96f238c64e022278db1419";

/**
 * Use this handler when you need to sign and send user operations via a session-based Capsule wallet integrated with Alchemy’s AA.
 *
 * Prerequisites:
 * - Ensure the user's Capsule session is already established on the client side.
 *
 * Steps:
 * 1. Use `session` from the request body to import the user's existing Capsule session.
 * 2. Create a Viem WalletClient backed by Capsule and override `signMessage` if needed.
 * 3. Initialize the Alchemy AA client using the Capsule-backed signer.
 * 4. Construct and send a batch of user operations to the Example contract on Arbitrum Sepolia.
 *
 * Note: This example focuses on the session-based integration with Capsule. Implement authentication,
 * authorization, and other production-level checks as required by your application.
 */
export async function alchemySessionSignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Use `session` from the request body to import the user's existing Capsule session.
    const { session } = req.body as { session?: string };
    if (!session) {
      res.status(400).send("Session is required. Ensure the client passes a valid session.");
      return;
    }

    // Confirm that the required environment variables (CAPSULE_API_KEY, ALCHEMY_API_KEY, ALCHEMY_GAS_POLICY_ID) are set.
    // If they are not, return an error and instruct the developer to set them properly.
    const CAPSULE_API_KEY = process.env.CAPSULE_API_KEY;
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
    const ALCHEMY_GAS_POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;

    if (!CAPSULE_API_KEY) {
      res.status(500).send("CAPSULE_API_KEY not set. Set it in the environment before using this handler.");
      return;
    }
    if (!ALCHEMY_API_KEY || !ALCHEMY_GAS_POLICY_ID) {
      res
        .status(500)
        .send("ALCHEMY_API_KEY or ALCHEMY_GAS_POLICY_ID not set. Provide these credentials to use Alchemy's AA.");
      return;
    }

    // 1. Import the user's session into the Capsule client.
    const capsuleClient = new CapsuleServer(Environment.BETA, CAPSULE_API_KEY);
    await capsuleClient.importSession(session);

    // 2. Create a Viem WalletClient that uses the Capsule client.
    // Set the chain, transport, and other configurations as needed.
    const viemCapsuleAccount: LocalAccount = createCapsuleAccount(capsuleClient);
    const viemClient: WalletClient = createCapsuleViemClient(capsuleClient, {
      account: viemCapsuleAccount,
      chain: arbitrumSepolia,
      transport: http("https://arbitrum-sepolia-rpc.publicnode.com"),
    });

    // Override `signMessage` to adjust the `v` value in Capsule's MPC signatures if necessary.
    viemClient.signMessage = async ({ message }: { message: SignableMessage }): Promise<Hash> => {
      return customSignMessage(capsuleClient, message);
    };

    // 3. Wrap the viem client with a WalletClientSigner so you can use it with Alchemy's AA client.
    const walletClientSigner = new WalletClientSigner(viemClient, "capsule");

    // 4. Initialize the Alchemy AA client, providing your Alchemy credentials and the Capsule-backed signer.
    const alchemyClient = await createModularAccountAlchemyClient({
      apiKey: ALCHEMY_API_KEY,
      chain: arbitrumSepolia,
      signer: walletClientSigner,
      gasManagerConfig: {
        policyId: ALCHEMY_GAS_POLICY_ID,
      },
    });

    // Construct the batch of user operations you plan to send.
    // In this example, call `changeX` on the Example contract multiple times.
    const demoUserOperations: BatchUserOperationCallData = [1, 2, 3, 4, 5].map((x) => ({
      target: EXAMPLE_CONTRACT_ADDRESS,
      data: encodeFunctionData({
        abi: Example["contracts"]["contracts/Example.sol:Example"]["abi"],
        functionName: "changeX",
        args: [x],
      }),
    }));

    // Send the user operation to the Alchemy AA client.
    // You can use the returned result to track on-chain execution.
    const userOperationResult = await alchemyClient.sendUserOperation({ uo: demoUserOperations });

    // Return the result to the caller so they can track or confirm the transaction.
    res.status(200).json({
      message: "Sent user operation using Alchemy + Capsule (session-based wallet, viem-based).",
      userOperationResult,
    });
  } catch (error) {
    console.error("Error in alchemySessionSignHandler:", error);
    next(error);
  }
}

/**
 * Use this custom `signMessage` function to ensure compatibility with AA clients.
 *
 * Capsule's MPC-generated signatures may produce a `v` value that does not align with
 * the standard Ethereum secp256k1 format. If `v` is below 27, adjust it upward to prevent
 * AA clients from rejecting the signature.
 */
async function customSignMessage(capsule: CapsuleServer, message: SignableMessage): Promise<Hash> {
  const hashedMessage = hashMessage(message);
  const res = await capsule.signMessage(Object.values(capsule.wallets!)[0]!.id, hexStringToBase64(hashedMessage));

  let signature = (res as SuccessfulSignatureRes).signature;

  // Adjust `v` if it is below 27.
  const lastByte = parseInt(signature.slice(-2), 16);
  if (lastByte < 27) {
    const adjustedV = (lastByte + 27).toString(16).padStart(2, "0");
    signature = signature.slice(0, -2) + adjustedV;
  }

  return `0x${signature}`;
}
