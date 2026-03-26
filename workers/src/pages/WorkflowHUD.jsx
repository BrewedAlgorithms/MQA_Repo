import React from 'react';
import TopTitle from '../components/TopTitle';
import LiveFeedPopup from '../components/LiveFeedPopup';
import ProcessList from '../components/ProcessList';
import MainCarousel from '../components/MainCarousel';
import AgentListening from '../components/AgentListening';
import { useNavigate } from 'react-router-dom';

export default function WorkflowHUD() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#0e0e0e] text-on-surface font-body antialiased min-h-screen flex flex-col overflow-x-hidden select-none relative">
      {/* Navigation aid to proceed to Warning */}
      <button 
        onClick={() => navigate('/warning')}
        className="fixed top-8 right-8 z-50 bg-error/10 border border-error/30 text-error px-6 py-2 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-error/20 transition-colors"
      >
        Trigger Violation &rarr;
      </button>

      <TopTitle />
      <LiveFeedPopup />
      <ProcessList />
      <MainCarousel />
      <AgentListening />
    </div>
  );
}
