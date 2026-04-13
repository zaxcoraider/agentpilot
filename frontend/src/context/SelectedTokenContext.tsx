import { createContext, useContext, useState, ReactNode } from "react";

interface SelectedToken {
  address: string;
  symbol: string;
  name: string;
  price: number;
}

interface SelectedTokenContextValue {
  selectedToken: SelectedToken | null;
  setSelectedToken: (token: SelectedToken | null) => void;
}

const SelectedTokenContext = createContext<SelectedTokenContextValue>({
  selectedToken: null,
  setSelectedToken: () => {},
});

export function SelectedTokenProvider({ children }: { children: ReactNode }) {
  const [selectedToken, setSelectedToken] = useState<SelectedToken | null>(null);
  return (
    <SelectedTokenContext.Provider value={{ selectedToken, setSelectedToken }}>
      {children}
    </SelectedTokenContext.Provider>
  );
}

export function useSelectedToken() {
  return useContext(SelectedTokenContext);
}
