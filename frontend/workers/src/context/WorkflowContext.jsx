import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WorkflowContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export function WorkflowProvider({ children }) {
  const [config, setConfig] = useState({
    steps: [],
    stationName: '',
    stationId: '',
    isHc: true,
  });

  const [currentStepId, setCurrentStepId] = useState(1);
  const [isWorkflowCompleted, setIsWorkflowCompleted] = useState(false);

  // True while a pipeline SSE connection is active and healthy.
  // When true, the legacy /dev polling is suppressed to avoid conflicts.
  const [pipelineActive, setPipelineActive] = useState(false);

  // Local safety toast — triggered programmatically by HC schedule or pipeline SSE
  const [localToast, setLocalToast] = useState({ message: null, ts: null });
  const triggerSafetyToast = useCallback((message) => {
    setLocalToast({ message, ts: Date.now().toString() });
  }, []);

  const configureWorkflow = useCallback((steps, stationName, isHc, stationId = '') => {
    setConfig({ steps, stationName, stationId, isHc });
    setCurrentStepId(1);
    setIsWorkflowCompleted(false);
    setPipelineActive(false);
  }, []);

  const resetWorkflow = useCallback(() => {
    setCurrentStepId(1);
    setIsWorkflowCompleted(false);
    setPipelineActive(false);
  }, []);

  // ── Pipeline SSE (non-HC, when stationId is known) ────────────────────────
  // Connects to /api/stations/{id}/pipeline/events.
  // Drives step progression and safety toasts when the AI pipeline is running.
  // Falls back gracefully (pipelineActive stays false) when the pipeline is
  // not started, allowing the /dev polling below to take over.
  useEffect(() => {
    if (config.isHc || !config.stationId || config.steps.length === 0) return;

    let es = null;
    let retryTimer = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      es = new EventSource(
        `${API_URL}/api/stations/${config.stationId}/pipeline/events`
      );

      es.onopen = () => {
        if (cancelled) { es.close(); return; }
        setPipelineActive(true);
      };

      es.onmessage = (event) => {
        if (cancelled) return;
        try {
          const item = JSON.parse(event.data);

          if (item.type === 'checklist') {
            const currentItem = item.items.find(i => i.status === 'current');
            const allDone = item.items.length > 0 &&
              item.items.every(i => i.status === 'done');

            if (allDone) {
              setCurrentStepId(config.steps.length);
              setIsWorkflowCompleted(true);
            } else if (currentItem) {
              // item.index is 0-based; step IDs are 1-based
              setCurrentStepId(currentItem.index + 1);
              setIsWorkflowCompleted(false);
            }
          } else if (item.type === 'gpt') {
            // Safety alert from AI: show toast if the worker is missing PPE
            if (item.parsed?.safety_ok === false && item.parsed?.safety_msg) {
              setLocalToast({ message: item.parsed.safety_msg, ts: Date.now().toString() });
            }
            // Also sync completion state from SOPState
            if (item.state?.all_done) {
              setCurrentStepId(config.steps.length);
              setIsWorkflowCompleted(true);
            }
          } else if (item.type === 'end') {
            // Pipeline stopped (video ended or worker stopped)
            setPipelineActive(false);
            es.close();
            // Retry in 5 s in case it restarts
            if (!cancelled) retryTimer = setTimeout(connect, 5000);
          }
        } catch { /* ignore malformed events */ }
      };

      es.onerror = () => {
        if (cancelled) return;
        // Pipeline not running (404) or network error → fall back to dev polling
        setPipelineActive(false);
        es.close();
        if (!cancelled) retryTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (es) es.close();
      setPipelineActive(false);
    };
  }, [config]);

  // ── Legacy /dev polling (non-HC, fallback when pipeline is not active) ────
  // Used when: pipeline has not been started, or pipeline stopped unexpectedly.
  // Also useful for manual step overrides during development.
  useEffect(() => {
    if (config.isHc || !config.stationName || config.steps.length === 0) return;
    if (pipelineActive) return; // pipeline SSE is driving step updates

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
  }, [config, pipelineActive]);

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
      resetWorkflow,
      triggerSafetyToast,
      localToast,
      isHc: config.isHc,
      stationName: config.stationName,
      pipelineActive,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  return useContext(WorkflowContext);
}
