import { useState } from 'react';
import type { Complex } from './core';
import { SmithChart } from './chart/SmithChart';
import { Readout } from './components/Readout';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { useTheme } from './components/useTheme';
import './App.css';

export function App() {
  const [themePreference, , setThemePreference] = useTheme();
  const [showImpedanceGrid, setShowImpedanceGrid] = useState(true);
  const [showAdmittanceGrid, setShowAdmittanceGrid] = useState(false);
  const [cursor, setCursor] = useState<Complex | null>(null);

  return (
    <div className="workspace">
      <header className="toolbar">
        <h1 className="brand">
          Smith<span>Lab</span>
        </h1>
        <div className="toolbar-group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showImpedanceGrid}
              onChange={(e) => setShowImpedanceGrid(e.target.checked)}
            />
            <span className="swatch swatch-z" /> Impedance grid
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showAdmittanceGrid}
              onChange={(e) => setShowAdmittanceGrid(e.target.checked)}
            />
            <span className="swatch swatch-y" /> Admittance grid
          </label>
        </div>
        <ThemeSwitcher value={themePreference} onChange={setThemePreference} />
      </header>

      <main className="stage">
        <div className="chart-frame">
          <SmithChart
            showImpedanceGrid={showImpedanceGrid}
            showAdmittanceGrid={showAdmittanceGrid}
            cursor={cursor}
            onCursorChange={setCursor}
          />
        </div>
        <aside className="sidebar">
          <Readout gamma={cursor} />
        </aside>
      </main>
    </div>
  );
}
