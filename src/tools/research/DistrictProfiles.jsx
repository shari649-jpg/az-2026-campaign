import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const B = {
  teal:      '#1D5C4A',
  tealDark:  '#164437',
  turquoise: '#3ECFB2',
  gold:      '#F5C842',
  charcoal:  '#4A4558',
  text:      '#111',
  textMid:   '#444',
  textMute:  '#777',
  surface:   '#fff',
  surfaceAlt:'#f3f4f6',
  border:    '#ddd',
};

function localStorageSafe(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function buildDistrictIssueText(d) {
  const lines = [`── District Profile: ${d.district_id} ──`];
  if (d.race_type)        lines.push(`Race Type: ${d.race_type}`);
  if (d.location_note)    lines.push(`Location: ${d.location_note}`);
  if (d.registration)     lines.push(`Registration: ${d.registration}`);
  if (d.voting_history)   lines.push(`Voting History: ${d.voting_history}`);
  if (d.demographics)     lines.push(`Demographics: ${d.demographics}`);
  if (d.top_issues)       lines.push(`Top Issues: ${d.top_issues}`);
  if (d.message_guidance) lines.push(`Messaging Guidance: ${d.message_guidance}`);
  return lines.join('\n');
}

const RACE_TYPE_COLOR = {
  'Federal':    { bg: '#e8f0fe', text: '#1a56cc', border: '#93b4f5' },
  'Statewide':  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'State House':{ bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
  'State Senate':{ bg: '#f0fdf4', text: '#166534', border: '#86efac' },
};
function raceTypeColor(type) {
  for (const key of Object.keys(RACE_TYPE_COLOR)) {
    if ((type || '').toLowerCase().includes(key.toLowerCase())) return RACE_TYPE_COLOR[key];
  }
  return { bg: B.surfaceAlt, text: B.textMid, border: B.border };
}

export default function DistrictProfiles() {
  const navigate = useNavigate();

  const [districts,  setDistricts]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState({});
  const [search,     setSearch]     = useState('');
  const [pushed,     setPushed]     = useState({});
  const [lsError,    setLsError]    = useState(false);

  useEffect(() => {
    loadDistricts();
  }, []);

  async function loadDistricts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'districts' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load districts');
      setDistricts(data.districts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id) {
    setExpanded(p => ({ ...p, [id]: !p[id] }));
  }

  function pushToMM(d) {
    const issueText = buildDistrictIssueText(d);
    const payload = {
      sourceArticleId: null,
      sourceTitle: `District Profile: ${d.district_id}`,
      sourcePublication: 'AZ 2026 District Research',
      issueText,
      focalPoint: '',
      pushedAt: new Date().toISOString(),
    };
    const ok = localStorageSafe('rr_pending_article', payload);
    if (!ok) { setLsError(true); return; }
    setPushed(p => ({ ...p, [d.district_id]: true }));
    navigate('/messaging');
  }

  const filtered = (districts || []).filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [d.district_id, d.race_type, d.location_note, d.top_issues, d.demographics]
      .join(' ').toLowerCase().includes(q);
  });

  return (
    <div style={{ padding: '0 24px' }}>
      {/* lsError */}
      {lsError && (
        <div style={{ background: '#fff7ed', border: '1.5px solid #f5c842', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#7a4f00', fontSize: 14 }}>
          <strong>⚠️ Could not send to Message Machine</strong> — browser storage is disabled. Copy the content manually.
          <button onClick={() => setLsError(false)} style={{ marginLeft: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#7a4f00' }}>✕</button>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: B.textMid, marginBottom: 8 }}>
          Search Districts
        </label>
        <input
          style={{ width: '100%', padding: '12px 16px', border: `2px solid ${B.border}`, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', color: B.text, outline: 'none' }}
          placeholder='e.g. "LD04", "CD01", "Tucson", "housing"'
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: B.textMute, fontSize: 16 }}>
          Loading district profiles…
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#991b1b', fontSize: 15 }}>
          {error}
          <button onClick={loadDistricts} style={{ marginLeft: 12, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 14 }}>Retry</button>
        </div>
      )}

      {/* Results count */}
      {districts && !loading && (
        <p style={{ fontSize: 15, color: B.textMid, fontWeight: 700, marginBottom: 16 }}>
          {filtered.length} district{filtered.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
        </p>
      )}

      {/* District cards */}
      {filtered.map(d => {
        const isExpanded = expanded[d.district_id];
        const rc = raceTypeColor(d.race_type);
        const wasPushed = pushed[d.district_id];

        return (
          <div key={d.district_id} style={{ background: B.surface, border: `1.5px solid ${B.border}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
            {/* Card header — always visible */}
            <div
              onClick={() => toggleExpand(d.district_id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: B.teal }}>{d.district_id}</div>
                <div style={{ fontSize: 12, color: B.textMute, marginTop: 2 }}>{d.race_type}</div>
              </div>
              {d.location_note && (
                <div style={{ fontSize: 14, color: B.textMid, flex: 1 }}>{d.location_note}</div>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`, whiteSpace: 'nowrap' }}>
                {d.race_type}
              </span>
              <span style={{ fontSize: 18, color: B.textMute, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div style={{ borderTop: `1.5px solid ${B.border}`, padding: '18px 20px', background: '#fafafa' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 18 }}>
                  {d.registration && (
                    <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Registration</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{d.registration}</div>
                    </div>
                  )}
                  {d.voting_history && (
                    <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Voting History</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{d.voting_history}</div>
                    </div>
                  )}
                  {d.demographics && (
                    <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Demographics</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{d.demographics}</div>
                    </div>
                  )}
                  {d.top_issues && (
                    <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Top Issues</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{d.top_issues}</div>
                    </div>
                  )}
                  {d.message_guidance && (
                    <div style={{ background: `${B.teal}08`, border: `1px solid ${B.teal}30`, borderRadius: 8, padding: '12px 14px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.teal, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Messaging Guidance</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{d.message_guidance}</div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => pushToMM(d)}
                  disabled={wasPushed}
                  style={{ padding: '10px 22px', background: wasPushed ? '#aaa' : B.gold, color: wasPushed ? '#fff' : B.teal, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: wasPushed ? 'default' : 'pointer' }}
                >
                  {wasPushed ? '✓ Sent to Message Machine' : 'Send district profile to Message Machine →'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {districts && !loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: B.textMute, fontSize: 15 }}>
          No districts found{search ? ` for "${search}"` : ''}.
        </div>
      )}
    </div>
  );
}
