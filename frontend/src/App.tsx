import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { DiscoverPanel } from "./components/panels/DiscoverPanel";
import { TradePanel } from "./components/panels/TradePanel";
import { ProtectPanel } from "./components/panels/ProtectPanel";
import { EarnPanel } from "./components/panels/EarnPanel";
import { MonitorPanel } from "./components/panels/MonitorPanel";
import { AgentPanel } from "./components/panels/AgentPanel";

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-terminal-bg">
      <Header />

      {/* 6-panel grid */}
      <main className="flex-1 overflow-hidden p-2 grid gap-2" style={{
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr",
      }}>
        <DiscoverPanel />
        <TradePanel />
        <ProtectPanel />
        <EarnPanel />
        <MonitorPanel />
        <AgentPanel />
      </main>

      <Footer />
    </div>
  );
}
