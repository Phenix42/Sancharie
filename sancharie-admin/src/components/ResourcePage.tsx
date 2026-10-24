import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Power, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../api/client';

export type Field = { key: string; label: string; type?: 'text' | 'password' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'select' | 'checkbox' | 'csv' | 'image'; options?: string[]; required?: boolean; min?: number; max?: number; defaultValue?: unknown; };
type ResourcePageProps = { title: string; description: string; endpoint: string; fields: Field[]; searchable?: boolean; };

const blankFor = (fields: Field[]) => Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === 'checkbox' ? true : f.type === 'csv' ? '' : f.type === 'select' ? f.options?.[0] || '' : '')]));
const localDateValue = (value: unknown, dateOnly: boolean) => {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return shifted.slice(0, dateOnly ? 10 : 16);
};
const toForm = (data: Record<string, unknown>, fields: Field[]) => Object.fromEntries(fields.map((f) => {
  const value = data[f.key];
  if (f.type === 'csv') return [f.key, Array.isArray(value) ? value.join(', ') : ''];
  if (f.type === 'date' || f.type === 'datetime-local') return [f.key, localDateValue(value, f.type === 'date')];
  const fallback = f.defaultValue ?? (f.type === 'checkbox' ? false : f.type === 'select' ? f.options?.[0] || '' : '');
  return [f.key, value == null || (f.type === 'select' && value === '') ? fallback : value];
}));
const toPayload = (data: Record<string, unknown>, fields: Field[]) => Object.fromEntries(fields.map((f) => {
  const value = data[f.key];
  if (f.type === 'csv') return [f.key, String(value || '').split(',').map((part) => part.trim()).filter(Boolean)];
  if (f.type === 'number') return [f.key, value === '' ? null : Number(value)];
  if (f.type === 'datetime-local' && value) return [f.key, new Date(String(value)).toISOString()];
  if (f.key === 'password' && !value) return [f.key, undefined];
  return [f.key, value];
}));
function FormField({ field, value, onChange, onFileChange, required = field.required, values }: { field: Field; value: unknown; onChange: (value: unknown) => void; onFileChange?: (file: File | null) => void; required?: boolean; values: Record<string, unknown> }) {
  const common = { required, value: String(value ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value) };
  const numberMin = field.min ?? (field.type === 'number' ? (['percentage', 'value', 'discountValue'].includes(field.key) ? 0.01 : 0) : undefined);
  const percentValue = field.key === 'percentage' || (field.key === 'value' && values.type === 'percentage') || (field.key === 'discountValue' && values.discountType === 'percentage');
  const numberMax = field.max ?? (percentValue ? 100 : undefined);
  if (field.type === 'checkbox') return <label className="check-field"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {field.label}</label>;
  if (field.type === 'image') return <label className="form-field"><span>{field.label}</span>{typeof value === 'string' && /^(https:\/\/|\/(?!\/))/.test(value) && <img className="offer-banner-preview" src={value.startsWith('/') ? `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${value}` : value} alt="Current offer banner" />}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp" onChange={(e) => onFileChange?.(e.target.files?.[0] || null)} /><small>PNG, JPG, WebP, GIF, AVIF, or BMP · up to 5 MB</small></label>;
  return <label className="form-field"><span>{field.label}</span>
    {field.type === 'textarea' ? <textarea {...common} rows={3} /> : field.type === 'select' ? <select {...common}>{(field.options || []).map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select> : <input {...common} type={field.type === 'csv' ? 'text' : field.type || 'text'} min={numberMin} max={numberMax} step={field.type === 'number' ? 'any' : undefined} minLength={field.key === 'password' ? 14 : undefined} autoComplete={field.type === 'password' ? 'new-password' : undefined} placeholder={field.type === 'csv' ? 'Comma separated values' : undefined} />}
  </label>;
}

export default function ResourcePage({ title, description, endpoint, fields, searchable = true }: ResourcePageProps) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [editing, setEditing] = useState<Record<string, unknown> | null>(null); const [isOpen, setIsOpen] = useState(false); const [previewOpen, setPreviewOpen] = useState(false); const [form, setForm] = useState<Record<string, unknown>>(() => blankFor(fields)); const [imageFiles, setImageFiles] = useState<Record<string, File>>({}); const [notice, setNotice] = useState('');
  const list = useQuery({ queryKey: [endpoint, q, page], queryFn: async () => (await api.get(`/${endpoint}`, { params: { q: q || undefined, page, limit: 50 } })).data });
  const save = useMutation({ mutationFn: async () => {
    const response = editing?._id ? await api.patch(`/${endpoint}/${editing._id}`, toPayload(form, fields)) : await api.post(`/${endpoint}`, toPayload(form, fields));
    const id = String(editing?._id || response.data?.data?._id || '');
    let uploadError = '';
    if (endpoint === 'offers' && imageFiles.bannerImage && id) {
      try { await api.put(`/offers/${id}/banner-image`, imageFiles.bannerImage, { headers: { 'Content-Type': imageFiles.bannerImage.type } }); }
      catch (error) { uploadError = errorMessage(error); }
    }
    return { uploadError };
  }, onSuccess: async (result) => { setEditing(null); setIsOpen(false); setImageFiles({}); setNotice(result.uploadError ? `Offer saved, but banner upload failed: ${result.uploadError}` : 'Changes saved.'); await queryClient.invalidateQueries({ queryKey: [endpoint] }); }, onError: (error) => setNotice(errorMessage(error)) });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/${endpoint}/${id}`), onSuccess: async () => { setNotice('Record deleted.'); await queryClient.invalidateQueries({ queryKey: [endpoint] }); }, onError: (error) => setNotice(errorMessage(error)) });
  const deactivate = useMutation({ mutationFn: (record: Record<string, unknown>) => { const key = Object.hasOwn(record, 'enabled') ? 'enabled' : 'active'; return api.patch(`/${endpoint}/${record._id}`, { [key]: !record[key] }); }, onSuccess: async () => { setNotice('Status updated.'); await queryClient.invalidateQueries({ queryKey: [endpoint] }); }, onError: (error) => setNotice(errorMessage(error)) });
  const openNew = () => { setEditing(null); setForm(blankFor(fields)); setImageFiles({}); setNotice(''); setPreviewOpen(false); setIsOpen(true); };
  const openEdit = (record: Record<string, unknown>) => { setEditing(record); setForm(toForm(record, fields)); setImageFiles({}); setNotice(''); setPreviewOpen(false); setIsOpen(true); };
  const close = () => { setEditing(null); setIsOpen(false); setPreviewOpen(false); setImageFiles({}); };
  const titleField = fields.find((f) => ['name', 'title', 'code'].includes(f.key))?.key || fields[0]?.key;

  return <section className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">CONTROL CENTER</div><h1>{title}</h1><p>{description}</p></div><button className="button button-primary" onClick={openNew}><Plus size={17} /> New {title.replace(/s$/, '')}</button></div>
    {notice && <div className="notice" role="status">{notice}<button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
    <div className="panel"><div className="panel-toolbar">{searchable && <input className="search-input" placeholder={`Search ${title.toLowerCase()}...`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />}</div>
      {list.isLoading ? <div className="loading-line">Loading {title.toLowerCase()}…</div> : list.isError ? <div className="empty-state">{errorMessage(list.error)}</div> : !list.data?.data?.length ? <div className="empty-state">No records yet. Create your first record to get started.</div> : <div className="table-wrap"><table><thead><tr><th>Name</th>{fields.filter((field) => !['name', 'title', 'code', 'description', 'password'].includes(field.key)).slice(0, 4).map((field) => <th key={field.key}>{field.label}</th>)}<th>Status</th><th className="actions-col">Actions</th></tr></thead><tbody>{list.data.data.map((row: Record<string, unknown>) => { const enabled = Boolean(row.enabled ?? row.active ?? true); return <tr key={String(row._id)}><td><strong>{String(row[titleField] || 'Untitled')}</strong>{Boolean(row.description) && <small>{String(row.description)}</small>}</td>{fields.filter((field) => !['name', 'title', 'code', 'description', 'password'].includes(field.key)).slice(0, 4).map((field) => <td key={field.key}>{field.type === 'checkbox' ? (row[field.key] ? 'Yes' : 'No') : Array.isArray(row[field.key]) ? (row[field.key] as string[]).join(', ') || '—' : row[field.key] == null || row[field.key] === '' ? '—' : String(row[field.key])}</td>)}<td><span className={`status-pill ${enabled ? 'status-on' : 'status-off'}`}>{enabled ? 'Enabled' : 'Disabled'}</span></td><td><div className="row-actions"><button className="icon-button" title="Edit" onClick={() => openEdit(row)}><Pencil size={16} /></button><button className="icon-button" title="Enable or disable" onClick={() => window.confirm(`${enabled ? 'Deactivate' : 'Enable'} ${String(row[titleField] || 'this record')}?`) && deactivate.mutate(row)}><Power size={16} /></button><button className="icon-button danger-icon" title="Delete" onClick={() => window.confirm(`Delete ${String(row[titleField] || 'this record')}? This cannot be undone.`) && remove.mutate(String(row._id))}><Trash2 size={16} /></button></div></td></tr>; })}</tbody></table></div>}
      {Boolean(list.data?.pagination && list.data.pagination.pages > 1) && <div className="table-pagination"><span>{`Page ${page} of ${list.data.pagination.pages} · ${list.data.pagination.total} records`}</span><div><button className="button button-quiet" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="button button-quiet" disabled={page >= list.data.pagination.pages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
    </div>
    <dialog className="editor-dialog" open={isOpen} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form className="dialog-card" onSubmit={(event) => { event.preventDefault(); setNotice(''); const startsAt = form.startDate ? new Date(String(form.startDate)).getTime() : null; const endsAt = form.endDate ? new Date(String(form.endDate)).getTime() : null; if (startsAt !== null && endsAt !== null && (Number.isNaN(startsAt) || Number.isNaN(endsAt) || endsAt < startsAt)) { setNotice('End date must be on or after the start date.'); return; } const discountValue = Number(form.percentage ?? form.value ?? form.discountValue); if ((form.percentage !== undefined || form.type === 'percentage' || form.discountType === 'percentage') && discountValue > 100) { setNotice('Percentage discount cannot exceed 100%.'); return; } save.mutate(); }}><div className="dialog-heading"><div><span className="eyebrow">{editing ? 'UPDATE RECORD' : 'NEW RECORD'}</span><h2>{editing ? 'Edit' : 'Create'} {title.replace(/s$/, '')}</h2></div><button type="button" className="icon-button" onClick={close}><X size={18} /></button></div>
        <div className="form-grid">{fields.map((field) => <FormField key={field.key} field={field} values={form} required={field.required || (!editing && endpoint === 'admin-users' && field.key === 'password')} value={form[field.key]} onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))} onFileChange={field.type === 'image' ? (file) => setImageFiles((current) => { const next = { ...current }; if (file) next[field.key] = file; else delete next[field.key]; return next; }) : undefined} />)}</div>
        {endpoint === 'banners' && <div className="banner-preview-wrap"><button type="button" className="text-button" onClick={() => setPreviewOpen((open) => !open)}>{previewOpen ? 'Hide preview' : 'Preview banner'}</button>{previewOpen && <div className="banner-preview">{Boolean(form.image) && /^(https:\/\/|\/(?!\/))/.test(String(form.image)) && <img src={String(form.image)} alt=""/>}<div><span className="eyebrow">{String(form.kind || 'homepage')}</span><h3>{String(form.title || 'Banner title')}</h3><p>{String(form.description || 'Your banner description will appear here.')}</p>{Boolean(form.ctaText) && <b>{String(form.ctaText)} →</b>}</div></div>}</div>}
        {notice && notice !== '__new__' && <div className="inline-error">{notice}</div>}
        <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </dialog>
  </section>;
}
