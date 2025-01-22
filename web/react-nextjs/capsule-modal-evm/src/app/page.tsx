"use client";

import { useState } from "react";
import { AuthLayout, ExternalWallet, CapsuleModal } from "@usecapsule/react-sdk";
import { capsule } from "@/client/capsule";
import "@usecapsule/react-sdk/styles.css";

export default function Home() {
  const [isOpen, setIsOpen] = useState(false);
  const [_, setIsConnected] = useState(false);

  const handleOpenModal = () => {
    setIsOpen(true);
  };

  const handleCloseModal = async () => {
    const isFullyLoggedIn = await capsule.isFullyLoggedIn();
    setIsConnected(isFullyLoggedIn);
    setIsOpen(false);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold">Capsule Modal + EVM Wallets Example</h1>
      <p className="max-w-md text-center">
        This minimal example demonstrates how to integrate the Capsule Modal with EVM Wallet Connectors in a Next.js
        (App Router) project.
      </p>
      <button
        onClick={handleOpenModal}
        className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">
        Open Capsule Modal
      </button>

      <CapsuleModal
        capsule={capsule}
        isOpen={isOpen}
        onClose={handleCloseModal}
        disableEmailLogin={true}
        disablePhoneLogin={true}
        authLayout={[AuthLayout.EXTERNAL_FULL]}
        externalWallets={[
          ExternalWallet.METAMASK,
          ExternalWallet.COINBASE,
          ExternalWallet.WALLETCONNECT,
          ExternalWallet.RAINBOW,
          ExternalWallet.ZERION,
          ExternalWallet.RABBY,
        ]}
        onRampTestMode={true}
        theme={{
          foregroundColor: "#2D3648",
          backgroundColor: "#FFFFFF",
          accentColor: "#0066CC",
          darkForegroundColor: "#E8EBF2",
          darkBackgroundColor: "#1A1F2B",
          darkAccentColor: "#4D9FFF",
          mode: "light",
          borderRadius: "none",
          font: "Inter",
        }}
      />
    </main>
  );
}
