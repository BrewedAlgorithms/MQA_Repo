import React from 'react';

export default function InputControls() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
      {/* Station Selection */}
      <div className="bg-surface-container-low p-6 flex flex-col gap-4 border-l-2 border-primary">
        <label className="font-label text-xs font-bold text-primary uppercase tracking-widest">System Station</label>
        <div className="relative">
          <select className="w-full bg-surface-container-highest border-0 focus:ring-0 text-on-surface font-body p-4 appearance-none cursor-pointer">
            <option>ASSEMBLY_LINE_ALPHA_01</option>
            <option>FABRICATION_HUB_BETA</option>
            <option>QUALITY_CONTROL_DELTA_9</option>
            <option>PACKAGING_UNIT_KAPPA</option>
          </select>
          <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary">expand_more</span>
        </div>
      </div>

      {/* File Picker */}
      <div className="bg-surface-container-low p-6 flex flex-col gap-4 border-l-2 border-outline-variant">
        <label className="font-label text-xs font-bold text-on-surface-variant uppercase tracking-widest">Select SOP Document</label>
        <div className="group relative h-16 w-full bg-surface-container-highest border border-dashed border-outline-variant flex flex-row items-center justify-center gap-3 cursor-pointer hover:bg-surface-bright transition-colors px-4">
          <span className="material-symbols-outlined text-primary">cloud_upload</span>
          <span className="text-[10px] font-label text-on-surface-variant group-hover:text-primary transition-colors uppercase font-bold">Drop PDF or Manual File</span>
          <input className="absolute inset-0 opacity-0 cursor-pointer" type="file" />
        </div>
      </div>

      {/* Process Button */}
      <div className="flex items-end">
        <button className="w-full h-[88px] bg-primary hover:bg-primary-fixed transition-all flex items-center justify-center gap-3 active:scale-[0.98]">
          <span className="font-label font-bold text-on-primary uppercase tracking-tighter text-lg">Process Document</span>
          <span className="material-symbols-outlined text-on-primary">bolt</span>
        </button>
      </div>
    </div>
  );
}
