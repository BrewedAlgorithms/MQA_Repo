import React, { useState, useRef } from 'react';
import { sopApi } from '../../services/api';

export default function InputControls({
  stations,
  stationsLoading,
  selectedStation,
  onStationChange,
  hasExistingSop,
  onSopProcessed,
}) {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  async function handleProcess() {
    setError(null);

    if (!selectedStation) {
      setError('Please select a station first.');
      return;
    }
    if (!file) {
      setError('Please upload a SOP .txt file.');
      return;
    }

    setProcessing(true);
    try {
      const sop = await sopApi.upload(selectedStation, file);
      onSopProcessed(sop);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
  }

  function handleStationChange(e) {
    onStationChange(e.target.value);
    // clear file selection when station changes
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError(null);
  }

  const buttonLabel = hasExistingSop ? 'Reprocess Document' : 'Process Document';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
      {/* Station Selection */}
      <div className="bg-surface-container-low p-6 flex flex-col gap-4 border-l-2 border-primary">
        <label className="font-label text-xs font-bold text-primary uppercase tracking-widest">System Station</label>
        <div className="relative">
          {stationsLoading ? (
            <div className="flex items-center gap-2 text-on-surface-variant text-xs font-label uppercase">
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              Loading…
            </div>
          ) : stations.length === 0 ? (
            <p className="text-xs font-label text-on-surface-variant uppercase">
              No stations — add one in Manage Stations.
            </p>
          ) : (
            <>
              <select
                value={selectedStation}
                onChange={handleStationChange}
                className="w-full bg-surface-container-highest border-0 focus:ring-0 text-on-surface font-body p-4 appearance-none cursor-pointer uppercase"
              >
                <option value="">— Select a station —</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary">expand_more</span>
            </>
          )}
        </div>
      </div>

      {/* File Picker */}
      <div className="bg-surface-container-low p-6 flex flex-col gap-4 border-l-2 border-outline-variant">
        <label className="font-label text-xs font-bold text-on-surface-variant uppercase tracking-widest">
          {hasExistingSop ? 'Upload New SOP Document (.docx)' : 'Select SOP Document (.docx)'}
        </label>
        <div
          className="group relative h-16 w-full bg-surface-container-highest border border-dashed border-outline-variant flex flex-row items-center justify-center gap-3 cursor-pointer hover:bg-surface-bright transition-colors px-4"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="material-symbols-outlined text-primary">cloud_upload</span>
          <span className="text-[10px] font-label text-on-surface-variant group-hover:text-primary transition-colors uppercase font-bold truncate">
            {file ? file.name : 'Drop or click to select .docx file'}
          </span>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
          />
        </div>
        {file && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-label text-primary uppercase">{file.name}</span>
            <button
              onClick={() => { setFile(null); fileInputRef.current.value = ''; }}
              className="text-on-surface-variant hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}
        {error && (
          <p className="text-[10px] font-label text-error uppercase">{error}</p>
        )}
      </div>

      {/* Process / Reprocess Button */}
      <div className="flex flex-col items-stretch justify-end gap-2">
        {hasExistingSop && !file && (
          <p className="text-[10px] font-label text-on-surface-variant uppercase text-center">
            Upload a new file to reprocess
          </p>
        )}
        <button
          onClick={handleProcess}
          disabled={processing || !selectedStation || !file}
          className="w-full h-[88px] bg-primary hover:bg-primary-fixed transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {processing ? (
            <>
              <span className="material-symbols-outlined text-on-primary animate-spin">progress_activity</span>
              <span className="font-label font-bold text-on-primary uppercase tracking-tighter text-lg">Processing…</span>
            </>
          ) : (
            <>
              <span className="font-label font-bold text-on-primary uppercase tracking-tighter text-lg">{buttonLabel}</span>
              <span className="material-symbols-outlined text-on-primary">{hasExistingSop ? 'refresh' : 'bolt'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
