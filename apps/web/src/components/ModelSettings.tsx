import { useState, useEffect, useRef } from 'react';
import styles from '../styles/app.module.css';

type ProviderOptions = { sort?: 'price' | 'throughput'; only?: string[]; ignore?: string[]; allowFallbacks?: boolean };
type ModelValue = { id: string; providerOptions?: ProviderOptions } | string;

type Config = { models: { fable: ModelValue; opus: ModelValue; sonnet: ModelValue; haiku: ModelValue } };

const MODEL_TABS = [
  { key: 'fable', label: 'Fable' },
  { key: 'opus', label: 'Opus' },
  { key: 'sonnet', label: 'Sonnet' },
  { key: 'haiku', label: 'Haiku' },
] as const;

type ModelOption = { id: string; name: string };

type Endpoint = {
  tag: string;
  providerName: string;
  promptUsdPerM: number;
  completionUsdPerM: number;
  contextLength: number | null;
  quantization: string | null;
  uptimeLast30m: number | null;
  latencyMs: number | null;
  throughputTokPerSec: number | null;
};

function fmtPrice(v: number): string {
  if (v === 0) return 'free';
  return `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;
}

function fmtLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

type SortKey = 'tag' | 'promptUsdPerM' | 'completionUsdPerM' | 'contextLength' | 'uptimeLast30m' | 'latencyMs' | 'throughputTokPerSec';
type Sort = { key: SortKey; dir: 1 | -1 };

function compare(a: Endpoint, b: Endpoint, { key, dir }: Sort): number {
  const av = a[key], bv = b[key];
  // Bilinmeyen değer hangi yönde olursa olsun sonda kalsın
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)) * dir;
}

function SortHeader({ label, k, sort, onSort, className }: {
  label: string; k: SortKey; sort: Sort | null; onSort: (s: Sort | null) => void; className?: string;
}) {
  const active = sort?.key === k;
  function next() {
    if (!active) return onSort({ key: k, dir: 1 });
    if (sort.dir === 1) return onSort({ key: k, dir: -1 });
    onSort(null);
  }
  return (
    <button type="button" className={`${styles.sortHead} ${className || ''} ${active ? styles.sortActive : ''}`}
      onClick={next} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label}<span className={styles.sortArrow}>{active ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
    </button>
  );
}

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
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointsError, setEndpointsError] = useState(false);

  useEffect(() => {
    if (JSON.stringify(opts) !== JSON.stringify(parseModel(value).opts)) {
      onChange(buildModel(id, opts));
    }
  }, [opts, id, value, onChange]);

  useEffect(() => {
    setEndpoints([]);
    setEndpointsError(false);
    if (!id.trim()) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/models/endpoints?model=${encodeURIComponent(id.trim())}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
        .then((list: Endpoint[]) => setEndpoints(list))
        .catch((e: Error) => { if (e.name !== 'AbortError') setEndpointsError(true); });
    }, 500);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [id]);

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

      <ProviderPicker
        label="Only (providers)"
        selected={opts?.only || []}
        onChange={setOnly}
        endpoints={endpoints}
        error={endpointsError}
        emptyHint={id.trim() ? 'No providers listed for this model' : 'Select a model first'}
      />
      <ProviderPicker
        label="Ignore (providers)"
        selected={opts?.ignore || []}
        onChange={setIgnore}
        endpoints={endpoints}
        error={endpointsError}
        emptyHint={id.trim() ? 'No providers listed for this model' : 'Select a model first'}
      />

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

function ProviderPicker({ label, selected, onChange, endpoints, error, emptyHint }: {
  label: string;
  selected: string[];
  onChange: (t: string[]) => void;
  endpoints: Endpoint[];
  error: boolean;
  emptyHint: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);

  const filtered = query.trim()
    ? endpoints.filter(e => `${e.tag} ${e.providerName}`.toLowerCase().includes(query.toLowerCase()))
    : endpoints;
  const matches = sort ? [...filtered].sort((a, b) => compare(a, b, sort)) : filtered;

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag]);
  }

  return (
    <div className={styles.field}>
      <label>{label}</label>

      {selected.length > 0 && (
        <div className={styles.tagList}>
          {selected.map(tag => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button onClick={() => toggle(tag)}>x</button>
            </span>
          ))}
        </div>
      )}

      {error && <div className={styles.hint}>Could not load provider list</div>}

      {!error && endpoints.length === 0 && <div className={styles.hint}>{emptyHint}</div>}

      {!error && endpoints.length > 0 && (
        <>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="filter providers..." />
          {matches.length === 0 && <div className={styles.hint}>No matching providers</div>}
          <div className={styles.providerList}>
            <div className={styles.providerHead}>
              <span />
              <SortHeader label="Provider" k="tag" sort={sort} onSort={setSort} />
              <SortHeader label="In/M" k="promptUsdPerM" sort={sort} onSort={setSort} className={styles.num} />
              <SortHeader label="Out/M" k="completionUsdPerM" sort={sort} onSort={setSort} className={styles.num} />
              <SortHeader label="Ctx" k="contextLength" sort={sort} onSort={setSort} className={styles.num} />
              <span>Quant</span>
              <SortHeader label="Uptime" k="uptimeLast30m" sort={sort} onSort={setSort} className={styles.num} />
              <SortHeader label="Lat" k="latencyMs" sort={sort} onSort={setSort} className={styles.num} />
              <SortHeader label="Tok/s" k="throughputTokPerSec" sort={sort} onSort={setSort} className={styles.num} />
            </div>
            {matches.map(e => {
              const checked = selected.includes(e.tag);
              const up = e.uptimeLast30m;
              return (
                <label key={e.tag} className={styles.providerOption}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(e.tag)} />
                  <span className={styles.providerTag} title={e.tag}>{e.tag}</span>
                  <span className={styles.num}>{fmtPrice(e.promptUsdPerM)}</span>
                  <span className={styles.num}>{fmtPrice(e.completionUsdPerM)}</span>
                  <span className={styles.num}>{e.contextLength ? `${Math.round(e.contextLength / 1000)}K` : <span className={styles.empty}>—</span>}</span>
                  <span className={styles.providerQuant}>{e.quantization && e.quantization !== 'unknown' ? e.quantization : <span className={styles.empty}>—</span>}</span>
                  <span className={`${styles.num} ${up === null ? styles.empty : up >= 99 ? styles.providerUp : styles.providerDegraded}`}>
                    {up === null ? '—' : `${Math.round(up)}%`}
                  </span>
                  <span className={`${styles.num} ${e.latencyMs === null ? styles.empty : ''}`}>
                    {e.latencyMs === null ? '—' : fmtLatency(e.latencyMs)}
                  </span>
                  <span className={`${styles.num} ${e.throughputTokPerSec === null ? styles.empty : ''}`}>
                    {e.throughputTokPerSec === null ? '—' : Math.round(e.throughputTokPerSec)}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ModelAutocomplete({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState(value);
  const [matches, setMatches] = useState<ModelOption[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  // Canlı arama: her tuşta sunucuya sor (200ms debounce), eski yanıtı iptal et
  useEffect(() => {
    const q = query.trim();
    if (!q || q === value) { setMatches([]); setShow(false); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/models?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : [])
        .then((list: ModelOption[]) => { setMatches(list); setShow(true); })
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, value]);

  // Seçimden sonra gelen blur, tıklanan id'yi yazılan metinle ezmesin
  const picked = useRef(false);

  function pick(id: string) {
    picked.current = true;
    setQuery(id);
    onChange(id);
    setShow(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input type="text" value={query} onChange={e => setQuery(e.target.value)}
        onBlur={() => {
          if (!picked.current) onChange(query);
          picked.current = false;
          setTimeout(() => setShow(false), 200);
        }}
        placeholder="type to search models..." autoComplete="off" />
      {show && matches.length > 0 && (
        <div className={styles.autocomplete}>
          {matches.map(opt => (
            <div key={opt.id} className={styles.autocompleteItem} onMouseDown={() => pick(opt.id)}>
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

  useEffect(() => { setModels(config.models); }, [config]);

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
        }} />

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
        {activeTab === 'fable' && renderModelField('fable', 'Fable')}
        {activeTab === 'opus' && renderModelField('opus', 'Opus')}
        {activeTab === 'sonnet' && renderModelField('sonnet', 'Sonnet')}
        {activeTab === 'haiku' && renderModelField('haiku', 'Haiku')}
      </div>

      <div className={styles.row}>
        <button onClick={() => onSave({ models })} className={styles.primary}>Save Models</button>
      </div>
    </section>
  );
}
