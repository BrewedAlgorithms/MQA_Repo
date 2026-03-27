import React from 'react';
import { useWorkflow } from '../context/WorkflowContext';

export default function StepTracker() {
  const { currentStepId, workflowSteps } = useWorkflow();

  return (
    <div className="mt-12 flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        {workflowSteps.map(step => {
          const isCompleted = step.id < currentStepId;
          const isActive = step.id === currentStepId;
          const isPending = step.id > currentStepId;
          const label = step.id < 10 ? `0${step.id}` : `${step.id}`;

          if (isCompleted) {
            return (
              <div key={step.id} className="w-10 h-10 border-2 border-emerald-500/50 bg-emerald-500/10 rounded flex items-center justify-center transition-all duration-300">
                <span className="material-symbols-outlined text-emerald-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
            );
          }

          if (isActive) {
            return (
              <div key={step.id} className="w-10 h-10 border-2 border-primary bg-primary/20 rounded flex items-center justify-center shadow-[0_0_15px_rgba(165,200,255,0.3)] transition-all duration-300 relative">
                <span className="text-primary font-headline text-xs font-bold">{label}</span>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary"></div>
              </div>
            );
          }

          return (
            <div key={step.id} className="w-10 h-10 border border-white/10 bg-surface-container rounded flex items-center justify-center transition-all opacity-30">
              <span className="text-on-surface-variant font-headline text-xs">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 opacity-40">
        <span className="material-symbols-outlined text-[10px]">auto_awesome</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">AI Managed Workflow Progression</span>
      </div>
    </div>
  );
}
