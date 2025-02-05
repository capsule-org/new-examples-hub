import type { NextFunction, Request, Response } from "express";
import { Capsule as CapsuleServer, Environment } from "@usecapsule/server-sdk";
import { CapsuleEthersSigner } from "@usecapsule/ethers-v6-integration";
import { ethers } from "ethers";

/**
 * Use this handler when you want to sign a transaction using a session-based Capsule wallet integrated with Ethers.
 *
 * Prerequisites:
 * - The user's session must have been previously created and exported on the client side (e.g., via `capsuleClient.exportSession()`).
 * - Include `session` in the request body to import the user's session-based wallet.
 *
 * Steps for developers:
 * 1. Use `session` from the request body to import the user's existing session into the Capsule client.
 * 2. Initialize a CapsuleEthersSigner that uses the session-based MPC wallet for Ethers transactions.
 * 3. Set up an Ethers provider and prepare a transaction.
 * 4. Sign the transaction using CapsuleEthersSigner, producing a fully signed transaction that you can broadcast.
 *
 * Note:
 * - This example focuses on session-based wallet usage with Ethers.
 * - For production environments, implement proper authentication, authorization, and error handling.
 */
export async function ethersSessionSignHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Use `session` and `email` from the request body.
    // Ensure both are provided so you can identify the user's session-based wallet.
    const { email, session } = req.body as { email?: string; session?: string };
    if (!email || !session) {
      res.status(400).send("Provide both `email` and `session` in the request body.");
      return;
    }

    // Ensure CAPSULE_API_KEY is set in your environment.
    // Without this API key, you cannot interact with the Capsule service.
    const CAPSULE_API_KEY = process.env.CAPSULE_API_KEY;
    if (!CAPSULE_API_KEY) {
      res.status(500).send("Set CAPSULE_API_KEY in the environment before using this handler.");
      return;
    }

    // 2. Initialize the Capsule client and import the user's session.
    // This session was exported from the client side, allowing the server to act on the user's behalf.
    const capsuleClient = new CapsuleServer(Environment.BETA, CAPSULE_API_KEY);
    await capsuleClient.importSession(session);

    // 3. Set up an Ethers provider connected to a testnet or mainnet endpoint.
    // Here, we use a Sepolia RPC endpoint. Adjust this to your target network as needed.
    const ethersProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");

    // Initialize the CapsuleEthersSigner with the session-based MPC wallet.
    // This integrates Capsule's MPC signing directly into Ethers.js workflows.
    const capsuleEthersSigner = new CapsuleEthersSigner(capsuleClient, ethersProvider);

    // Retrieve the wallet address from the session-based wallet.
    // This address is derived from the MPC key managed by Capsule.
    const address = await capsuleEthersSigner.getAddress();

    // 4. Construct a sample transaction.
    // In a real application, you might send funds to a contract, call a contract method, or transfer tokens.
    const tx = {
      to: address,
      from: address,
      value: ethers.parseEther("0.001"), // Sending a small amount of ETH for demonstration.
      nonce: await ethersProvider.getTransactionCount(address),
      gasLimit: 21000, // Standard gas limit for a simple ETH transfer.
      gasPrice: (await ethersProvider.getFeeData()).gasPrice, // Fetch current gas price from the provider.
    };

    // Sign the transaction using the CapsuleEthersSigner.
    // If this fails, ensure the session is valid and that the MPC key share was properly imported client-side.
    const signedTx = await capsuleEthersSigner.signTransaction(tx);

    // Return the signed transaction so you can inspect, broadcast, or track it as needed.
    // For example, you can broadcast it using ethersProvider.broadcastTransaction(signedTx).
    res.status(200).json({
      message: "Transaction signed using Ethers + Capsule (session-based wallet).",
      signedTransaction: signedTx,
    });
  } catch (error) {
    console.error("Error in ethersSessionSignHandler:", error);
    next(error);
  }
}
