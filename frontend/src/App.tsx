import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PixelTerminalDock from './components/ThreeUIPixelTerminal/PixelTerminalDock';
import Overview from './pages/Overview';
import Playground from './pages/Playground';
import EvaluationCenter from './pages/EvaluationCenter';
import DatasetManager from './pages/DatasetManager';
import RegressionTesting from './pages/RegressionTesting';
import SafetyTesting from './pages/SafetyTesting';
import ModelComparison from './pages/ModelComparison';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        {/* ThreeUI Animated Top Dock - Pixel Terminal Navigation */}
        <PixelTerminalDock
          pixelSize={4}
          levels={7}
          noise={1.0}
          scanlines={0.32}
          speed={1.0}
          proximity={132}
          widthGrowth={54}
        />

        <main className="main-content">
          <Routes>
            {/* Primary 5 Docks */}
            <Route path="/" element={<Overview />} />
            <Route path="/playground" element={<Playground />} />
            <Route path="/evaluations" element={<EvaluationCenter />} />
            <Route path="/evaluation" element={<EvaluationCenter />} />
            <Route path="/evaluations/:runId" element={<EvaluationCenter />} />
            <Route path="/evaluation/:runId" element={<EvaluationCenter />} />
            <Route path="/regression" element={<RegressionTesting />} />
            <Route path="/regression/:comparisonId" element={<RegressionTesting />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/:runId" element={<Reports />} />

            {/* Secondary Modules */}
            <Route path="/datasets" element={<DatasetManager />} />
            <Route path="/datasets/:datasetId" element={<DatasetManager />} />
            <Route path="/safety" element={<SafetyTesting />} />
            <Route path="/safety/:runId" element={<SafetyTesting />} />
            <Route path="/compare" element={<ModelComparison />} />
            <Route path="/models" element={<ModelComparison />} />
            <Route path="/settings" element={<Settings />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
