import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function useScrollArrows() {
  const [showUp, setShowUp] = useState(false);
  const [showDown, setShowDown] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY;
      const atBottom = window.innerHeight + scrolled >= document.body.scrollHeight - 80;
      setShowUp(scrolled > 200);
      setShowDown(!atBottom && document.body.scrollHeight > window.innerHeight + 200);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return { showUp, showDown };
}

function localStorageSafe(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

const B = {
  teal:      '#1D5C4A',
  tealLight: '#2a7a62',
  gold:      '#F5C842',
  turquoise: '#3ECFB2',
  terracotta:'#C1673A',
  charcoal:  '#4A4558',
  pageBg:    '#FAFAF7',
  surface:   '#FFFFFF',
  surfaceAlt:'#F3F4F0',
  border:    '#C8C4BC',
  text:      '#1A1A1A',
  textMid:   '#4A4558',
  textMute:  '#888580',
  dBlue:     '#1a56b0',
  rRed:      '#b91c1c',
};

const FILTER_TYPES = [
  { id: 'all',            label: 'All' },
  { id: 'accomplishment', label: 'Accomplishments' },
  { id: 'vulnerability',  label: 'Vulnerabilities' },
  { id: 'strength',       label: 'Strengths' },
  { id: 'quote',          label: 'Quotes' },
  { id: 'background',     label: 'Background' },
];

const FACT_COLORS = {
  accomplishment: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  vulnerability:  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  strength:       { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  quote:          { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  background:     { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

function partyColor(party) {
  const p = (party || '').toUpperCase();
  if (p === 'D') return { bg: B.dBlue,    text: '#fff' };
  if (p === 'R') return { bg: B.rRed,     text: '#fff' };
  return              { bg: B.charcoal, text: '#fff' };
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

// Group candidates by office+district for contrast view
function groupByseat(results) {
  const seats = {};
  results.forEach(c => {
    const key = `${(c.office || '').trim()}|${(c.district || '').trim()}`;
    if (!seats[key]) seats[key] = [];
    seats[key].push(c);
  });
  return Object.values(seats);
}

export default function CandidateQuery() {
  const navigate = useNavigate();
  const { showUp, showDown } = useScrollArrows();
  const [query,     setQuery]     = useState('');
  const [filter,    setFilter]    = useState('all');
  const [results,   setResults]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lsError,   setLsError]   = useState(false);
  const [expanded,  setExpanded]  = useState({});
  const [selected,  setSelected]  = useState({});  // candidateName -> candidate object
  const [selectedFacts, setSelectedFacts] = useState({}); // `candidateName:factIndex` -> {candidate, fact}
  const [pushed,    setPushed]    = useState(false);
  const [districtMap,      setDistrictMap]      = useState({}); // district_id -> district object
  const [districtExpanded, setDistrictExpanded] = useState({}); // candidateName -> bool
  const [districtPushed,   setDistrictPushed]   = useState({}); // district_id -> bool

  const hasResults = results !== null;
  const selectedList = Object.values(selected);
  const hasSelected  = selectedList.length > 0;

  // Load district data on mount
  useEffect(() => {
    async function loadDistricts() {
      try {
        const res = await fetch('/.netlify/functions/query-candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'districts' }),
        });
        const data = await res.json();
        if (data.success && data.districts) {
          const map = {};
          data.districts.forEach(d => { map[d.district_id] = d; });
          setDistrictMap(map);
        }
      } catch { /* silent — district strips are supplementary */ }
    }
    loadDistricts();
  }, []);

  function buildDistrictIssueText(d) {
    const lines = [`── District Context: ${d.district_id} ──`];
    if (d.location_note)  lines.push(`Location: ${d.location_note}`);
    if (d.registration)   lines.push(`Registration: ${d.registration}`);
    if (d.voting_history) lines.push(`Voting History: ${d.voting_history}`);
    if (d.demographics)   lines.push(`Demographics: ${d.demographics}`);
    if (d.top_issues)     lines.push(`Top Issues: ${d.top_issues}`);
    return lines.join('\n');
  }

  function pushDistrictToMM(d) {
    const payload = {
      sourceArticleId: null,
      sourceTitle: `District Context: ${d.district_id}`,
      sourcePublication: 'AZ 2026 District Research',
      issueText: buildDistrictIssueText(d),
      focalPoint: '',
      pushedAt: new Date().toISOString(),
    };
    const ok = localStorageSafe('rr_pending_article', payload);
    if (!ok) { setLsError(true); return; }
    setDistrictPushed(p => ({ ...p, [d.district_id]: true }));
    navigate('/messaging');
  }

  // Client-side filter applied to already-loaded results
  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (filter === 'all') return results;
    return results
      .map(c => ({ ...c, facts: (c.facts || []).filter(f => f.type === filter) }))
      .filter(c => c.facts.length > 0);
  }, [results, filter]);

  const seatGroupsFiltered = useMemo(() => groupByseat(filteredResults), [filteredResults]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelected({});
    setSelectedFacts({});
    setPushed(false);

    try {
      const res = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), filterType: filter !== 'all' ? filter : null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Search failed'); return; }
      if (!data.results.length) { setError('No results found for that search. Try a different term.'); return; }
      setResults(data.results);
    } catch (err) {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleNewSearch() {
    setQuery('');
    setResults(null);
    setError(null);
    setSelected({});
    setSelectedFacts({});
    setPushed(false);
  }

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

  function toggleFact(candidate, factIndex, fact) {
    const key = `${candidate.candidate_name}:${factIndex}`;
    setSelectedFacts(p => {
      const next = { ...p };
      if (next[key]) delete next[key];
      else next[key] = { candidate, fact };
      return next;
    });
    setPushed(false);
  }

  function pushToMessageMachine() {
    const selectedFactList = Object.values(selectedFacts);
    const hasSelectedFacts = selectedFactList.length > 0;
    let issueText;
    if (hasSelectedFacts) {
      const byCandidate = {};
      selectedFactList.forEach(({ candidate, fact }) => {
        const label = candidateLabel(candidate);
        if (!byCandidate[label]) byCandidate[label] = [];
        const tag = fact.type ? `[${fact.type.toUpperCase()}${fact.category ? ' – ' + fact.category : ''}] ` : '';
        byCandidate[label].push(`• ${tag}${fact.text}`);
      });
      issueText = Object.entries(byCandidate)
        .map(([label, lines]) => `── ${label} ──\n${lines.join('\n')}`)
        .join('\n\n');
    } else {
      const candidates = hasSelected ? selectedList : (results || []);
      issueText = candidates.map(c => factsToText(c)).join('\n\n');
    }
    const payload = {
      sourceArticleId: null,
      sourceTitle: hasSelectedFacts ? 'Selected Facts — AZ 2026 Research' : `Candidate Research: ${(hasSelected ? selectedList : (results||[])).map(c => c.candidate_name).join(', ')}`,
      sourcePublication: 'AZ 2026 Candidate Research',
      issueText,
      focalPoint: '',
      pushedAt: new Date().toISOString(),
    };
    const ok = localStorageSafe('rr_pending_article', payload);
    if (!ok) { setLsError(true); return; }
    setPushed(true);
    navigate('/messaging');
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const S = {
    wrap:    { fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text },
    label:   { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: B.textMid, marginBottom: 6, display: 'block' },
    input:   { width: '100%', padding: '12px 16px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 16, color: B.text, background: B.surface, fontFamily: 'inherit' },
    btnPrimary: { background: B.teal, color: '#fff', fontWeight: 700, padding: '12px 28px', borderRadius: 8, border: `2px solid ${B.tealLight}`, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' },
    btnGold:    { background: B.gold, color: B.teal, fontWeight: 700, padding: '12px 24px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
    btnSmall:   { background: 'transparent', color: B.textMid, fontWeight: 700, padding: '6px 14px', borderRadius: 6, border: `1px solid ${B.border}`, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
    card:    { background: B.surface, border: `1.5px solid ${B.border}`, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
    filterBtn: (active) => ({
      padding: '7px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      background: active ? B.teal : B.surface,
      color:      active ? '#fff' : B.textMid,
      border:     active ? `1.5px solid ${B.tealLight}` : `1.5px solid ${B.border}`,
    }),
  };

  return (
    <div style={{ ...S.wrap, padding: '0 24px' }}>
      {/* ── Floating scroll arrows ── */}
      {showUp && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{ position: 'fixed', bottom: 72, right: 24, zIndex: 50, width: 40, height: 40, borderRadius: '50%', background: B.teal, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
          aria-label="Scroll to top">↑</button>
      )}
      {showDown && (
        <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
          style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50, width: 40, height: 40, borderRadius: '50%', background: B.teal, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
          aria-label="Scroll to bottom">↓</button>
      )}
      {/* ── Instructions ── */}
      <div style={{ background: B.surfaceAlt, border: `1px solid ${B.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Search candidate profiles by:</strong>{' '}
          issue or topic (e.g. <em>water</em>, <em>housing</em>, <em>education</em>),
          candidate name, office or seat (e.g. <em>governor</em>, <em>attorney general</em>, <em>state senate</em>),
          party (<em>Democrat</em>, <em>Republican</em>),
          or district (e.g. <em>LD16</em>, <em>LD2</em>).
          Select multiple candidates to compare or send together to Message Machine.
        </p>
      </div>

      {/* ── Search form ── */}
      <form onSubmit={handleSearch} style={{ marginBottom: 20 }}>
        <label style={S.label}>Search Candidates</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder='e.g. "water", "governor", "LD16", "housing vulnerabilities"'
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={loading}
          />
          {hasResults
            ? <button type="button" onClick={handleNewSearch} style={{ ...S.btnPrimary, background: B.charcoal, border: '2px solid #333', whiteSpace: 'nowrap' }}>↺ New Search</button>
            : <button type="submit" disabled={loading || !query.trim()} style={{ ...S.btnPrimary, opacity: loading || !query.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                {loading ? 'Searching…' : 'Search →'}
              </button>
          }
        </div>
        {hasResults && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {FILTER_TYPES.map(ft => (
              <button key={ft.id} type="button" onClick={() => setFilter(ft.id)} style={S.filterBtn(filter === ft.id)}>{ft.label}</button>
            ))}
          </div>
        )}
      </form>

      {/* ── localStorage error ── */}
      {lsError && (
        <div style={{ background: '#fff7ed', border: '1.5px solid #f5c842', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#7a4f00', fontSize: 14, lineHeight: 1.6 }}>
          <strong>⚠️ Could not send to Message Machine</strong> — your browser has storage disabled. Copy the content below manually and paste it into Message Machine.
          <button onClick={() => setLsError(false)} style={{ marginLeft: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#7a4f00', fontSize: 14 }}>✕</button>
        </div>
      )}
      {error && (
        <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#991b1b', fontSize: 15 }}>
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: B.textMute }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${B.surfaceAlt}`, borderTopColor: B.teal, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 16 }}>Searching candidate profiles…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Results ── */}
      {results && !loading && (
        <>
          {/* Results header + push button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <p style={{ fontSize: 15, color: B.textMid, fontWeight: 700 }}>
              {filteredResults.length} candidate{filteredResults.length !== 1 ? 's' : ''} found{filter !== 'all' ? ` (filtered: ${filter})` : ''}
              {Object.keys(selectedFacts).length > 0 && <span style={{ color: B.teal }}> · {Object.keys(selectedFacts).length} fact{Object.keys(selectedFacts).length !== 1 ? 's' : ''} selected</span>}
              {Object.keys(selectedFacts).length === 0 && hasSelected && <span style={{ color: B.teal }}> · {selectedList.length} candidate{selectedList.length !== 1 ? 's' : ''} selected</span>}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(hasSelected || Object.keys(selectedFacts).length > 0) && (
                <button onClick={() => { setSelected({}); setSelectedFacts({}); }} style={S.btnSmall}>Clear selection</button>
              )}
              <button
                onClick={pushToMessageMachine}
                style={{ ...S.btnGold, opacity: pushed ? 0.7 : 1, cursor: pushed ? 'default' : 'pointer' }}
              >
                {pushed ? '✓ Sent to Message Machine'
                  : Object.keys(selectedFacts).length > 0 ? `Send ${Object.keys(selectedFacts).length} fact${Object.keys(selectedFacts).length !== 1 ? 's' : ''} to Message Machine →`
                  : hasSelected ? `Send ${selectedList.length} candidate${selectedList.length !== 1 ? 's' : ''} to Message Machine →`
                  : 'Send all to Message Machine →'}
              </button>
            </div>
          </div>

          {/* Seat groups — always single-row, one candidate per card */}
          {seatGroupsFiltered.map((group, gi) => {
            const isContrast = group.length > 1;
            const seat = `${group[0].office || ''}${group[0].district ? ' · ' + group[0].district : ''}`;

            return (
              <div key={gi} style={{ marginBottom: isContrast ? 28 : 0 }}>
                {/* Contrast header */}
                {isContrast && (
                  <div style={{ background: B.teal, color: '#fff', borderRadius: '10px 10px 0 0', padding: '10px 18px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ background: B.gold, color: B.teal, borderRadius: 6, padding: '2px 10px', fontSize: 12 }}>⚡ Contrast</span>
                    {seat} — {group.length} candidates
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {group.map((candidate, ci) => {
                    const isExpanded = expanded[candidate.candidate_name];
                    const isSelected = !!selected[candidate.candidate_name];
                    const pc = partyColor(candidate.party);
                    const factsToShow = candidate.facts || [];

                    const districtData = candidate.district ? districtMap[candidate.district] : null;
                    const isDistrictExpanded = districtExpanded[candidate.candidate_name];

                    return (
                      <React.Fragment key={candidate.candidate_name}>
                      <div
                        style={{
                          ...S.card,
                          borderRadius: isContrast
                            ? ci === 0
                              ? '0 0 0 0'
                              : ci === group.length - 1
                                ? '0 0 10px 10px'
                                : 0
                            : 10,
                          borderTop: isContrast && ci > 0 ? 'none' : undefined,
                          borderLeft: isSelected ? `4px solid ${B.turquoise}` : undefined,
                          background: isSelected ? '#f0fdf9' : B.surface,
                        }}
                      >
                        {/* Candidate header */}
                        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: `1px solid ${B.border}` }}>
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(candidate)}
                            style={{ width: 18, height: 18, marginTop: 3, accentColor: B.teal, flexShrink: 0, cursor: 'pointer' }}
                            aria-label={`Select ${candidate.candidate_name}`}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontSize: 17, fontWeight: 700, color: B.text }}>{candidate.candidate_name}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: pc.bg, color: pc.text }}>{candidate.party}</span>
                            </div>
                            <p style={{ fontSize: 13, color: B.textMute, margin: 0 }}>
                              {candidate.office}{candidate.district ? ` · ${candidate.district}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleExpand(candidate.candidate_name)}
                            style={{ ...S.btnSmall, flexShrink: 0 }}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? 'Collapse ▲' : `${factsToShow.length} facts ▼`}
                          </button>
                        </div>

                        {/* Facts */}
                        {isExpanded && (
                          <div style={{ padding: '14px 16px' }}>
                            {factsToShow.length === 0
                              ? <p style={{ color: B.textMute, fontSize: 14 }}>No facts found for this filter.</p>
                              : factsToShow.map((fact, fi) => {
                                  const fc = FACT_COLORS[fact.type] || FACT_COLORS.background;
                                  const factKey = `${candidate.candidate_name}:${fi}`;
                                  const isFactSelected = !!selectedFacts[factKey];
                                  return (
                                    <div key={fi} style={{ background: fc.bg, border: `1.5px solid ${isFactSelected ? fc.text : fc.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={isFactSelected}
                                          onChange={() => toggleFact(candidate, fi, fact)}
                                          style={{ width: 15, height: 15, accentColor: B.teal, cursor: 'pointer', flexShrink: 0 }}
                                          aria-label={`Select fact: ${fact.text.substring(0, 40)}`}
                                        />
                                        <span style={{ fontSize: 11, fontWeight: 700, color: fc.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{fact.type}</span>
                                        {fact.category && <span style={{ fontSize: 11, color: fc.text, opacity: 0.8 }}>· {fact.category}</span>}
                                      </div>
                                      <p style={{ fontSize: 14, color: B.text, lineHeight: 1.6, margin: '0 0 10px 0', fontStyle: fact.type === 'quote' ? 'italic' : 'normal' }}>
                                        {fact.type === 'quote' ? `"${fact.text}"` : fact.text}
                                      </p>
                                      <button
                                        onClick={() => toggleFact(candidate, fi, fact)}
                                        style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: `1px solid ${fc.border}`, background: isFactSelected ? fc.text : 'transparent', color: isFactSelected ? '#fff' : fc.text, cursor: 'pointer', fontFamily: 'inherit' }}
                                      >
                                        {isFactSelected ? '✓ Selected' : 'Select fact →'}
                                      </button>
                                    </div>
                                  );
                                })
                            }
                            {/* Per-candidate send button */}
                            <button
                              onClick={() => {
                                toggleSelect(candidate);
                                // if already selected, deselect; push handled separately
                              }}
                              style={{ ...S.btnSmall, marginTop: 4, color: isSelected ? B.terracotta : B.teal, borderColor: isSelected ? B.terracotta : B.teal }}
                            >
                              {isSelected ? '✓ Selected' : '+ Select for Message Machine'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* District strip — only if district data exists */}
                      {districtData && (
                        <div style={{ border: `1.5px solid ${B.teal}30`, borderTop: 'none', borderRadius: '0 0 10px 10px', background: `${B.teal}06`, marginBottom: 4 }}>
                          <button
                            onClick={() => setDistrictExpanded(p => ({ ...p, [candidate.candidate_name]: !p[candidate.candidate_name] }))}
                            style={{ width: '100%', padding: '9px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', color: B.teal }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>🗺️ District Context: {districtData.district_id}</span>
                            {districtData.location_note && <span style={{ fontSize: 12, color: B.textMute }}>{districtData.location_note}</span>}
                            <span style={{ marginLeft: 'auto', fontSize: 14, transform: isDistrictExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                          </button>
                          {isDistrictExpanded && (
                            <div style={{ padding: '12px 16px', borderTop: `1px solid ${B.teal}20` }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
                                {districtData.registration && (
                                  <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Registration</div>
                                    <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{districtData.registration}</div>
                                  </div>
                                )}
                                {districtData.voting_history && (
                                  <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Voting History</div>
                                    <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{districtData.voting_history}</div>
                                  </div>
                                )}
                                {districtData.demographics && (
                                  <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Demographics</div>
                                    <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{districtData.demographics}</div>
                                  </div>
                                )}
                                {districtData.top_issues && (
                                  <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Top Issues</div>
                                    <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{districtData.top_issues}</div>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => pushDistrictToMM(districtData)}
                                disabled={districtPushed[districtData.district_id]}
                                style={{ padding: '8px 18px', background: districtPushed[districtData.district_id] ? '#aaa' : B.gold, color: districtPushed[districtData.district_id] ? '#fff' : B.teal, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: districtPushed[districtData.district_id] ? 'default' : 'pointer' }}
                              >
                                {districtPushed[districtData.district_id] ? '✓ Sent to Message Machine' : 'Add district context to Message Machine →'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}

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
                {selectedList.length} candidate{selectedList.length !== 1 ? 's' : ''} selected:
                {' '}{selectedList.map(c => c.candidate_name).join(', ')}
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
        </>
      )}
    </div>
  );
}
