import React, { useState, useEffect } from 'react';
import { stationsApi } from '../../services/api';

const SOURCE_OPTIONS = [
  { value: 'none', label: 'No Source' },
  { value: 'rtsp', label: 'RTSP Stream' },
  { value: 'hls',  label: 'HLS Stream'  },
];

export default function ManageStations() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add
  const [addName, setAddName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  // Edit panel
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSourceType, setEditSourceType] = useState('none');
  const [editRtspUrl, setEditRtspUrl] = useState('');
  const [editHlsUrl, setEditHlsUrl] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

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

  function startEdit(station) {
    setEditingId(station.id);
    setEditName(station.name);
    setEditSourceType(station.source_type || 'none');
    setEditRtspUrl(station.rtsp_url || '');
    setEditHlsUrl(station.hls_url || '');
    setEditError(null);
    setDeletingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function commitEdit(station) {
    const name = editName.trim();
    if (!name) {
      setEditError('Station name cannot be empty.');
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const payload = {
        name,
        source_type: editSourceType === 'none' ? null : editSourceType,
        rtsp_url: editSourceType === 'rtsp' ? (editRtspUrl.trim() || null) : null,
        // hls_url is kept for RTSP stations too (browser HLS playback fallback)
        hls_url: (editSourceType === 'hls' || editSourceType === 'rtsp')
          ? (editHlsUrl.trim() || null)
          : null,
      };
      const updated = await stationsApi.update(station.id, payload);
      setStations(prev =>
        prev.map(s => s.id === updated.id ? updated : s)
            .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (e) {
      setEditError(e.message);
    } finally {
      setEditLoading(false);
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
            Add, configure, or remove manufacturing stations. Stations appear in the SOP Processor and Dashboard.
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
                <React.Fragment key={station.id}>
                  {/* Station row */}
                  <li className="group flex items-center justify-between px-6 py-4 hover:bg-[#20201f] transition-all">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span className="material-symbols-outlined text-primary text-lg shrink-0">precision_manufacturing</span>
                      <span className="font-body text-sm uppercase text-on-surface truncate">
                        {station.name}
                      </span>
                      {station.source_type && (
                        <span className={`font-label text-[10px] uppercase tracking-widest px-2 py-0.5 border shrink-0 ${
                          station.source_type === 'rtsp'
                            ? 'bg-tertiary/10 text-tertiary border-tertiary/30'
                            : 'bg-primary/10 text-primary border-primary/30'
                        }`}>
                          {station.source_type}
                        </span>
                      )}
                    </div>

                    {/* Row actions */}
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
                            onClick={() => editingId === station.id ? cancelEdit() : startEdit(station)}
                            title="Edit"
                            className={`p-2 transition-colors hover:bg-black/20 ${editingId === station.id ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
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

                  {/* Edit panel (expanded inline) */}
                  {editingId === station.id && (
                    <li className="bg-[#16161a] border-t border-primary/30 px-6 py-5">
                      <p className="font-label text-[10px] text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">settings</span>
                        Configure Station
                      </p>

                      <div className="grid grid-cols-1 gap-4">
                        {/* Name */}
                        <div>
                          <label className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest block mb-1.5">
                            Station Name
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="w-full bg-surface-container-highest text-on-surface font-body px-4 py-2.5 border border-outline-variant outline-none focus:border-primary text-sm uppercase"
                          />
                        </div>

                        {/* Source type */}
                        <div>
                          <label className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest block mb-1.5">
                            Stream Source
                          </label>
                          <div className="flex gap-2">
                            {SOURCE_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setEditSourceType(opt.value)}
                                className={`px-4 py-2 font-label text-[10px] uppercase tracking-widest border transition-all ${
                                  editSourceType === opt.value
                                    ? 'bg-primary text-on-primary border-primary'
                                    : 'bg-transparent text-on-surface-variant border-outline-variant hover:border-outline'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* RTSP URL + HLS Playback URL */}
                        {editSourceType === 'rtsp' && (
                          <>
                            <div>
                              <label className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest block mb-1.5">
                                RTSP URL
                              </label>
                              <input
                                type="text"
                                value={editRtspUrl}
                                onChange={e => setEditRtspUrl(e.target.value)}
                                placeholder="rtsp://localhost:8554/live"
                                className="w-full bg-surface-container-highest text-on-surface font-mono px-4 py-2.5 border border-outline-variant outline-none focus:border-primary text-xs"
                              />
                            </div>
                            <div>
                              <label className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest block mb-1.5">
                                HLS Playback URL <span className="text-primary normal-case">(for browser — e.g. MediaMTX HLS output)</span>
                              </label>
                              <input
                                type="text"
                                value={editHlsUrl}
                                onChange={e => setEditHlsUrl(e.target.value)}
                                placeholder="http://localhost:8888/live/index.m3u8"
                                className="w-full bg-surface-container-highest text-on-surface font-mono px-4 py-2.5 border border-outline-variant outline-none focus:border-primary text-xs"
                              />
                              <p className="mt-1.5 text-[10px] text-on-surface-variant font-label">
                                Browsers cannot play RTSP directly. Provide the HLS URL from the same streamer for live playback.
                              </p>
                            </div>
                          </>
                        )}

                        {/* HLS URL */}
                        {editSourceType === 'hls' && (
                          <div>
                            <label className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest block mb-1.5">
                              HLS URL
                            </label>
                            <input
                              type="text"
                              value={editHlsUrl}
                              onChange={e => setEditHlsUrl(e.target.value)}
                              placeholder="http://server:8888/live/index.m3u8"
                              className="w-full bg-surface-container-highest text-on-surface font-mono px-4 py-2.5 border border-outline-variant outline-none focus:border-primary text-xs"
                            />
                          </div>
                        )}

                        {editError && (
                          <p className="text-xs text-error font-label uppercase">{editError}</p>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-1">
                          <button
                            onClick={() => commitEdit(station)}
                            disabled={editLoading}
                            className="px-5 py-2 bg-primary text-on-primary font-label font-bold text-xs uppercase tracking-widest hover:bg-primary-fixed transition-all disabled:opacity-40 flex items-center gap-2"
                          >
                            {editLoading
                              ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                              : <span className="material-symbols-outlined text-sm">check</span>
                            }
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={editLoading}
                            className="px-5 py-2 font-label text-xs uppercase tracking-widest text-on-surface-variant border border-outline-variant hover:border-outline transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </li>
                  )}
                </React.Fragment>
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
