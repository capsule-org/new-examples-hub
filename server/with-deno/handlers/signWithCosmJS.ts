import { Handler } from "@std/http";
import { simulateVerifyToken } from "../utils/auth-utils.ts";
import { Capsule as CapsuleServer, Environment } from "@usecapsule/server-sdk";
import { SigningStargateClient, StdFee, Coin, MsgSendEncodeObject } from "@cosmjs/stargate";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { CapsuleProtoSigner } from "@usecapsule/cosmjs-v0-integration";
import { getKeyShareInDB } from "../db/keySharesDB.ts";
import { decrypt } from "../utils/encryption-utils.ts";

interface RequestBody {
  email: string;
}

export const signWithCosmJS: Handler = async (req: Request): Promise<Response> => {
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

  const capsuleProtoSigner = new CapsuleProtoSigner(capsuleClient, "cosmos");

  const stargateClient = await SigningStargateClient.connectWithSigner(
    "https://rpc-t.cosmos.nodestake.top",
    capsuleProtoSigner
  );

  const toAddress = "cosmos1..."; // Address to send tokens to (replace with real address)

  const fromAddress = capsuleProtoSigner.address;

  const amount: Coin = {
    denom: "uatom",
    amount: "1000",
  };

  const fee: StdFee = {
    amount: [{ denom: "uatom", amount: "500" }],
    gas: "200000",
  };

  const message: MsgSend = {
    fromAddress: fromAddress,
    toAddress: toAddress,
    amount: [amount],
  };

  const demoTxMessage: MsgSendEncodeObject = {
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: message,
  };

  const memo = "Signed with Capsule";

  const signResult = await stargateClient.sign(fromAddress, [demoTxMessage], fee, memo);

  return new Response(JSON.stringify({ route: "signWithCosmJS", signResult }), { status: 200 });
};
