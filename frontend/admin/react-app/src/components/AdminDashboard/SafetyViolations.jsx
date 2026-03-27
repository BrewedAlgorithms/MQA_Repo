import React from 'react';

export default function SafetyViolations({ onViewIncidents }) {
  const violations = [
    {
      id: 1, type: 'HELMET MISSING', time: '14:02', 
      desc: 'St_B: Operator ID_104 detected without required head protection.',
      icon: 'warning', iconColor: 'text-tertiary', bgColor: 'bg-error-container/20', borderClass: ''
    },
    {
      id: 2, type: 'STEP 2 MISSING', time: '12:15', 
      desc: 'St_D: Assembly sequence violation - skipping mandated alignment check.',
      icon: 'bolt', iconColor: 'text-secondary', bgColor: 'bg-secondary-container/20', borderClass: 'border-l-2 border-secondary'
    },
    {
      id: 3, type: 'EMERGENCY STOP', time: '09:44', 
      desc: 'St_A: Manual E-Stop triggered by Supervisor ID_002.',
      icon: 'medical_services', iconColor: 'text-tertiary', bgColor: 'bg-error-container/20', borderClass: ''
    }
  ];

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="bg-surface-container-low p-6 flex flex-col col-span-12">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-label text-xs font-bold uppercase tracking-widest text-tertiary">Safety Violations</h3>
          <span className="text-[10px] font-mono text-gray-500">24H Window</span>
        </div>
        <div className="flex-1 space-y-3">
          {violations.map((v) => (
            <div key={v.id} className={`bg-surface-container-high p-3 flex items-start space-x-3 ${v.borderClass}`}>
              <div className={`w-8 h-8 ${v.bgColor} flex items-center justify-center ${v.iconColor}`}>
                <span className="material-symbols-outlined text-sm">{v.icon}</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold uppercase text-white">{v.type}</p>
                  <p className="text-[8px] font-mono text-gray-500">{v.time}</p>
                </div>
                <p className="text-[9px] text-gray-400 mt-1">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onViewIncidents}
          className="mt-4 w-full py-2 bg-surface-container-highest text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">open_in_new</span>
          View Incident Logs
        </button>
      </div>
    </div>
  );
}
