import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WorkflowHUD from './pages/WorkflowHUD';
import WorkflowWarning from './pages/WorkflowWarning';
import { WorkflowProvider } from './context/WorkflowContext';

export default function App() {
  return (
    <WorkflowProvider>
      <BrowserRouter>
        <Routes>
          {/* Default to Workflow HUD which now handles safety internally */}
          <Route path="/" element={<WorkflowHUD />} />
          <Route path="/workflow" element={<WorkflowHUD />} />
          
          {/* Sequence 3: The warning overlay */}
          <Route path="/warning" element={<WorkflowWarning />} />
        </Routes>
      </BrowserRouter>
    </WorkflowProvider>
  );
}
