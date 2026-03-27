import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WorkflowContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export function WorkflowProvider({ children }) {
  const [config, setConfig] = useState({
    steps: [],
    stationName: '',
    isHc: true,
  });

  const [currentStepId, setCurrentStepId] = useState(1);
  const [isWorkflowCompleted, setIsWorkflowCompleted] = useState(false);

  // Local safety toast — triggered programmatically by HC schedule
  const [localToast, setLocalToast] = useState({ message: null, ts: null });
  const triggerSafetyToast = useCallback((message) => {
    setLocalToast({ message, ts: Date.now().toString() });
  }, []);

  const configureWorkflow = useCallback((steps, stationName, isHc) => {
    setConfig({ steps, stationName, isHc });
    setCurrentStepId(1);
    setIsWorkflowCompleted(false);
  }, []);

  // Non-HC: poll /dev/{stationName}/step every second
  useEffect(() => {
    if (config.isHc || !config.stationName || config.steps.length === 0) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_URL}/dev/${encodeURIComponent(config.stationName)}/step`
        );
        if (res.ok) {
          const { step } = await res.json();
          const clamped = Math.min(Math.max(1, step), config.steps.length);
          setCurrentStepId(clamped);
          setIsWorkflowCompleted(step > config.steps.length);
        }
      } catch { /* keep last known step */ }
    };

    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [config]);

  const currentStepData = config.steps.find(s => s.id === currentStepId) ?? null;

  return (
    <WorkflowContext.Provider value={{
      currentStepId,
      setCurrentStepId,
      currentStepData,
      isWorkflowCompleted,
      setIsWorkflowCompleted,
      totalSteps: config.steps.length,
      workflowSteps: config.steps,
      configureWorkflow,
      triggerSafetyToast,
      localToast,
      isHc: config.isHc,
      stationName: config.stationName,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  return useContext(WorkflowContext);
}
