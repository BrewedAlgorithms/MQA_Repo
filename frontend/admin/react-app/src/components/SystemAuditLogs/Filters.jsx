import React from 'react';

const SEVERITIES = [
  { value: 'info',     label: 'Info',     activeClass: 'border-on-surface-variant text-on-surface' },
  { value: 'warn',     label: 'Warn',     activeClass: 'border-secondary text-secondary' },
  { value: 'critical', label: 'Critical', activeClass: 'border-error text-error' },
];

export default function Filters({ station, onStationChange, stations = [], severity, onSeverityChange, onReset }) {
  return (
    <section className="bg-surface-container-low p-6 flex flex-wrap gap-6 items-end">
      {/* Station filter */}
      <div className="flex flex-col gap-2 min-w-[220px]">
        <label className="font-label text-[10px] tracking-widest uppercase text-on-surface-variant">
          Station
        </label>
        <select
          value={station}
          onChange={e => onStationChange(e.target.value)}
          className="bg-surface-container-highest border-none text-on-surface font-body text-sm py-2 px-3 focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer"
        >
          <option value="">All Stations</option>
          {stations.map(s => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Event Severity filter */}
      <div className="flex flex-col gap-2">
        <label className="font-label text-[10px] tracking-widest uppercase text-on-surface-variant">
          Event Severity
        </label>
        <div className="flex gap-2">
          {SEVERITIES.map(s => (
            <button
              key={s.value}
              onClick={() => onSeverityChange(severity === s.value ? null : s.value)}
              className={`px-3 py-2 text-xs font-label uppercase border-b-2 transition-colors bg-surface-container-highest hover:bg-surface-bright ${
                severity === s.value
                  ? `${s.activeClass} border-current`
                  : 'text-on-surface-variant border-transparent'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onReset}
        className="bg-surface-bright px-6 py-2 h-[38px] font-label text-[10px] tracking-widest uppercase text-[#8bacff] hover:opacity-80 transition-opacity ml-auto"
      >
        Reset Filters
      </button>
    </section>
  );
}
