import React, { useState, useEffect } from 'react';
import InputControls from './InputControls';
import ExtractedSteps from './ExtractedSteps';
import { stationsApi, sopApi } from '../../services/api';

export default function SopProcessor() {
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);

  const [selectedStation, setSelectedStation] = useState('');
  const [currentSop, setCurrentSop] = useState(null);
  const [sopLoading, setSopLoading] = useState(false);

  // Load station list once
  useEffect(() => {
    stationsApi.list()
      .then(setStations)
      .catch(() => setStations([]))
      .finally(() => setStationsLoading(false));
  }, []);

  // Whenever the selected station changes, fetch its latest SOP (if any)
  useEffect(() => {
    if (!selectedStation) {
      setCurrentSop(null);
      return;
    }
    setSopLoading(true);
    setCurrentSop(null);
    sopApi.listForStation(selectedStation)
      .then(sops => {
        // listForStation returns newest-first; show the most recent one
        setCurrentSop(sops.length > 0 ? sops[0] : null);
      })
      .catch(() => setCurrentSop(null))
      .finally(() => setSopLoading(false));
  }, [selectedStation]);

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-primary"></div>
            <h1 className="text-4xl font-headline font-bold uppercase tracking-tighter">SOP Doc Processor</h1>
          </div>
        </div>

        <InputControls
          stations={stations}
          stationsLoading={stationsLoading}
          selectedStation={selectedStation}
          onStationChange={setSelectedStation}
          hasExistingSop={!!currentSop}
          onSopProcessed={setCurrentSop}
        />

        <ExtractedSteps
          sop={currentSop}
          sopLoading={sopLoading}
          onSopUpdated={setCurrentSop}
        />
      </div>
    </div>
  );
}
