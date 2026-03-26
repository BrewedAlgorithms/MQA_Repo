import React from 'react';
import { useWorkflow } from '../context/WorkflowContext';

export default function ProcessList() {
  const { currentStepId, workflowSteps } = useWorkflow();

  return (
    <div className="fixed bottom-10 left-10 z-50 flex flex-col gap-3 p-2">
      {workflowSteps.map(step => {
        const isCompleted = step.id < currentStepId;
        const isActive = step.id === currentStepId;
        const isPending = step.id > currentStepId;

        return (
          <div key={step.id} className={`flex items-center gap-3 ${isPending ? 'opacity-40' : ''} transition-all duration-300`}>
            
            {/* Status Icon Wrapper */}
            {isCompleted && (
              <div className="w-4 h-4 rounded-full border border-emerald-500/50 flex flex-shrink-0 items-center justify-center bg-emerald-500/10">
                <span className="material-symbols-outlined text-emerald-400 text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
              </div>
            )}
            
            {isActive && (
              <div className="w-4 h-4 rounded-full border border-primary flex flex-shrink-0 items-center justify-center bg-primary/20 shadow-[0_0_8px_rgba(165,200,255,0.4)]">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
              </div>
            )}
            
            {isPending && (
              <div className="w-4 h-4 rounded-full border border-white/20 flex flex-shrink-0 items-center justify-center"></div>
            )}

            {/* Step Label */}
            <span className={`text-[10px] font-bold uppercase tracking-widest whitespace-nowrap 
              ${isCompleted ? 'text-emerald-100/60' : ''}
              ${isActive ? 'text-primary' : ''}
              ${isPending ? 'text-on-surface-variant' : ''}
            `}>
              {step.id}. {step.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
