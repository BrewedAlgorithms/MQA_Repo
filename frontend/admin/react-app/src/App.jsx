import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SystemAuditLogs from './components/SystemAuditLogs/SystemAuditLogs';
import AdminDashboard from './components/AdminDashboard/AdminDashboard';
import SopProcessor from './components/SopProcessor/SopProcessor';
import ManageStations from './components/ManageStations/ManageStations';

function App() {
  const [currentScreen, setCurrentScreen] = useState('admin_dashboard');

  return (
    <div className="bg-background text-on-surface font-body selection:bg-primary selection:text-on-primary min-h-screen flex">
      <Sidebar currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} />
      <main className="ml-64 flex-grow flex flex-col min-h-screen">
        <Header />
        {currentScreen === 'admin_dashboard' && <AdminDashboard />}
        {currentScreen === 'sop_processor' && <SopProcessor />}
        {currentScreen === 'manage_stations' && <ManageStations />}
        {currentScreen === 'audit_logs' && <SystemAuditLogs />}
      </main>
    </div>
  );
}

export default App;
