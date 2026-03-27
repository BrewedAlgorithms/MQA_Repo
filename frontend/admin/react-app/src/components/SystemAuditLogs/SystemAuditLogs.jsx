import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import Filters from './Filters';
import DataTable from './DataTable';
import { auditLogsData } from '../../data/auditLogs';
import { stationsApi } from '../../services/api';

export default function SystemAuditLogs({ initialSeverity }) {
  const [station, setStation] = useState('');
  const [severity, setSeverity] = useState(initialSeverity || null);
  const [stations, setStations] = useState([]);

  useEffect(() => {
    stationsApi.list().then(setStations).catch(() => {});
  }, []);

  // Sync when the prop changes (e.g. navigating via "View Incident Logs")
  useEffect(() => {
    if (initialSeverity) setSeverity(initialSeverity);
  }, [initialSeverity]);

  const filtered = auditLogsData.filter(log => {
    const matchStation  = !station  || log.station.toLowerCase().includes(station.toLowerCase());
    const matchSeverity = !severity || log.severity === severity;
    return matchStation && matchSeverity;
  });

  function resetFilters() {
    setStation('');
    setSeverity(null);
  }

  return (
    <div className="p-8 flex flex-col gap-8 flex-grow">
      <PageHeader />
      <Filters
        station={station}
        onStationChange={setStation}
        stations={stations}
        severity={severity}
        onSeverityChange={setSeverity}
        onReset={resetFilters}
      />
      <DataTable logs={filtered} />
    </div>
  );
}
