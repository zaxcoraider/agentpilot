import { createContext, useContext, useState, ReactNode } from "react";
import { useAccount } from "wagmi";
import { WalletModal } from "../components/WalletModal";

interface WalletContextValue {
  address: string | null;
  openModal: () => void;
}

const WalletContext = createContext<WalletContextValue>({
  address: null,
  openModal: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <WalletContext.Provider value={{
      address: address ?? null,
      openModal: () => setModalOpen(true),
    }}>
      {children}
      {modalOpen && <WalletModal onClose={() => setModalOpen(false)} />}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
