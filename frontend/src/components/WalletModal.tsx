import { useConnect, useDisconnect, useAccount } from "wagmi";

interface Props {
  onClose: () => void;
}

const WALLET_ICONS: Record<string, string> = {
  "MetaMask": "🦊",
  "Injected": "💼",
  "OKX Wallet": "⭕",
  "Coinbase Wallet": "🔵",
  "WalletConnect": "🔗",
  "Brave Wallet": "🦁",
  "Rabby Wallet": "🐰",
  "Trust Wallet": "🛡️",
};

export function WalletModal({ onClose }: Props) {
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected, address, connector: activeConnector } = useAccount();

  const seen = new Set<string>();
  const uniqueConnectors = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-70" onClick={onClose} />
      <div className="relative z-10 bg-terminal-surface border border-terminal-border rounded-lg p-4 w-80 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-terminal-text">CONNECT WALLET</h2>
          <button className="text-terminal-muted hover:text-terminal-text font-mono text-xs" onClick={onClose}>✕</button>
        </div>

        {isConnected && address ? (
          <div className="space-y-3">
            <div className="border border-terminal-green border-opacity-30 rounded p-3 bg-terminal-green bg-opacity-5">
              <p className="data-label mb-1">CONNECTED</p>
              <p className="text-xs font-mono text-terminal-green break-all">{address}</p>
              {activeConnector && (
                <p className="text-xs font-mono text-terminal-muted mt-1">via {activeConnector.name}</p>
              )}
            </div>
            <button
              className="btn-secondary w-full"
              onClick={() => { disconnect(); onClose(); }}
            >
              DISCONNECT
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-mono text-terminal-muted mb-3">
              Choose your wallet to connect to AgentPilot
            </p>
            {uniqueConnectors.map((connector) => (
              <button
                key={connector.id}
                className="w-full flex items-center gap-3 border border-terminal-border rounded p-2.5 hover:border-terminal-green hover:bg-terminal-green hover:bg-opacity-5 transition-colors"
                onClick={() => { connect({ connector }); onClose(); }}
                disabled={isPending}
              >
                <span className="text-lg">{WALLET_ICONS[connector.name] || "🔐"}</span>
                <span className="text-xs font-mono text-terminal-text">{connector.name}</span>
                {connector.name === "Injected" && (
                  <span className="text-xs font-mono text-terminal-muted ml-auto">Browser wallet</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
