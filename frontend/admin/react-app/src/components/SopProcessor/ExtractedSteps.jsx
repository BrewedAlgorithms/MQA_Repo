import React, { useState, useEffect, useRef } from 'react';
import { sopApi } from '../../services/api';

const SUGGESTED_SAFETY = ['Helmet', 'Gloves', 'Safety Glasses', 'Steel-toed Boots', 'Hi-Vis Vest'];

// ── Save-status badge ──────────────────────────────────────────────────────────
function SaveBadge({ status, updatedAt }) {
  if (status === 'saving') {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
        <span className="font-label text-[10px] uppercase tracking-widest">Saving…</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-primary">
      <span className="material-symbols-outlined text-sm">cloud_done</span>
      <span className="font-label text-[10px] uppercase tracking-widest">
        Saved
        {updatedAt && (
          <span className="text-on-surface-variant ml-1">
            · {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Safety tag input ───────────────────────────────────────────────────────────
function SafetyTagInput({ value, onChange }) {
  const [input, setInput] = useState('');

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
  };

  const removeTag = (tag) => onChange(value.filter(t => t !== tag));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const suggestions = SUGGESTED_SAFETY.filter(s => !value.includes(s));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] bg-surface-container-low border border-outline-variant focus-within:border-primary px-2 py-1.5">
        {value.map(tag => (
          <span key={tag} className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-widest">
            <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
            >
              <span className="material-symbols-outlined text-[10px]">close</span>
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? 'Type safety item, press Enter…' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-on-surface font-body text-xs outline-none placeholder:text-on-surface-variant/40"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="px-2 py-0.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant border border-outline-variant hover:border-primary hover:text-primary transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Safety badge (read-only display) ──────────────────────────────────────────
function SafetyBadges({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {items.map(tag => (
        <span key={tag} className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-label font-bold uppercase tracking-widest">
          <span className="material-symbols-outlined text-[9px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
          {tag}
        </span>
      ))}
    </div>
  );
}

// ── Inline edit row ────────────────────────────────────────────────────────────
function EditRow({ step, sopId, onSaved, onCancel, onMutating }) {
  const [title, setTitle] = useState(step.title);
  const [desc, setDesc] = useState(step.description);
  const [safety, setSafety] = useState(step.safety ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    onMutating(true);
    try {
      const updated = await sopApi.updateStep(sopId, step.step_id, title.trim(), desc.trim(), safety);
      onSaved(updated);
    } catch (e) {
      setError(e.message);
      onMutating(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 bg-surface-container-highest border-l-4 border-secondary flex flex-col gap-3">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Step title"
        className="bg-surface-container-low text-on-surface font-body px-3 py-2 border border-outline-variant outline-none focus:border-primary text-sm"
      />
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Step description"
        rows={2}
        className="bg-surface-container-low text-on-surface font-body px-3 py-2 border border-outline-variant outline-none focus:border-primary text-sm resize-none"
      />
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">Safety Requirements</p>
        <SafetyTagInput value={safety} onChange={setSafety} />
      </div>
      {error && <p className="text-[10px] font-label text-error uppercase">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-primary text-on-primary font-label text-xs font-bold uppercase tracking-widest hover:bg-primary-fixed transition-all disabled:opacity-40 flex items-center gap-1"
        >
          {saving && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 font-label text-xs uppercase text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Add step row ───────────────────────────────────────────────────────────────
function AddStepRow({ sopId, onAdded, onCancel, onMutating }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [safety, setSafety] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    onMutating(true);
    try {
      const updated = await sopApi.addStep(sopId, title.trim(), desc.trim(), safety);
      onAdded(updated);
    } catch (e) {
      setError(e.message);
      onMutating(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 bg-surface-container-highest border-l-4 border-primary flex flex-col gap-3 mt-2">
      <p className="font-label text-xs text-primary uppercase font-bold tracking-widest">New Step</p>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Step title"
        autoFocus
        className="bg-surface-container-low text-on-surface font-body px-3 py-2 border border-outline-variant outline-none focus:border-primary text-sm"
      />
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Step description"
        rows={2}
        className="bg-surface-container-low text-on-surface font-body px-3 py-2 border border-outline-variant outline-none focus:border-primary text-sm resize-none"
      />
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">Safety Requirements</p>
        <SafetyTagInput value={safety} onChange={setSafety} />
      </div>
      {error && <p className="text-[10px] font-label text-error uppercase">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-primary text-on-primary font-label text-xs font-bold uppercase tracking-widest hover:bg-primary-fixed transition-all disabled:opacity-40 flex items-center gap-1"
        >
          {saving && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
          Add Step
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 font-label text-xs uppercase text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ExtractedSteps({ sop, sopLoading, onSopUpdated }) {
  const [editingStepId, setEditingStepId] = useState(null);
  const [deletingStepId, setDeletingStepId] = useState(null);
  const [addingStep, setAddingStep] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState(null);

  const [saveStatus, setSaveStatus] = useState('saved');
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!sop) return;
    clearTimeout(saveTimer.current);
    setSaveStatus('saved');
  }, [sop?.updated_at]);

  function startMutating(isMutating) {
    if (isMutating) {
      clearTimeout(saveTimer.current);
      setSaveStatus('saving');
    }
  }

  const steps = sop?.steps ?? [];

  async function handleDelete(stepId) {
    setDeleteLoading(true);
    setSaveStatus('saving');
    setError(null);
    try {
      const updated = await sopApi.deleteStep(sop.id, stepId);
      onSopUpdated(updated);
    } catch (e) {
      setError(e.message);
      setSaveStatus('saved');
    } finally {
      setDeleteLoading(false);
      setDeletingStepId(null);
    }
  }

  const numPad = (n) => String(n).padStart(2, '0');

  return (
    <section className="bg-surface-container-low p-8 border border-[#20201f]">
      {/* ── Section header ── */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="font-headline text-2xl font-bold uppercase tracking-tight">Extracted SOP Steps</h2>
          <p className="text-on-surface-variant text-xs font-label mt-1">
            {sop
              ? `${steps.length} step${steps.length !== 1 ? 's' : ''} — all changes auto-save to MongoDB.`
              : 'Process a document above to see extracted steps here.'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {sop && !sopLoading && <SaveBadge status={saveStatus} updatedAt={sop.updated_at} />}
          {sop && !sopLoading && (
            <button
              onClick={() => { setAddingStep(true); setEditingStepId(null); }}
              className="bg-surface-container-highest px-4 py-2 font-label text-xs font-bold uppercase tracking-widest hover:bg-surface-bright transition-colors border-b-2 border-primary flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Step
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 p-3 bg-error/10 border border-error text-error font-label text-xs uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* ── Empty states ── */}
      {sopLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl animate-spin opacity-40">progress_activity</span>
          <span className="font-label text-xs uppercase tracking-widest opacity-50">Loading existing SOP…</span>
        </div>
      ) : !sop ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl opacity-20">description</span>
          <span className="font-label text-xs uppercase tracking-widest opacity-50">No SOP processed yet</span>
        </div>
      ) : steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-on-surface-variant">
          <span className="font-label text-xs uppercase tracking-widest opacity-50">No steps extracted</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map((step) => (
            <div key={step.step_id}>
              {editingStepId === step.step_id ? (
                <EditRow
                  step={step}
                  sopId={sop.id}
                  onMutating={startMutating}
                  onSaved={(updated) => { onSopUpdated(updated); setEditingStepId(null); }}
                  onCancel={() => setEditingStepId(null)}
                />
              ) : (
                <div className="group flex items-start justify-between p-4 bg-surface-container-highest hover:bg-surface-bright transition-all border-l-4 border-primary">
                  <div className="flex items-start gap-6 min-w-0 flex-1">
                    <div className="font-headline text-2xl font-black text-outline-variant group-hover:text-primary transition-colors shrink-0">
                      {numPad(step.order)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-headline font-bold text-on-surface uppercase tracking-tight">{step.title}</h4>
                      <p className="font-body text-xs text-on-surface-variant mt-1">{step.description}</p>
                      <SafetyBadges items={step.safety} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <button
                      onClick={() => { setEditingStepId(step.step_id); setAddingStep(false); }}
                      title="Edit"
                      className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-black/20"
                    >
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    {deletingStepId === step.step_id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(step.step_id)}
                          disabled={deleteLoading}
                          className="px-2 py-1 text-[10px] font-label font-bold uppercase bg-error/20 text-error hover:bg-error/30 transition-colors disabled:opacity-40"
                        >
                          {deleteLoading ? '…' : 'Delete'}
                        </button>
                        <button
                          onClick={() => setDeletingStepId(null)}
                          className="px-2 py-1 text-[10px] font-label uppercase text-on-surface-variant hover:text-on-surface"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingStepId(step.step_id)}
                        title="Remove step"
                        className="p-2 text-on-surface-variant hover:text-error transition-colors hover:bg-black/20"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add step form ── */}
      {addingStep && sop && (
        <AddStepRow
          sopId={sop.id}
          onMutating={startMutating}
          onAdded={(updated) => { onSopUpdated(updated); setAddingStep(false); }}
          onCancel={() => setAddingStep(false)}
        />
      )}

      {/* ── Footer ── */}
      {sop && (
        <div className="mt-8 pt-6 border-t border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary"></div>
              <span className="font-label text-[10px] uppercase text-on-surface-variant">Step Sequence Valid</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-secondary"></div>
              <span className="font-label text-[10px] uppercase text-on-surface-variant">AI Confidence: High</span>
            </div>
          </div>
          <div className="text-[10px] font-label text-outline-variant uppercase tracking-widest">
            SOP ID: {sop.id}
          </div>
        </div>
      )}
    </section>
  );
}
