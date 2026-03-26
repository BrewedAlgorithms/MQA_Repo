import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SafetyVerification() {
  const navigate = useNavigate();

  return (
    <div className="bg-background text-on-background font-body min-h-screen flex flex-col selection:bg-primary/30 relative">
      {/* Subtle "Proceed" button just to trigger navigation for our specific sequence */}
      <button 
        onClick={() => navigate('/workflow')}
        className="fixed top-8 right-8 z-50 bg-primary/10 border border-primary/30 text-primary px-6 py-2 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-primary/20 transition-colors"
      >
        Proceed to Workflow &rarr;
      </button>

      {/* HUD Header */}
      <header className="w-full px-8 pt-10 pb-4">
        <div className="max-w-5xl mx-auto">
          <span className="text-4xl font-bold text-primary tracking-[0.2em] font-headline">NQA</span>
          <div className="h-[1px] w-12 bg-primary/40 mt-2"></div>
        </div>
      </header>

      {/* Main Content Area: Safety Checklist */}
      <main className="flex-grow flex flex-col px-6 md:px-20 py-10 max-w-5xl mx-auto w-full">
        {/* Header Section */}
        <div className="mb-12">
          <h1 className="font-headline text-4xl font-bold text-primary tracking-tight mb-2">Safety Verification</h1>
          <p className="text-on-surface-variant text-lg">System check required before terminal activation.</p>
        </div>

        {/* Checklist Canvas */}
        <div className="space-y-6 flex-grow">
          {/* Item 1: Gloves (READY) */}
          <div className="bg-surface-container-low p-8 flex items-center justify-between border-l-2 border-primary/30">
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 bg-surface-container-highest flex items-center justify-center rounded-lg">
                <span className="material-symbols-outlined text-4xl text-primary" data-icon="front_hand">front_hand</span>
              </div>
              <div>
                <h2 className="text-2xl font-headline font-semibold text-on-surface">Gloves</h2>
                <p className="text-on-surface-variant font-medium">Tactile protection confirmed</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold tracking-widest text-primary uppercase">READY</span>
              <div className="w-12 h-12 bg-primary-container/10 flex items-center justify-center rounded-full">
                <span className="material-symbols-outlined text-primary" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
            </div>
          </div>

          {/* Item 2: Safety Glasses (READY) */}
          <div className="bg-surface-container-low p-8 flex items-center justify-between border-l-2 border-primary/30">
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 bg-surface-container-highest flex items-center justify-center rounded-lg">
                <span className="material-symbols-outlined text-4xl text-primary" data-icon="visibility">visibility</span>
              </div>
              <div>
                <h2 className="text-2xl font-headline font-semibold text-on-surface">Safety glasses</h2>
                <p className="text-on-surface-variant font-medium">Optical shielding detected</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold tracking-widest text-primary uppercase">READY</span>
              <div className="w-12 h-12 bg-primary-container/10 flex items-center justify-center rounded-full">
                <span className="material-symbols-outlined text-primary" data-icon="check_circle" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
            </div>
          </div>

          {/* Item 3: Mask (MISSING) */}
          <div className="bg-surface-container-high p-8 flex items-center justify-between ring-1 ring-error/20 border-l-2 border-error animate-pulse-slow">
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 bg-error-container/10 flex items-center justify-center rounded-lg">
                <span className="material-symbols-outlined text-4xl text-error" data-icon="mask">masks</span>
              </div>
              <div>
                <h2 className="text-2xl font-headline font-semibold text-on-surface">Mask</h2>
                <p className="text-error font-medium">Respiratory filter not detected</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold tracking-widest text-error uppercase">MISSING</span>
              <div className="w-12 h-12 bg-error-container/20 flex items-center justify-center rounded-full">
                <span className="material-symbols-outlined text-error" data-icon="cancel" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
              </div>
            </div>
          </div>
        </div>

        {/* HUD Footer Metadata */}
        <footer className="mt-12 pt-8 border-t border-outline-variant/20 flex justify-between items-center text-[10px] uppercase tracking-[0.3em] text-on-surface-variant/40 font-headline">
          <span>Automated Monitoring Active</span>
          <span>Scanning...</span>
        </footer>
      </main>
    </div>
  );
}
