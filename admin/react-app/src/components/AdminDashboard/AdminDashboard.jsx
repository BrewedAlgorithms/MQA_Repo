import React from 'react';
import CameraGrid from './CameraGrid';
import SafetyViolations from './SafetyViolations';

export default function AdminDashboard() {
  return (
    <div className="p-8 flex flex-col gap-8 flex-grow">
      {/* Dashboard Top Spacer */}
      <div className="mt-6 mb-8"></div>

      <CameraGrid />
      <SafetyViolations />
    </div>
  );
}
