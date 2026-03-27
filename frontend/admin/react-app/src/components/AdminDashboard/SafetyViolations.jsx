import React, { useState, useEffect } from 'react';

// ── Violation generator pool ───────────────────────────────────────────────────
const _V_POOL = [
  { type: 'HELMET MISSING',     icon: 'warning',               iconColor: 'text-tertiary',  bgColor: 'bg-error-container/20',     borderClass: '',                        descTpl: (st, id) => `${st}: Operator ${id} detected without required head protection.` },
  { type: 'STEP SKIPPED',       icon: 'bolt',                  iconColor: 'text-secondary', bgColor: 'bg-secondary-container/20', borderClass: 'border-l-2 border-secondary', descTpl: (st) => `${st}: Assembly sequence violation — skipping mandated alignment check.` },
  { type: 'EMERGENCY STOP',     icon: 'medical_services',      iconColor: 'text-tertiary',  bgColor: 'bg-error-container/20',     borderClass: '',                        descTpl: (st, id) => `${st}: Manual E-Stop triggered by Supervisor ${id}.` },
  { type: 'VEST MISSING',       icon: 'warning',               iconColor: 'text-tertiary',  bgColor: 'bg-error-container/20',     borderClass: '',                        descTpl: (st, id) => `${st}: Operator ${id} entered zone without safety vest.` },
  { type: 'MACHINE GUARD OPEN', icon: 'lock_open',             iconColor: 'text-secondary', bgColor: 'bg-secondary-container/20', borderClass: 'border-l-2 border-secondary', descTpl: (st) => `${st}: Guard panel disengaged during active machine cycle.` },
  { type: 'UNAUTHORIZED ZONE',  icon: 'do_not_disturb_on',     iconColor: 'text-tertiary',  bgColor: 'bg-error-container/20',     borderClass: '',                        descTpl: (st, id) => `${st}: Operator ${id} entered restricted perimeter.` },
  { type: 'GLOVES REQUIRED',    icon: 'back_hand',             iconColor: 'text-secondary', bgColor: 'bg-secondary-container/20', borderClass: 'border-l-2 border-secondary', descTpl: (st, id) => `${st}: Operator ${id} handling chemical without PPE gloves.` },
  { type: 'FIRE HAZARD',        icon: 'local_fire_department', iconColor: 'text-tertiary',  bgColor: 'bg-error-container/20',     borderClass: '',                        descTpl: (st) => `${st}: Flammable material proximity sensor threshold exceeded.` },
  { type: 'GOGGLES MISSING',    icon: 'visibility_off',        iconColor: 'text-secondary', bgColor: 'bg-secondary-container/20', borderClass: 'border-l-2 border-secondary', descTpl: (st, id) => `${st}: Operator ${id} in hazard zone without eye protection.` },
];

const _V_STATIONS = ['St_A', 'St_B', 'St_C', 'St_D', 'St_E', 'St_F'];
const _V_IDS      = ['ID_104', 'ID_201', 'ID_317', 'ID_089', 'ID_445', 'ID_512', 'ID_730'];

let _vNextId = 4;

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateViolation() {
  const tpl  = _pick(_V_POOL);
  const st   = _pick(_V_STATIONS);
  const id   = _pick(_V_IDS);
  const now  = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return {
    id:          _vNextId++,
    type:        tpl.type,
    time,
    desc:        tpl.descTpl(st, id),
    icon:        tpl.icon,
    iconColor:   tpl.iconColor,
    bgColor:     tpl.bgColor,
    borderClass: tpl.borderClass,
  };
}

// ── Initial hardcoded violations (seed data) ──────────────────────────────────
const _INITIAL = [
  { id: 1, type: 'HELMET MISSING',  time: '14:02', desc: 'St_B: Operator ID_104 detected without required head protection.',             icon: 'warning',          iconColor: 'text-tertiary',  bgColor: 'bg-error-container/20',     borderClass: '' },
  { id: 2, type: 'STEP 2 MISSING',  time: '12:15', desc: 'St_D: Assembly sequence violation - skipping mandated alignment check.',       icon: 'bolt',             iconColor: 'text-secondary', bgColor: 'bg-secondary-container/20', borderClass: 'border-l-2 border-secondary' },
  { id: 3, type: 'EMERGENCY STOP',  time: '09:44', desc: 'St_A: Manual E-Stop triggered by Supervisor ID_002.',                          icon: 'medical_services', iconColor: 'text-tertiary',  bgColor: 'bg-error-container/20',     borderClass: '' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function SafetyViolations({ onViewIncidents }) {
  const [violations, setViolations] = useState(_INITIAL);

  // Randomly prepend a new violation every 1–5 seconds, keep latest 5 visible
  useEffect(() => {
    let timer;
    const schedule = () => {
      const delay = (1 + Math.random() * 4) * 1000;
      timer = setTimeout(() => {
        setViolations(prev => [generateViolation(), ...prev].slice(0, 5));
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

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
