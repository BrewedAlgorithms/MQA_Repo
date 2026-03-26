import React from 'react';

export default function AgentListening() {
  return (
    <div className="fixed bottom-10 right-10 flex flex-col items-end gap-3 z-50">
      <div className="flex items-end gap-1 px-4 h-8">
        <div className="wave-bar w-1 bg-primary/80 rounded-full" style={{ animationDelay: '0.1s' }}></div>
        <div className="wave-bar w-1 bg-primary/60 rounded-full" style={{ animationDelay: '0.3s', height: '12px' }}></div>
        <div className="wave-bar w-1 bg-primary/90 rounded-full" style={{ animationDelay: '0.2s', height: '18px' }}></div>
        <div className="wave-bar w-1 bg-primary/70 rounded-full" style={{ animationDelay: '0.4s', height: '14px' }}></div>
        <div className="wave-bar w-1 bg-primary/50 rounded-full" style={{ animationDelay: '0.15s', height: '10px' }}></div>
        <div className="wave-bar w-1 bg-primary/90 rounded-full" style={{ animationDelay: '0.35s', height: '20px' }}></div>
      </div>
      <div className="bg-surface-container-high border border-primary/20 w-10 h-10 rounded-full flex items-center justify-center shadow-xl">
        <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
      </div>
    </div>
  );
}
