import React, { useState, useEffect, useRef } from 'react';
import { stationsApi } from '../../services/api';

export default function ManageStations() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add
  const [addName, setAddName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  // Rename
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const renameInputRef = useRef(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState(null);

  async function loadStations() {
    setLoading(true);
    setError(null);
    try {
      const data = await stationsApi.list();
      setStations(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStations(); }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  async function handleAdd(e) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const created = await stationsApi.create(name);
      setStations(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setAddName('');
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  }

  function startRename(station) {
    setRenamingId(station.id);
    setRenameValue(station.name);
  }

  async function commitRename(station) {
    const name = renameValue.trim();
    if (!name || name === station.name) {
      setRenamingId(null);
      return;
    }
    setRenameLoading(true);
    try {
      const updated = await stationsApi.rename(station.id, name);
      setStations(prev =>
        prev.map(s => s.id === updated.id ? updated : s)
            .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setRenameLoading(false);
      setRenamingId(null);
    }
  }

  async function handleDelete(id) {
    try {
      await stationsApi.delete(id);
      setStations(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-primary"></div>
            <h1 className="text-4xl font-headline font-bold uppercase tracking-tighter">Manage Stations</h1>
          </div>
          <p className="ml-5 text-on-surface-variant text-xs font-label uppercase tracking-widest">
            Add, rename, or remove manufacturing stations. Stations appear in the SOP Processor.
          </p>
        </div>

        {/* Add station form */}
        <div className="bg-surface-container-low border-l-2 border-primary p-6 mb-8">
          <label className="font-label text-xs font-bold text-primary uppercase tracking-widest block mb-3">
            Add New Station
          </label>
          <form onSubmit={handleAdd} className="flex gap-3">
            <input
              type="text"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              placeholder="STATION_NAME"
              className="flex-1 bg-surface-container-highest text-on-surface font-body px-4 py-3 border-0 outline-none focus:ring-1 focus:ring-primary uppercase placeholder:normal-case placeholder:text-on-surface-variant"
            />
            <button
              type="submit"
              disabled={addLoading || !addName.trim()}
              className="px-6 py-3 bg-primary text-on-primary font-label font-bold text-xs uppercase tracking-widest hover:bg-primary-fixed transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {addLoading
                ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-sm">add</span>
              }
              Add
            </button>
          </form>
          {addError && (
            <p className="mt-2 text-xs text-error font-label uppercase">{addError}</p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error text-error font-label text-xs uppercase flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Station list */}
        <div className="bg-surface-container-low border border-[#20201f]">
          <div className="flex justify-between items-center px-6 py-4 border-b border-[#20201f]">
            <h2 className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
              Stations
            </h2>
            <span className="font-label text-xs text-outline-variant uppercase">
              {stations.length} total
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span className="font-label text-xs uppercase tracking-widest">Loading stations…</span>
            </div>
          ) : stations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl opacity-30">precision_manufacturing</span>
              <span className="font-label text-xs uppercase tracking-widest opacity-60">No stations yet. Add one above.</span>
            </div>
          ) : (
            <ul className="divide-y divide-[#20201f]">
              {stations.map(station => (
                <li key={station.id} className="group flex items-center justify-between px-6 py-4 hover:bg-[#20201f] transition-all">
                  {/* Name / Rename inline */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="material-symbols-outlined text-primary text-lg shrink-0">precision_manufacturing</span>
                    {renamingId === station.id ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(station)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(station);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        disabled={renameLoading}
                        className="bg-surface-container-highest text-on-surface font-body px-3 py-1.5 border border-primary outline-none text-sm uppercase flex-1 min-w-0"
                      />
                    ) : (
                      <span className="font-body text-sm uppercase text-on-surface truncate">
                        {station.name}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {deletingId === station.id ? (
                      <>
                        <span className="font-label text-xs text-error uppercase mr-2">Delete?</span>
                        <button
                          onClick={() => handleDelete(station.id)}
                          className="px-3 py-1.5 text-xs font-label font-bold uppercase bg-error/20 text-error hover:bg-error/30 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-3 py-1.5 text-xs font-label uppercase text-on-surface-variant hover:text-on-surface transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startRename(station)}
                          title="Rename"
                          className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-black/20"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button
                          onClick={() => setDeletingId(station.id)}
                          title="Delete"
                          className="p-2 text-on-surface-variant hover:text-error transition-colors hover:bg-black/20"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <p className="mt-4 text-[10px] font-label text-outline-variant uppercase tracking-widest">
          Deleting a station also removes all associated SOP documents.
        </p>
      </div>
    </div>
  );
}
