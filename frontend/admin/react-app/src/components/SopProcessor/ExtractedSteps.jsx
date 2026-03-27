import React from 'react';

export default function ExtractedSteps() {
  const steps = [
    { num: '01', title: 'Check Seal Integrity', desc: 'Inspect secondary gasket layer for any micro-fissures or pressure deviations.' },
    { num: '02', title: 'Verify Component Alignment', desc: 'Cross-reference laser positioning with the digital CAD overlay of the chassis.' },
    { num: '03', title: 'Torque Calibration', desc: 'Apply precise force of 14.5 Nm to the primary intake housing bolts.' },
    { num: '04', title: 'Final Visual Pass', desc: 'High-resolution optical scan for surface defects or left-behind FOD (Foreign Object Debris).' }
  ];

  return (
    <section className="bg-surface-container-low p-8 border border-[#20201f]">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline text-2xl font-bold uppercase tracking-tight">Extracted SOP Steps</h2>
          <p className="text-on-surface-variant text-xs font-label mt-1">Refine extracted data before committing to production logs.</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-surface-container-highest px-4 py-2 font-label text-xs font-bold uppercase tracking-widest hover:bg-surface-bright transition-colors border-b-2 border-primary-dim">Export CSV</button>
          <button className="bg-surface-container-highest px-4 py-2 font-label text-xs font-bold uppercase tracking-widest hover:bg-surface-bright transition-colors">Clear All</button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step, idx) => (
          <div key={idx} className="group flex items-center justify-between p-4 bg-surface-container-highest hover:bg-surface-bright transition-all border-l-4 border-primary">
            <div className="flex items-center gap-6">
              <div className="font-headline text-2xl font-black text-outline-variant group-hover:text-primary transition-colors">{step.num}</div>
              <div>
                <h4 className="font-headline font-bold text-on-surface uppercase tracking-tight">{step.title}</h4>
                <p className="font-body text-xs text-on-surface-variant mt-1">{step.desc}</p>
              </div>
            </div>
            <button className="p-3 text-on-surface-variant hover:text-primary transition-colors hover:bg-black/20">
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>
        ))}
      </div>

      {/* System Telemetry Footer */}
      <div className="mt-8 pt-6 border-t border-outline-variant flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary"></div>
            <span className="font-label text-[10px] uppercase text-on-surface-variant">Step Sequence Valid</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-secondary"></div>
            <span className="font-label text-[10px] uppercase text-on-surface-variant">AI Confidence: High</span>
          </div>
        </div>
        <div className="text-[10px] font-label text-outline-variant uppercase tracking-widest">
          Process ID: SOP-99812-TX-001
        </div>
      </div>
    </section>
  );
}
