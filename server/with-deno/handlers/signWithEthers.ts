import { Handler } from "@std/http";
import { simulateVerifyToken } from "../utils/auth-utils.ts";
import { Capsule as CapsuleServer, Environment } from "@usecapsule/server-sdk";
import { getKeyShareInDB } from "../db/keySharesDB.ts";
import { decrypt } from "../utils/encryption-utils.ts";
import { CapsuleEthersSigner } from "@usecapsule/ethers-v6-integration";
import { ethers, TransactionRequest } from "ethers";

interface RequestBody {
  email: string;
}

export const signWithEthers: Handler = async (req: Request): Promise<Response> => {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.split(" ")[1];

  const user = simulateVerifyToken(token);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { email }: RequestBody = await req.json();

  if (user.email !== email) {
    return new Response("Forbidden", { status: 403 });
  }

  const CAPSULE_API_KEY = Deno.env.get("CAPSULE_API_KEY");

  if (!CAPSULE_API_KEY) {
    return new Response("CAPSULE_API_KEY not set", { status: 500 });
  }

  const capsuleClient = new CapsuleServer(Environment.BETA, CAPSULE_API_KEY);

  const hasPregenWallet = await capsuleClient.hasPregenWallet(email);

  if (!hasPregenWallet) {
    return new Response("Wallet does not exist", { status: 400 });
  }

  const keyShare = getKeyShareInDB(email);

  if (!keyShare) {
    return new Response("Key share does not exist", { status: 400 });
  }

  const decryptedKeyShare = decrypt(keyShare);

  await capsuleClient.setUserShare(decryptedKeyShare);

  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");

  const capsuleEthersSigner = new CapsuleEthersSigner(capsuleClient, provider);

  const address = await capsuleEthersSigner.getAddress();

  const message = "Sign with Capsule PreGen and Capsule Ethers Signer";

  const signMessageResult = await capsuleEthersSigner.signMessage(message);

  const demoTx: TransactionRequest = {
    to: address,
    value: ethers.parseEther("0.01"),
    nonce: await provider.getTransactionCount(address),
    gasLimit: 21000,
    gasPrice: (await provider.getFeeData()).gasPrice,
  };

  const signTxResult = await capsuleEthersSigner.signTransaction(demoTx);

  return new Response(JSON.stringify({ route: "signWithEthers", signMessageResult, signTxResult }), { status: 200 });
};
