import React, { useState, useEffect, useRef } from 'react';
import StepTracker from './StepTracker';
import { useWorkflow } from '../context/WorkflowContext';

export default function MainCarousel() {
  const { currentStepId, workflowSteps, totalSteps, isWorkflowCompleted, aiAction, aiMode } = useWorkflow();

  // ── Typing animation for AI action text ──────────────────────────────────
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const prevActionRef = useRef('');

  useEffect(() => {
    if (!aiAction || aiAction === prevActionRef.current) return;
    prevActionRef.current = aiAction;
    setIsTyping(true);
    setDisplayedText('');

    let i = 0;
    const chars = aiAction.split('');
    const timer = setInterval(() => {
      i++;
      setDisplayedText(chars.slice(0, i).join(''));
      if (i >= chars.length) {
        clearInterval(timer);
        setIsTyping(false);
      }
    }, 20); // fast typing speed

    return () => clearInterval(timer);
  }, [aiAction]);

  const prevStepData = currentStepId > 1 ? workflowSteps[currentStepId - 2] : null;
  const currentStepData = workflowSteps[currentStepId - 1];
  const nextStepData = currentStepId < totalSteps ? workflowSteps[currentStepId] : null;

  return (
    <main className="flex-grow flex flex-col items-center justify-center relative px-4 mt-20">
      {/* Carousel Container */}
      <div className="relative w-full max-w-6xl flex items-center justify-center gap-0 md:gap-8 h-[550px]">
        

        {/* Left Card (Previous) */}
        {prevStepData ? (
          <div key={`prev-${currentStepId}`} className="animate-slide-fade hidden md:flex flex-col shrink-0 w-64 h-80 bg-surface-container-low rounded-xl opacity-30 -translate-x-8 scale-90 p-6 relative overflow-hidden border-2 border-emerald-500/50">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Step {prevStepData.id}</span>
              <span className="material-symbols-outlined text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <h3 className="font-headline text-lg mb-2 text-emerald-100">{prevStepData.title}</h3>
            <div className="flex-grow bg-surface-container rounded-lg mb-4 flex items-center justify-center p-4 text-center">
               <span className="text-emerald-100/40 text-[10px] uppercase font-bold tracking-widest truncate">{prevStepData.instructions[0]}</span>
            </div>
            <div className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Completed</div>
          </div>
        ) : (
          <div className="hidden md:block shrink-0 w-64 h-80 opacity-0 -translate-x-8 scale-90"></div>
        )}

        {/* Center Card (Active) */}
        <div key={`active-${currentStepId}`} className={`animate-slide-fade z-20 w-full max-w-lg md:w-[520px] h-full bg-surface-container-high rounded-xl p-8 flex flex-col border-2 relative overflow-hidden ${isWorkflowCompleted ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'card-glow-active border-primary/40'}`}>
          <div className="absolute top-0 left-0 w-full h-1.5 bg-surface-container-lowest">
            <div 
              className={`h-full transition-all duration-500 ${isWorkflowCompleted ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-primary shadow-[0_0_12px_rgba(165,200,255,0.5)]'}`} 
              style={{ width: `${isWorkflowCompleted ? 100 : (currentStepId / totalSteps) * 100}%` }}
            ></div>
          </div>
          
          <div className="flex justify-between items-start mb-6 mt-4">
            <div>
              <span className={`text-sm font-bold uppercase tracking-[0.2em] ${isWorkflowCompleted ? 'text-emerald-400' : 'text-primary'}`}>Step {currentStepId} of {totalSteps}</span>
              <h2 className="text-3xl font-headline text-on-surface mt-1">{currentStepData.title}</h2>
            </div>
            <div className={`${isWorkflowCompleted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-primary-container/20 text-primary border-primary/20'} border px-4 py-1.5 rounded-full flex items-center gap-2`}>
              <span className={`w-2 h-2 rounded-full ${isWorkflowCompleted ? 'bg-emerald-500' : 'bg-primary animate-pulse'}`}></span>
              <span className="text-xs font-bold tracking-widest uppercase">{isWorkflowCompleted ? 'Completed' : 'In Progress'}</span>
            </div>
          </div>

          <div className="flex-grow relative flex items-center justify-center mb-4">
            <span className="font-headline font-bold text-primary select-none leading-none text-8xl">
              {currentStepId < 10 ? `0${currentStepId}` : currentStepId}
            </span>
          </div>

          <div className="text-center flex-grow flex flex-col items-center justify-center mb-0 gap-4">
            {currentStepData.instructions.map((inst, idx) => (
              <p key={idx} className="font-bold text-on-surface leading-tight text-xl md:text-2xl">
                {inst}
              </p>
            ))}
          </div>

          {/* Safety requirements */}
          {currentStepData.safety?.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 pt-4 border-t border-white/5">
              {currentStepData.safety.map(item => (
                <span key={item} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-widest">
                  <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                  {item}
                </span>
              ))}
            </div>
          )}

          {/* AI Action Bar */}
          {aiMode && displayedText && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
                <span
                  className="material-symbols-outlined text-primary text-lg flex-shrink-0 mt-0.5"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >smart_toy</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary/60 mb-1">AI Action</p>
                  <p className="text-sm text-on-surface/90 leading-relaxed">
                    {displayedText}
                    {isTyping && <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Card (Next) */}
        {nextStepData ? (
          <div key={`next-${currentStepId}`} className="animate-slide-fade hidden md:flex flex-col shrink-0 w-64 h-80 bg-surface-container-low rounded-xl opacity-30 translate-x-8 scale-90 p-6 relative overflow-hidden border border-white/5">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Step {nextStepData.id}</span>
              <span className="material-symbols-outlined text-on-surface-variant">lock</span>
            </div>
            <h3 className="font-headline text-lg mb-2 text-on-surface">{nextStepData.title}</h3>
            <div className="flex-grow bg-surface-container rounded-lg mb-4 flex items-center justify-center p-4 text-center grayscale opacity-50">
               <span className="text-on-surface-variant/40 text-[10px] uppercase font-bold tracking-widest truncate">{nextStepData.instructions[0]}</span>
            </div>
            <div className="text-on-surface-variant/40 text-sm font-bold uppercase tracking-wider">Locked</div>
          </div>
        ) : (
          <div className="hidden md:block shrink-0 w-64 h-80 opacity-0 translate-x-8 scale-90"></div>
        )}


      </div>

      <StepTracker />
    </main>
  );
}
