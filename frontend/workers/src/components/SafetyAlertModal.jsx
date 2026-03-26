import React from 'react';

export default function SafetyAlertModal() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop with blur and darkening */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>

      {/* Modal Content */}
      <div className="relative w-full max-w-2xl bg-surface-container-high border-2 border-red-500 rounded-2xl p-10 modal-glow flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
        <div className="mb-6 flex items-center justify-center w-24 h-24 rounded-full bg-red-500/10 border-2 border-red-500/40">
          <span className="material-symbols-outlined text-red-500 text-6xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
        </div>
        <h2 className="font-headline text-4xl font-bold text-red-500 uppercase tracking-tighter mb-4">Safety Violation Detected</h2>
        <p className="text-xl text-on-surface leading-relaxed max-w-lg mb-8">
          Please ensure you are wearing your <span className="text-red-400 font-bold">safety mask</span> and <span className="text-red-400 font-bold">gloves</span> before continuing the assembly process.
        </p>
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-6 py-3 rounded-full">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-red-400">Scanning for PPE...</span>
        </div>
      </div>
    </div>
  );
}
