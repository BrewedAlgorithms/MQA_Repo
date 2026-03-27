import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WorkflowContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const AI_URL  = import.meta.env.VITE_AI_URL  || 'http://localhost:8000';

export function WorkflowProvider({ children }) {
  const [config, setConfig] = useState({
    steps: [],
    stationName: '',
    isHc: true,
  });

  const [currentStepId, setCurrentStepId] = useState(1);
  const [isWorkflowCompleted, setIsWorkflowCompleted] = useState(false);

  // AI SSE mode — active when FINAL_QC_ASSEMBLY station sends SOP to AI
  const [aiMode, setAiMode] = useState(false);
  const enableAiMode = useCallback(() => setAiMode(true), []);

  // Keep refs so SSE listeners always see the latest values without stale closures
  const totalStepsRef = useRef(0);
  useEffect(() => { totalStepsRef.current = config.steps.length; }, [config.steps.length]);

  const currentStepIdRef = useRef(1);
  useEffect(() => { currentStepIdRef.current = currentStepId; }, [currentStepId]);

  // Local safety toast — triggered programmatically by HC schedule or AI SSE
  const [localToast, setLocalToast] = useState({ message: null, ts: null });
  const triggerSafetyToast = useCallback((message) => {
    setLocalToast({ message, ts: Date.now().toString() });
  }, []);

  const configureWorkflow = useCallback((steps, stationName, isHc) => {
    setConfig({ steps, stationName, isHc });
    setCurrentStepId(1);
    setIsWorkflowCompleted(false);
  }, []);

  // AI SSE: when aiMode is active, open EventSource to AI /stream
  useEffect(() => {
    if (!aiMode) return;

    const es = new EventSource(`${AI_URL}/stream`);

    es.addEventListener('current_step', (e) => {
      const step = parseInt(e.data, 10);
      if (isNaN(step)) return;

      const total = totalStepsRef.current;
      const next  = total > 0 && step > total ? total : Math.max(1, step);

      if (next === currentStepIdRef.current) return;

      if (total > 0 && step > total) {
        setIsWorkflowCompleted(true);
      } else {
        setIsWorkflowCompleted(false);
      }
      setCurrentStepId(next);
    });

    es.addEventListener('safety_err', (e) => {
      if (e.data?.trim()) triggerSafetyToast(e.data.trim());
    });

    return () => es.close();
  }, [aiMode]);

  // Non-HC: poll /dev/{stationName}/step every second (skipped when AI SSE is active)
  useEffect(() => {
    if (config.isHc || !config.stationName || config.steps.length === 0 || aiMode) return;

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
  }, [config, aiMode]);

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
      aiMode,
      enableAiMode,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  return useContext(WorkflowContext);
}
