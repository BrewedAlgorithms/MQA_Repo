import React from 'react';
import CameraGrid from './CameraGrid';
import SafetyViolations from './SafetyViolations';

export default function AdminDashboard({ onViewIncidents }) {
  return (
    <div className="p-8 flex flex-col gap-8 flex-grow">
      <CameraGrid />
      <SafetyViolations onViewIncidents={onViewIncidents} />
    </div>
  );
}
