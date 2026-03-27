import React, { useRef, useState } from 'react';
import { useWorkflow } from '../context/WorkflowContext';

export default function LiveFeedPopup() {
  const { currentStepId, setCurrentStepId, workflowSteps, setIsWorkflowCompleted } = useWorkflow();
  const videoRef = useRef(null);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState('0:00');

  const timeToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const [minutes, seconds] = timeStr.split(':').map(Number);
    return minutes * 60 + seconds;
  };

  const formatSeconds = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const currentTime = videoRef.current.currentTime;
    setCurrentTimeDisplay(formatSeconds(currentTime));
    
    // Find the current active step based only on endTimes
    // A step is active if currentTime is less than its endTime
    // and it's the first such step.
    const targetStep = workflowSteps.find(s => currentTime < timeToSeconds(s.endTime));

    if (targetStep) {
      setIsWorkflowCompleted(false);
      if (targetStep.id !== currentStepId) {
        setCurrentStepId(targetStep.id);
      }
    } else {
      // If we are past the last step's endTime
      setIsWorkflowCompleted(true);
      if (currentStepId !== workflowSteps.length) {
        setCurrentStepId(workflowSteps.length);
      }
    }
  };

  return (
    <div className="fixed top-8 left-8 z-50 w-72 h-48 bg-surface-container-high rounded-xl border border-white/10 overflow-hidden shadow-2xl group">

      <video 
        ref={videoRef}
        autoPlay 
        loop 
        muted 
        playsInline
        onTimeUpdate={handleTimeUpdate}
        className="w-full h-full object-cover transition-all duration-700"
      >
        <source src="/1.mp4" type="video/mp4" />
      </video>
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <div className="w-2 h-2 bg-error rounded-full animate-pulse"></div>
        <span className="text-[10px] font-bold tracking-widest text-white uppercase drop-shadow-md">Unit 01 - Cam A</span>
      </div>
      
      {/* Running Clock */}
      <div className="absolute top-3 right-3 z-20 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
        <span className="text-[10px] font-mono font-bold text-white tracking-widest">{currentTimeDisplay}</span>
      </div>

      <div className="absolute bottom-3 right-3 z-20">
        <span className="text-[10px] font-mono text-primary/80">24fps // 1080p</span>
      </div>
    </div>
  );
}
