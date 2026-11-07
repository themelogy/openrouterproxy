import { useState, useEffect } from 'react';
import styles from '../styles/app.module.css';

type ProviderOptions = { sort?: 'price' | 'throughput'; only?: string[]; ignore?: string[]; allowFallbacks?: boolean };
type ModelValue = { id: string; providerOptions?: ProviderOptions } | string;

type Config = { models: { opus: ModelValue; sonnet: ModelValue; haiku: ModelValue } };

const MODEL_TABS = [
  { key: 'opus', label: 'Opus' },
  { key: 'sonnet', label: 'Sonnet' },
  { key: 'haiku', label: 'Haiku' },
] as const;

type ModelOption = { id: string; name: string };

function parseModel(val: ModelValue): { id: string; opts?: ProviderOptions } {
  if (typeof val === 'object') return { id: val.id, opts: (val as any).providerOptions };
  return { id: val };
}

function buildModel(id: string, opts?: ProviderOptions): ModelValue {
  return opts ? { id, providerOptions: opts } : id;
}

function ProviderBlock({ value, onChange }: { value: ModelValue; onChange: (v: ModelValue) => void }) {
  const { id } = parseModel(value);
  const [opts, setOpts] = useState<ProviderOptions | undefined>(() => parseModel(value).opts);

  useEffect(() => {
    if (JSON.stringify(opts) !== JSON.stringify(parseModel(value).opts)) {
      onChange(buildModel(id, opts));
    }
  }, [opts, id, value, onChange]);

  function setOnly(values: string[]) {
    setOpts(o => ({ ...o, only: values.length ? values : undefined, allowFallbacks: values.length ? false : undefined }));
  }

  function setIgnore(values: string[]) {
    setOpts(o => ({ ...o, ignore: values.length ? values : undefined }));
  }

  return (
    <div className={styles.providerBlock}>
      <h4>Provider Routing</h4>

      <div className={styles.providerRow}>
        <label>Sort</label>
        <select value={opts?.sort || 'default'} onChange={e => {
          const val = e.target.value;
          setOpts(o => ({ ...o, sort: val === 'default' ? undefined : (val as 'price' | 'throughput') }));
        }}>
          <option value="default">Default</option>
          <option value="price">Price</option>
          <option value="throughput">Throughput</option>
        </select>
      </div>

      <ProviderTagList label="Only (providers)" tags={opts?.only || []} onChange={setOnly} />
      <ProviderTagList label="Ignore (providers)" tags={opts?.ignore || []} onChange={setIgnore} />

      <div className={styles.checkboxRow}>
        <input type="checkbox"  id={`af-${id}`}  checked={!!opts?.allowFallbacks}
          onChange={e => setOpts(o => ({ ...o, allowFallbacks: e.target.checked }))} 
        />
        <label htmlFor={`af-${id}`}>Allow fallbacks</label>
      </div>

      <button onClick={() => setOpts(() => undefined)} style={{ marginTop: 8, fontSize: 12 }}>Clear routing</button>
    </div>
  );
}

function ProviderTagList({ label, tags, onChange }: { label: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) { onChange([...tags, tag]); setInput(''); }
  }

  function removeTag(tag: string) { onChange(tags.filter(t => t !== tag)); }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
  }

  return (
    <div className={styles.field}>
      <label>{label}</label>
      <div className={styles.tagList}>
        {tags.map(tag => (
          <span key={tag} className={styles.tag}>
            {tag}
            <button onClick={() => removeTag(tag)}>x</button>
          </span>
        ))}
        <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder="fireworks" />
      </div>
    </div>
  );
}

function ModelAutocomplete({ value, onChange, allModels }: { value: string; onChange: (id: string) => void; allModels: ModelOption[] }) {
  const [query, setQuery] = useState(value);
  const [filtered, setFiltered] = useState<ModelOption[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  function filter(q: string) {
    setQuery(q);
    if (!q.trim()) { setFiltered([]); setShow(false); onChange(q); return; }
    const lc = q.toLowerCase();
    const matches = allModels.filter(m => m.id.toLowerCase().includes(lc) || m.name?.toLowerCase().includes(lc));
    setFiltered(matches.slice(0, 20));
    setShow(true);
    onChange(q);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input type="text" value={query} onChange={e => filter(e.target.value)}
        onFocus={() => filtered.length && setShow(true)} onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder="type to search models..." autoComplete="off" />
      {show && filtered.length > 0 && (
        <div className={styles.autocomplete}>
          {filtered.map(opt => (
            <div key={opt.id} className={styles.autocompleteItem}
              onMouseDown={() => { filter(opt.id); setShow(false); }}>
              <span>{opt.id}</span>
              {opt.name && <span style={{ color: 'var(--textMuted)', fontSize: 12, marginLeft: 8 }}>{opt.name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModelSettings({ config, onSave }: {
  config: Config;
  onSave: (partial: Partial<Config>) => void;
}) {
  const [models, setModels] = useState(config.models);
  const [activeTab, setActiveTab] = useState<keyof Config['models']>('opus');
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setModels(config.models); }, [config]);

  async function refreshModels() {
    setLoading(true);
    try {
      const r = await fetch('/api/models');
      if (r.ok) setAllModels(await r.json());
    } catch { /* */ } finally { setLoading(false); }
  }

  useEffect(() => { refreshModels(); }, []);

  function updateModel(key: keyof Config['models'], val: ModelValue) {
    setModels({ ...models, [key]: val });
  }

  function renderModelField(key: keyof Config['models'], label: string) {
    const value = models[key];
    const { id } = parseModel(value);

    return (
      <div className={styles.field}>
        <label>{label} Model</label>
        <ModelAutocomplete value={id} onChange={newId => {
          if (typeof value === 'object') updateModel(key, { ...value, id: newId } as ModelValue);
          else updateModel(key, newId);
        }} allModels={allModels} />

        <ProviderBlock value={value} onChange={v => updateModel(key, v)} />

        {typeof value === 'object' && (
          <button onClick={() => updateModel(key, id)} style={{ marginTop: 4, fontSize: 12 }}>Clear</button>
        )}
      </div>
    );
  }

  return (
    <section>
      <h2>Model Settings</h2>

      <div className={styles.tabs}>
        {MODEL_TABS.map(t => (
          <button key={t.key} className={activeTab === t.key ? styles.tabActive : ''}
            onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'opus' && renderModelField('opus', 'Opus')}
        {activeTab === 'sonnet' && renderModelField('sonnet', 'Sonnet')}
        {activeTab === 'haiku' && renderModelField('haiku', 'Haiku')}
      </div>

      <div className={styles.row}>
        <button onClick={() => onSave({ models })} className={styles.primary}>Save Models</button>
        <button onClick={refreshModels} disabled={loading}>{loading ? 'Updating...' : 'Update List'}</button>
      </div>
    </section>
  );
}
