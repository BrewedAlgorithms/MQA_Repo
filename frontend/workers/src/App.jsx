import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SafetyVerification from './pages/SafetyVerification';
import WorkflowHUD from './pages/WorkflowHUD';
import WorkflowWarning from './pages/WorkflowWarning';
import { WorkflowProvider } from './context/WorkflowContext';

export default function App() {
  return (
    <WorkflowProvider>
      <BrowserRouter>
        <Routes>
          {/* Sequence 1: The starting screen */}
          <Route path="/" element={<SafetyVerification />} />
          
          {/* Sequence 2: The carousel */}
          <Route path="/workflow" element={<WorkflowHUD />} />
          
          {/* Sequence 3: The warning overlay */}
          <Route path="/warning" element={<WorkflowWarning />} />
        </Routes>
      </BrowserRouter>
    </WorkflowProvider>
  );
}
