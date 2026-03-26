import React from 'react';
import TopTitle from '../components/TopTitle';
import LiveFeedPopup from '../components/LiveFeedPopup';
import ProcessList from '../components/ProcessList';
import MainCarousel from '../components/MainCarousel';
import AgentListening from '../components/AgentListening';
import SafetyAlertModal from '../components/SafetyAlertModal';
import { useNavigate } from 'react-router-dom';

export default function WorkflowWarning() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
      <SafetyAlertModal />

      {/* Navigation to restart loop */}
      <button 
        onClick={() => navigate('/')}
        className="fixed top-8 right-8 z-[150] bg-surface-container-high border border-white/10 px-6 py-2 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-surface-bright transition-colors text-white"
      >
        &#8634; Restart
      </button>

      {/* Dimmed Background Content */}
      <div className="flex-grow flex flex-col opacity-40">
        <TopTitle />
        <LiveFeedPopup />
        <ProcessList />
        <MainCarousel />
        <AgentListening />
      </div>
    </div>
  );
}
