import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SystemAuditLogs from './components/SystemAuditLogs/SystemAuditLogs';
import AdminDashboard from './components/AdminDashboard/AdminDashboard';
import SopProcessor from './components/SopProcessor/SopProcessor';
import ManageStations from './components/ManageStations/ManageStations';

function App() {
  const [currentScreen, setCurrentScreen] = useState('admin_dashboard');
  const [auditInitialSeverity, setAuditInitialSeverity] = useState(null);

  function viewIncidentLogs() {
    setAuditInitialSeverity('critical');
    setCurrentScreen('audit_logs');
  }

  function handleSetScreen(screen) {
    if (screen !== 'audit_logs') setAuditInitialSeverity(null);
    setCurrentScreen(screen);
  }

  return (
    <div className="bg-background text-on-surface font-body selection:bg-primary selection:text-on-primary min-h-screen flex">
      <Sidebar currentScreen={currentScreen} setCurrentScreen={handleSetScreen} />
      <main className="ml-64 flex-grow flex flex-col min-h-screen">
        <Header />
        {currentScreen === 'admin_dashboard' && <AdminDashboard onViewIncidents={viewIncidentLogs} />}
        {currentScreen === 'sop_processor' && <SopProcessor />}
        {currentScreen === 'manage_stations' && <ManageStations />}
        {currentScreen === 'audit_logs' && <SystemAuditLogs initialSeverity={auditInitialSeverity} />}
      </main>
    </div>
  );
}

export default App;
