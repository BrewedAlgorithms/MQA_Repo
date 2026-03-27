import React from 'react';
import InputControls from './InputControls';
import ExtractedSteps from './ExtractedSteps';

export default function SopProcessor() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-10 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-primary"></div>
            <h1 className="text-4xl font-headline font-bold uppercase tracking-tighter">SOP Doc Processor</h1>
          </div>
        </div>
        
        <InputControls />
        <ExtractedSteps />
      </div>
    </div>
  );
}
