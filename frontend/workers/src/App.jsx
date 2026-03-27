import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import WorkflowHUD from './pages/WorkflowHUD';
import WorkflowWarning from './pages/WorkflowWarning';
import DevConsole from './pages/DevConsole';
import { WorkflowProvider } from './context/WorkflowContext';

export default function App() {
  return (
    <WorkflowProvider>
      <BrowserRouter>
        <Routes>
          {/* Root redirects to the station directory */}
          <Route path="/" element={<Navigate to="/dev" replace />} />

          {/* Internal dev tool — station directory */}
          <Route path="/dev" element={<DevConsole />} />

          {/* Warning overlay */}
          <Route path="/warning" element={<WorkflowWarning />} />

          {/* Station HUD — one URL per station e.g. /ASSEMBLY_LINE_01 */}
          <Route path="/:stationName" element={<WorkflowHUD />} />
        </Routes>
      </BrowserRouter>
    </WorkflowProvider>
  );
}
