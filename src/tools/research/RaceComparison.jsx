import { useState, useEffect, useMemo } from 'react';

const B = {
  teal:       '#1D5C4A',
  tealLight:  '#2a7a62',
  gold:       '#F5C842',
  turquoise:  '#3ECFB2',
  terracotta: '#C1673A',
  charcoal:   '#4A4558',
  pageBg:     '#FAFAF7',
  surface:    '#FFFFFF',
  surfaceAlt: '#F3F4F0',
  border:     '#C8C4BC',
  text:       '#1A1A1A',
  textMid:    '#4A4558',
  textMute:   '#888580',
  dBlue:      '#1a56b0',
  dBlueBg:    '#eff6ff',
  rRed:       '#b91c1c',
  rRedBg:     '#fff1f1',
};

const FACT_COLORS = {
  accomplishment: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  vulnerability:  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  strength:       { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  quote:          { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  background:     { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

function partyColor(party) {
  const p = (party || '').toUpperCase();
  if (p === 'D') return { bg: B.dBlue, text: '#fff', lightBg: B.dBlueBg };
  if (p === 'R') return { bg: B.rRed,  text: '#fff', lightBg: B.rRedBg  };
  return              { bg: B.charcoal, text: '#fff', lightBg: B.surfaceAlt };
}

function candidateLabel(c) {
  const parts = [c.candidate_name];
  if (c.party)    parts.push(c.party);
  if (c.office)   parts.push(c.office);
  if (c.district) parts.push(c.district);
  return parts.join(' · ');
}

function factsToText(c) {
  const header = `── ${candidateLabel(c)} ──`;
  const lines = (c.facts || []).map(f => {
    const tag = f.type ? `[${f.type.toUpperCase()}${f.category ? ' – ' + f.category : ''}] ` : '';
    return `• ${tag}${f.text}`;
  });
  return [header, ...lines].join('\n');
}

const FILTER_TYPES = [
  { id: 'all',            label: 'All' },
  { id: 'accomplishment', label: 'Accomplishments' },
  { id: 'vulnerability',  label: 'Vulnerabilities' },
  { id: 'strength',       label: 'Strengths' },
  { id: 'quote',          label: 'Quotes' },
  { id: 'background',     label: 'Background' },
];

export default function RaceComparison() {
  const [races,    setRaces]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [filter,   setFilter]   = useState('all');
  const [expanded, setExpanded] = useState({});   // candidateName -> bool
  const [selected, setSelected] = useState({});   // candidateName -> candidate object
  const [pushed,   setPushed]   = useState(false);
  const [search,   setSearch]   = useState('');   // race-level filter

  // Load all races on mount
  useEffect(() => {
    loadRaces();
  }, []);

  async function loadRaces() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'races' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Failed to load races'); return; }
      setRaces(data.races);
    } catch (err) {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  const selectedList = Object.values(selected);
  const hasSelected  = selectedList.length > 0;

  // Filter races by search term (office or district)
  const filteredRaces = useMemo(() => {
    if (!races) return [];
    const q = search.trim().toLowerCase();
    if (!q) return races;
    return races.filter(r =>
      (r.office || '').toLowerCase().includes(q) ||
      (r.district || '').toLowerCase().includes(q) ||
      r.candidates.some(c => c.candidate_name.toLowerCase().includes(q))
    );
  }, [races, search]);

  function toggleExpand(name) {
    setExpanded(p => ({ ...p, [name]: !p[name] }));
  }

  function toggleSelect(candidate) {
    setSelected(p => {
      const next = { ...p };
      if (next[candidate.candidate_name]) delete next[candidate.candidate_name];
      else next[candidate.candidate_name] = candidate;
      return next;
    });
    setPushed(false);
  }

  function pushToMessageMachine() {
    const candidates = hasSelected ? selectedList : (races || []).flatMap(r => r.candidates);
    const sections = candidates.map(c => factsToText(c)).join('\n\n');
    const payload = {
      sourceArticleId:   null,
      sourceTitle:       `Candidate Research: ${candidates.map(c => c.candidate_name).join(', ')}`,
      sourcePublication: 'AZ 2026 Candidate Research',
      issueText:         sections,
      focalPoint:        candidates[0]?.facts?.[0]?.text || '',
      pushedAt:          new Date().toISOString(),
    };
    try {
      localStorage.setItem('rr_pending_article', JSON.stringify(payload));
      setPushed(true);
    } catch {}
  }

  const S = {
    wrap:       { fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text },
    label:      { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: B.textMid, marginBottom: 6, display: 'block' },
    input:      { width: '100%', padding: '11px 16px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 15, color: B.text, background: B.surface, fontFamily: 'inherit', boxSizing: 'border-box' },
    btnPrimary: { background: B.teal, color: '#fff', fontWeight: 700, padding: '10px 22px', borderRadius: 8, border: `2px solid ${B.tealLight}`, cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
    btnGold:    { background: B.gold, color: B.teal, fontWeight: 700, padding: '10px 22px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
    btnSmall:   { background: 'transparent', color: B.textMid, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: `1px solid ${B.border}`, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
    filterBtn:  (active) => ({
      padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      background: active ? B.teal : B.surface,
      color:      active ? '#fff' : B.textMid,
      border:     active ? `1.5px solid ${B.tealLight}` : `1.5px solid ${B.border}`,
    }),
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={S.wrap}>

      {/* Instructions */}
      <div style={{ background: B.surfaceAlt, border: `1px solid ${B.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Browse all races with D vs R side-by-side.</strong>{' '}
          Filter by fact type, search by office or district, and select candidates to send to Message Machine.
          Data loads directly from your Google Sheet — no AI calls needed.
        </p>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={S.label}>Filter Races</label>
          <input
            style={S.input}
            placeholder='Search by office, district, or candidate name…'
            value={search}
            onChange={e => { setSearch(e.target.value); setPushed(false); }}
          />
        </div>
        <button onClick={loadRaces} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>
          ↺ Refresh
        </button>
      </div>

      {/* Fact type filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {FILTER_TYPES.map(ft => (
          <button key={ft.id} type="button" onClick={() => setFilter(ft.id)} style={S.filterBtn(filter === ft.id)}>
            {ft.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#991b1b', fontSize: 15 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: B.textMute }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${B.surfaceAlt}`, borderTopColor: B.teal, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 16 }}>Loading race data from Google Sheet…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Summary bar */}
      {races && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <p style={{ fontSize: 15, color: B.textMid, fontWeight: 700, margin: 0 }}>
            {filteredRaces.length} race{filteredRaces.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : ''}
            {hasSelected && <span style={{ color: B.teal }}> · {selectedList.length} selected</span>}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {hasSelected && (
              <button onClick={() => setSelected({})} style={S.btnSmall}>Clear selection</button>
            )}
            <button
              onClick={pushToMessageMachine}
              style={{ ...S.btnGold, opacity: pushed ? 0.7 : 1, cursor: pushed ? 'default' : 'pointer' }}
            >
              {pushed
                ? '✓ Sent to Message Machine'
                : hasSelected
                  ? `Send ${selectedList.length} selected to Message Machine →`
                  : 'Send all to Message Machine →'
              }
            </button>
          </div>
        </div>
      )}

      {/* Race cards */}
      {!loading && filteredRaces.map((race, ri) => {
        const raceLabel = [race.office, race.district].filter(Boolean).join(' · ');
        const dCandidates = race.candidates.filter(c => c.party?.toUpperCase() === 'D');
        const rCandidates = race.candidates.filter(c => c.party?.toUpperCase() === 'R');
        const others      = race.candidates.filter(c => !['D','R'].includes((c.party || '').toUpperCase()));
        const hasContest  = dCandidates.length > 0 && rCandidates.length > 0;

        return (
          <div key={ri} style={{ marginBottom: 28, border: `1.5px solid ${B.border}`, borderRadius: 12, overflow: 'hidden', background: B.surface }}>

            {/* Race header */}
            <div style={{
              background: hasContest ? B.teal : B.surfaceAlt,
              color: hasContest ? '#fff' : B.textMid,
              padding: '12px 20px',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '0.02em' }}>{raceLabel}</span>
              {hasContest && (
                <span style={{ background: B.gold, color: B.teal, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                  ⚡ Contest
                </span>
              )}
              <span style={{ fontSize: 13, opacity: 0.75, marginLeft: 'auto' }}>
                {race.candidates.length} candidate{race.candidates.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Candidate columns */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: hasContest
                ? `repeat(${dCandidates.length + rCandidates.length + others.length}, 1fr)`
                : '1fr',
              gap: 0,
            }}>
              {[...dCandidates, ...rCandidates, ...others].map((candidate, ci, arr) => {
                const isExpanded = expanded[candidate.candidate_name];
                const isSelected = !!selected[candidate.candidate_name];
                const pc = partyColor(candidate.party);

                // Apply fact type filter
                const factsToShow = filter === 'all'
                  ? (candidate.facts || [])
                  : (candidate.facts || []).filter(f => f.type === filter);

                const borderLeft = ci > 0 ? `1px solid ${B.border}` : undefined;

                return (
                  <div
                    key={candidate.candidate_name}
                    style={{
                      borderLeft,
                      background: isSelected ? pc.lightBg : B.surface,
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Candidate header */}
                    <div style={{
                      padding: '14px 16px',
                      borderBottom: `1px solid ${B.border}`,
                      borderTop: `3px solid ${pc.bg}`,
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(candidate)}
                        style={{ width: 17, height: 17, marginTop: 4, accentColor: B.teal, flexShrink: 0, cursor: 'pointer' }}
                        aria-label={`Select ${candidate.candidate_name}`}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: B.text }}>{candidate.candidate_name}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: pc.bg, color: pc.text }}>
                            {candidate.party}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: B.textMute, margin: 0 }}>
                          {candidate.facts?.length || 0} fact{(candidate.facts?.length || 0) !== 1 ? 's' : ''} on file
                        </p>
                      </div>
                      <button
                        onClick={() => toggleExpand(candidate.candidate_name)}
                        style={{ ...S.btnSmall, flexShrink: 0 }}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? '▲ Hide' : `${factsToShow.length} facts ▼`}
                      </button>
                    </div>

                    {/* Facts */}
                    {isExpanded && (
                      <div style={{ padding: '14px 16px' }}>
                        {factsToShow.length === 0 ? (
                          <p style={{ color: B.textMute, fontSize: 14, margin: 0 }}>
                            {filter !== 'all' ? `No ${filter} facts for this candidate.` : 'No facts on file.'}
                          </p>
                        ) : (
                          factsToShow.map((fact, fi) => {
                            const fc = FACT_COLORS[fact.type] || FACT_COLORS.background;
                            return (
                              <div key={fi} style={{ background: fc.bg, border: `1px solid ${fc.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: fc.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{fact.type}</span>
                                  {fact.category && <span style={{ fontSize: 11, color: fc.text, opacity: 0.8 }}>· {fact.category}</span>}
                                </div>
                                <p style={{ fontSize: 14, color: B.text, lineHeight: 1.6, margin: '0 0 10px 0', fontStyle: fact.type === 'quote' ? 'italic' : 'normal' }}>
                                  {fact.type === 'quote' ? `"${fact.text}"` : fact.text}
                                </p>
                                <button
                                  onClick={() => {
                                    const label = `── ${candidateLabel(candidate)} ──`;
                                    const tag = fact.type ? `[${fact.type.toUpperCase()}${fact.category ? ' – ' + fact.category : ''}] ` : '';
                                    const payload = {
                                      sourceArticleId:   null,
                                      sourceTitle:       `${candidate.candidate_name} – ${fact.category || fact.type}`,
                                      sourcePublication: 'AZ 2026 Candidate Research',
                                      issueText:         `${label}\n• ${tag}${fact.text}`,
                                      focalPoint:        fact.text,
                                      pushedAt:          new Date().toISOString(),
                                    };
                                    try { localStorage.setItem('rr_pending_article', JSON.stringify(payload)); setPushed(true); } catch {}
                                  }}
                                  style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: `1px solid ${fc.border}`, background: 'transparent', color: fc.text, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  Use in Message Machine →
                                </button>
                              </div>
                            );
                          })
                        )}
                        <button
                          onClick={() => toggleSelect(candidate)}
                          style={{ ...S.btnSmall, marginTop: 4, color: isSelected ? B.terracotta : B.teal, borderColor: isSelected ? B.terracotta : B.teal }}
                        >
                          {isSelected ? '✓ Selected' : '+ Select for Message Machine'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && races && filteredRaces.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: B.textMute }}>
          <p style={{ fontSize: 16 }}>No races match "{search}".</p>
          <button onClick={() => setSearch('')} style={{ ...S.btnSmall, marginTop: 8 }}>Clear search</button>
        </div>
      )}

      {/* Floating selection bar */}
      {hasSelected && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: B.teal, color: '#fff', borderRadius: 12,
          padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 50, flexWrap: 'wrap',
          maxWidth: '90vw',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {selectedList.length} candidate{selectedList.length !== 1 ? 's' : ''} selected:{' '}
            {selectedList.map(c => c.candidate_name).join(', ')}
          </span>
          <button
            onClick={pushToMessageMachine}
            style={{ background: B.gold, color: B.teal, fontWeight: 700, padding: '9px 20px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit', opacity: pushed ? 0.7 : 1 }}
          >
            {pushed ? '✓ Sent!' : 'Send to Message Machine →'}
          </button>
          <button onClick={() => setSelected({})} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}
    </div>
  );
}
