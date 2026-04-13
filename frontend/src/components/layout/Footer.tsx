export function Footer() {
  return (
    <footer className="border-t border-terminal-border bg-terminal-bg px-4 py-1.5 flex items-center justify-between">
      <span className="text-xs font-mono text-terminal-muted">
        Autonomous DeFi agent infrastructure on{" "}
        <span className="text-terminal-green">X Layer</span>
      </span>
      <span className="text-xs font-mono text-terminal-muted">
        <span className="text-terminal-green">OKX OnchainOS</span>
        {" · "}
        <span className="text-terminal-cyan">Uniswap V4</span>
        {" · "}
        <span className="text-terminal-cyan">x402</span>
        {" · "}
        <span className="text-terminal-muted">MCP</span>
      </span>
    </footer>
  );
}
