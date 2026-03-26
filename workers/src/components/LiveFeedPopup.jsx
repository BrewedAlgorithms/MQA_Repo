import React from 'react';

export default function LiveFeedPopup() {
  return (
    <div className="fixed top-8 left-8 z-50 w-72 h-48 bg-surface-container-high rounded-xl border border-white/10 overflow-hidden shadow-2xl group">
      <div className="absolute inset-0 bg-black/40 video-scanline z-10"></div>
      <img 
        alt="Factory Floor" 
        className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-700" 
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAsu4diFwr8JntmUKIuV1gC_efpH9usqKWhQCxUHP09p7cXqemwObQvALCbw6g-itPwHpBq540CcywBqGxEs1WKRM8by7yprFOLrTgmAsNjnA7KDwAS2W0SudUrvt6YTTTdqAM1OgKW6tvm8FOfWRy-DqJMD7DEzzEfZhI1Q-iG72t-M188cA-dUlOn7Vo_LNZRKKe3roHB22r9IGHgwGmi2l_os3aSu3CftvacXn4GfGmmE5eHv3yAcjtmTJYWdwvFQTteOLWBA96K"
      />
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <div className="w-2 h-2 bg-error rounded-full animate-pulse"></div>
        <span className="text-[10px] font-bold tracking-widest text-white uppercase drop-shadow-md">Unit 01 - Cam A</span>
      </div>
      <div className="absolute bottom-3 right-3 z-20">
        <span className="text-[10px] font-mono text-primary/80">24fps // 1080p</span>
      </div>
    </div>
  );
}
