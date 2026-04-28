import { NavLink, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { NewScanPage } from "./pages/NewScanPage";
import { ScanDetailPage } from "./pages/ScanDetailPage";
import { ToolsPage } from "./pages/ToolsPage";

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/scans/new" element={<NewScanPage />} />
          <Route path="/scans/:id" element={<ScanDetailPage />} />
          <Route path="/tools" element={<ToolsPage />} />
        </Routes>
      </main>
      <footer className="border-t bg-white py-4 text-center text-xs text-slate-500">
        Security Scanner Hub &middot; Open source SAST/DAST orchestrator
      </footer>
    </div>
  );
}

function Header() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    "px-3 py-1.5 rounded-md text-sm font-medium transition " +
    (isActive
      ? "bg-brand-600 text-white"
      : "text-slate-700 hover:bg-slate-200");

  return (
    <header className="bg-white border-b">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <NavLink to="/" className="font-semibold text-brand-700">
          Sec Scanner Hub
        </NavLink>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/scans/new" className={linkClass}>
            Nieuwe scan
          </NavLink>
          <NavLink to="/tools" className={linkClass}>
            Tools
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
