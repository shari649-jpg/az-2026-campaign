import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';

const B = {
  teal:       'var(--teal)',
  gold:       'var(--gold)',
  turquoise:  'var(--turquoise)',
  terracotta: 'var(--terracotta)',
  charcoal:   'var(--charcoal)',
  text:       'var(--text)',
  textMid:    'var(--text-mid)',
  textMute:   'var(--text-mute)',
  surface:    'var(--bg)',
  surfaceAlt: 'var(--surface-alt)',
  border:     'var(--border)',
};

function localStorageSafe(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

const HEAT_LABEL = { 1: 'Low heat', 2: 'Medium heat', 3: 'High heat' };

function HeatPeppers({ rating }) {
  const filled = Math.max(0, Math.min(3, rating || 0));
  return (
    <span title={HEAT_LABEL[filled] || ''} style={{ fontSize: 15, letterSpacing: 1 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} style={{ opacity: i < filled ? 1 : 0.18 }}>🌶️</span>
      ))}
    </span>
  );
}

function buildIssueText(issue) {
  const lines = [`── Issue Brief: ${issue.issue} ──`];
  lines.push(`Heat Rating: ${HEAT_LABEL[issue.heat_rating] || issue.heat_rating}`);
  if (issue.brief_statement)     lines.push(`Summary: ${issue.brief_statement}`);
  if (issue.relevant_stats)      lines.push(`Relevant Stats: ${issue.relevant_stats}`);
  if (issue.affected)            lines.push(`Affected: ${issue.affected}`);
  if (issue.gop_vulnerabilities) lines.push(`GOP Vulnerabilities: ${issue.gop_vulnerabilities}`);
  if (issue.messaging_angle)     lines.push(`Messaging Angle: ${issue.messaging_angle}`);
  if (issue.notes)               lines.push(`Notes: ${issue.notes}`);
  return lines.join('\n');
}

export default function IssuesPage() {
  const navigate = useNavigate();

  const [issues,     setIssues]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState({});
  const [search,     setSearch]     = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [pushed,     setPushed]     = useState({});
  const [lsError,    setLsError]    = useState(false);

  useEffect(() => { loadIssues(); }, []);

  async function loadIssues() {
    setLoading(true);
    setError(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ mode: 'issues' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load issues');
      setIssues(data.issues || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(issue) {
    setExpanded(p => ({ ...p, [issue]: !p[issue] }));
  }

  function pushToMM(issue) {
    const issueText = buildIssueText(issue);
    const payload = {
      sourceArticleId: null,
      sourceTitle: `Issue Brief: ${issue.issue}`,
      sourcePublication: 'AZ 2026 Issues Research',
      issueText,
      county: null, // Issues are not reliably tied to a single county — "affected" is free text
      // Was hardcoded blank — messaging_angle already appears inside issueText's
      // general blob, but never got surfaced as its own Focal Point, so Message
      // Machine's prompt never gave it the distinct emphasis that field is for.
      focalPoint: '',
      pushedAt: new Date().toISOString(),
    };
    const ok = localStorageSafe('rr_pending_article', payload);
    if (!ok) { setLsError(true); return; }
    setPushed(p => ({ ...p, [issue.issue]: true }));
    navigate('/messaging');
  }

  const filtered = (issues || []).filter(i => {
    if (activeOnly && !i.active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [i.issue, i.brief_statement, i.affected, i.gop_vulnerabilities, i.messaging_angle]
      .join(' ').toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => (b.heat_rating || 0) - (a.heat_rating || 0));

  return (
    <div style={{ padding: '0 24px', fontFamily: "'Atkinson Hyperlegible', Georgia, serif" }}>
      {/* Instructions */}
      <div style={{ background: B.surfaceAlt, border: `1px solid ${B.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Browse statewide and district-level issue briefs.</strong>{' '}
          Each brief includes relevant stats, GOP vulnerabilities, and a ready-to-use messaging angle.
          Hotter chili ratings mean higher current relevance. Send any brief straight to Message Machine.
        </p>
      </div>

      {/* Search + filter row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: B.textMid, marginBottom: 8 }}>
            Search Issues
          </label>
          <input
            style={{ width: '100%', padding: '12px 16px', border: `2px solid ${B.border}`, borderRadius: 10, fontSize: 15, fontFamily: 'inherit', color: B.text, outline: 'none', boxSizing: 'border-box' }}
            placeholder='e.g. "water", "vouchers", "Medicaid", "LD16"'
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setActiveOnly(a => !a)}
          style={{
            padding: '11px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            background: activeOnly ? B.teal : B.surface,
            color: activeOnly ? '#fff' : B.textMid,
            border: `1.5px solid ${activeOnly ? B.teal : B.border}`,
            whiteSpace: 'nowrap',
          }}
        >
          {activeOnly ? '✓ Active issues only' : 'Show all issues'}
        </button>
        <button onClick={loadIssues} style={{ padding: '11px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'transparent', color: B.textMid, border: `1.5px solid ${B.border}`, whiteSpace: 'nowrap' }}>
          ↺ Refresh
        </button>
      </div>

      {/* lsError */}
      {lsError && (
        <div style={{ background: '#fff7ed', border: '1.5px solid #f5c842', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#7a4f00', fontSize: 14 }}>
          <strong>⚠️ Could not send to Message Machine</strong> — browser storage is disabled. Copy the content manually.
          <button onClick={() => setLsError(false)} style={{ marginLeft: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#7a4f00' }}>✕</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: B.textMute, fontSize: 16 }}>
          Loading issue briefs…
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#991b1b', fontSize: 15 }}>
          {error}
          <button onClick={loadIssues} style={{ marginLeft: 12, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 14 }}>Retry</button>
        </div>
      )}

      {/* Results count */}
      {issues && !loading && (
        <p style={{ fontSize: 15, color: B.textMid, fontWeight: 700, marginBottom: 16 }}>
          {sorted.length} issue{sorted.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
          {activeOnly ? ' · active only' : ''}
        </p>
      )}

      {/* Issue cards */}
      {sorted.map(issue => {
        const isExpanded = expanded[issue.issue];
        const wasPushed = pushed[issue.issue];

        return (
          <div key={issue.issue} style={{ background: B.surface, border: `1.5px solid ${B.border}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
            {/* Card header — always visible */}
            <div
              onClick={() => toggleExpand(issue.issue)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: B.teal }}>{issue.issue}</div>
                {issue.brief_statement && (
                  <div style={{ fontSize: 13, color: B.textMute, marginTop: 3, lineHeight: 1.5 }}>{issue.brief_statement}</div>
                )}
              </div>
              {!issue.active && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: '#f0f0f0', color: '#999', whiteSpace: 'nowrap' }}>
                  Inactive
                </span>
              )}
              <HeatPeppers rating={issue.heat_rating} />
              <span style={{ fontSize: 18, color: B.textMute, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div style={{ borderTop: `1.5px solid ${B.border}`, padding: '18px 20px', background: '#fafafa' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 18 }}>
                  {issue.relevant_stats && (
                    <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '12px 14px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Relevant Stats</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{issue.relevant_stats}</div>
                    </div>
                  )}
                  {issue.affected && (
                    <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Races, Districts &amp; Counties Affected</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{issue.affected}</div>
                    </div>
                  )}
                  {issue.gop_vulnerabilities && (
                    <div style={{ background: '#fef2f2', border: `1px solid #fca5a5`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>GOP Vulnerabilities</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{issue.gop_vulnerabilities}</div>
                    </div>
                  )}
                  {issue.messaging_angle && (
                    <div style={{ background: `${B.teal}08`, border: `1px solid ${B.teal}30`, borderRadius: 8, padding: '12px 14px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.teal, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Messaging Angle / AZ Angle</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{issue.messaging_angle}</div>
                    </div>
                  )}
                  {issue.notes && (
                    <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '12px 14px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Notes</div>
                      <div style={{ fontSize: 14, color: B.text, lineHeight: 1.6 }}>{issue.notes}</div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => pushToMM(issue)}
                  disabled={wasPushed}
                  style={{ padding: '10px 22px', background: wasPushed ? '#aaa' : 'var(--purple)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: wasPushed ? 'default' : 'pointer' }}
                >
                  {wasPushed ? '✓ Sent to Message Machine' : 'Send issue brief to Message Machine →'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {issues && !loading && sorted.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: B.textMute, fontSize: 15 }}>
          No issues found{search ? ` for "${search}"` : ''}.
        </div>
      )}
    </div>
  );
}
