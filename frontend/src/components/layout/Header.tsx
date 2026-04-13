import { useWallet } from "../../context/WalletContext";

export function Header() {
  const { address, openModal } = useWallet();
  const now = new Date();

  return (
    <header className="border-b border-terminal-border bg-terminal-bg px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="AgentPilot" className="w-6 h-6" />
          <span className="font-mono text-xs text-terminal-green tracking-widest">AGENTPILOT</span>
        </div>
        <span className="text-terminal-muted text-xs font-mono hidden sm:block">
          v1.0.0 · X Layer · {now.toUTCString().split(" ").slice(0, 4).join(" ")}
        </span>
      </div>

      <div className="flex-1 text-center hidden md:block">
        <h1 className="text-sm font-semibold text-terminal-text tracking-wide">
          AgentPilot
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-terminal-muted border border-terminal-border rounded px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-terminal-green" />
          <span>X Layer</span>
        </div>
        <button
          className={address ? "btn-secondary flex items-center gap-1" : "btn-primary"}
          onClick={openModal}
        >
          {address ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-terminal-green" />
              {address.slice(0, 6)}...{address.slice(-4)}
            </>
          ) : "CONNECT"}
        </button>
      </div>
    </header>
  );
}
