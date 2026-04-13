import { createConfig, http } from "wagmi";
import { mainnet, arbitrumSepolia, base } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

// X Layer chain (not in wagmi defaults)
const xlayer = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKX Explorer", url: "https://www.okx.com/explorer/xlayer" } },
} as const;

// WalletConnect project ID — get a free one at https://cloud.walletconnect.com
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID || "a83d3e7a3b8c4f9d1e2b5c6a7f8e9d0c";

export const wagmiConfig = createConfig({
  chains: [xlayer, arbitrumSepolia, mainnet, base],
  connectors: [
    injected({ target: "metaMask" }),
    injected(),            // catches OKX Wallet, Rabby, Brave, Trust, etc.
    coinbaseWallet({ appName: "AgentPilot" }),
    walletConnect({ projectId: WC_PROJECT_ID }),
  ],
  transports: {
    [xlayer.id]: http("https://rpc.xlayer.tech"),
    [arbitrumSepolia.id]: http("https://sepolia-rollup.arbitrum.io/rpc"),
    [mainnet.id]: http(),
    [base.id]: http(),
  },
});
