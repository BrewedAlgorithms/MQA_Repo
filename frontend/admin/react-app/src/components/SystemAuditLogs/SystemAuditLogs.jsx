import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import Filters from './Filters';
import DataTable from './DataTable';
import { auditLogsData, generateRandomLog } from '../../data/auditLogs';
import { stationsApi } from '../../services/api';

export default function SystemAuditLogs({ initialSeverity }) {
  const [station,  setStation]  = useState('');
  const [severity, setSeverity] = useState(initialSeverity || null);
  const [stations, setStations] = useState([]);
  const [logs,     setLogs]     = useState(auditLogsData);

  useEffect(() => {
    stationsApi.list().then(setStations).catch(() => {});
  }, []);

  // Sync when the prop changes (e.g. navigating via "View Incident Logs")
  useEffect(() => {
    if (initialSeverity) setSeverity(initialSeverity);
  }, [initialSeverity]);

  // Randomly prepend a new log every 1–5 seconds
  useEffect(() => {
    let timer;
    const schedule = () => {
      const delay = (1 + Math.random() * 4) * 1000;
      timer = setTimeout(() => {
        setLogs(prev => [generateRandomLog(), ...prev].slice(0, 100));
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  const filtered = logs.filter(log => {
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
