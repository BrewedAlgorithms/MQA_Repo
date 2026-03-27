import React from 'react';

export default function Filters() {
  return (
    <section className="bg-surface-container-low p-6 flex flex-wrap gap-6 items-end">
      <div className="flex flex-col gap-2 min-w-[200px]">
        <label className="font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Process Range</label>
        <select className="bg-surface-container-highest border-none text-on-surface font-body text-sm py-2 px-3 focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer">
          <option>ALL_PROCESSES</option>
          <option>ASSEMBLY_LINE_A</option>
          <option>FABRICATION_04</option>
          <option>QUALITY_CONTROL_Z</option>
        </select>
      </div>

      <div className="flex flex-col gap-2 min-w-[200px]">
        <label className="font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Station ID</label>
        <input 
          type="text" 
          placeholder="STN_XXXX" 
          className="bg-surface-container-highest border-none text-on-surface font-body text-sm py-2 px-3 focus:ring-2 focus:ring-primary outline-none" 
        />
      </div>

      <div className="flex flex-col gap-2 min-w-[200px]">
        <label className="font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Event Severity</label>
        <div className="flex gap-2">
          <button className="bg-surface-container-highest px-3 py-2 text-xs font-label uppercase text-on-surface-variant hover:bg-surface-bright transition-colors border-b-2 border-transparent focus:border-primary focus:text-primary">
            Info
          </button>
          <button className="bg-surface-container-highest px-3 py-2 text-xs font-label uppercase text-on-surface-variant hover:bg-surface-bright transition-colors border-b-2 border-transparent focus:border-secondary focus:text-secondary">
            Warn
          </button>
          <button className="bg-surface-container-highest px-3 py-2 text-xs font-label uppercase text-on-surface-variant hover:bg-surface-bright transition-colors border-b-2 border-transparent focus:border-tertiary focus:text-tertiary">
            Critical
          </button>
        </div>
      </div>

      <button className="bg-surface-bright px-6 py-2 h-[38px] font-label text-[10px] tracking-widest uppercase text-[#8bacff] hover:opacity-80 transition-opacity ml-auto">
        Reset Filters
      </button>
    </section>
  );
}
