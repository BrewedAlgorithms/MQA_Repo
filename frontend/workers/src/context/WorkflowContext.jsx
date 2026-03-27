import React, { createContext, useContext, useState } from 'react';
import { steps as workflowSteps } from '../data/hc_vid1.json';

const WorkflowContext = createContext();

export function WorkflowProvider({ children }) {
  const [currentStepId, setCurrentStepId] = useState(1);


  const currentStepData = workflowSteps.find(s => s.id === currentStepId);

  return (
    <WorkflowContext.Provider value={{
      currentStepId,
      setCurrentStepId,
      currentStepData,
      totalSteps: workflowSteps.length,
      workflowSteps
    }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  return useContext(WorkflowContext);
}
