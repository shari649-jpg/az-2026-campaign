import { useState, useMemo } from 'react';

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

// Build text payload from a candidate + specific fact indices (or all facts)
function buildCandidateText(c, selectedFactKeys) {
  const header = `── ${candidateLabel(c)} ──`;
  const factsToUse = selectedFactKeys
    ? (c.facts || []).filter((_, i) => selectedFactKeys.has(i))
    : (c.facts || []);
  const lines = factsToUse.map(f => {
    const tag = f.type ? `[${f.type.toUpperCase()}${f.category ? ' – ' + f.category : ''}] ` : '';
    return `• ${tag}${f.text}`;
  });
  return [header, ...lines].join('\n');
}

// Group candidates by office+district
function groupBySeat(results) {
  const seats = {};
  results.forEach(c => {
    const key = `${(c.office || '').trim()}|${(c.district || '').trim()}`;
    if (!seats[key]) seats[key] = [];
    seats[key].push(c);
  });
  return Object.values(seats);
}

export default function CandidateQuery() {
  const [query,        setQuery]        = useState('');
  const [filter,       setFilter]       = useState('all');
  const [results,      setResults]      = useState(null);   // all results from server
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [expanded,     setExpanded]     = useState({});     // candidateName -> bool
  const [selectedCandidates, setSelectedCandidates] = useState({}); // candidateName -> candidate object (whole profile)
  const [selectedFacts,      setSelectedFacts]      = useState({}); // `${candidateName}::${factIndex}` -> {candidate, fact}
  const [pushed,       setPushed]       = useState(false);
  const [lastQuery,    setLastQuery]    = useState('');     // the query that produced current results

  const hasResults      = results !== null;
  const candidateSelList = Object.values(selectedCandidates);
  const factSelList      = Object.values(selectedFacts);
  const hasAnythingSelected = candidateSelList.length > 0 || factSelList.length > 0;

  // Client-side filter: when filter chip is active, only show matching facts
  // When a search query is active, only show facts that contain the search term
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.map(c => {
      let facts = c.facts || [];

      // Filter by fact type chip
      if (filter !== 'all') {
        facts = facts.filter(f => f.type === filter);
      }

      // If there's a search query, only show facts relevant to that query
      // (facts that actually contain the search term — others are hidden but candidate still shown)
      if (lastQuery) {
        const q = lastQuery.toLowerCase();
        const metaMatch = [c.candidate_name, c.party, c.office, c.district]
          .join(' ').toLowerCase().includes(q);
        if (!metaMatch) {
          // Candidate matched via fact text — only show matching facts
          facts = facts.filter(f => f.text.toLowerCase().includes(q));
        }
        // If meta matched (name/office/district), show all facts (filtered by type if set)
      }

      return { ...c, facts };
    }).filter(c => filter === 'all' || c.facts.length > 0);
  }, [results, filter, lastQuery]);

  const seatGroupsFiltered = useMemo(() => groupBySeat(filteredResults), [filteredResults]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelectedCandidates({});
    setSelectedFacts({});
    setPushed(false);

    try {
      const res = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Search failed'); return; }
      if (!data.results.length)     { setError('No results found. Try a different term.'); return; }
      setResults(data.results);
      setLastQuery(query.trim());
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleNewSearch() {
    setQuery('');
    setResults(null);
    setError(null);
    setSelectedCandidates({});
    setSelectedFacts({});
    setPushed(false);
    setLastQuery('');
    setFilter('all');
  }

  function toggleExpand(name) {
    setExpanded(p => ({ ...p, [name]: !p[name] }));
  }

  // Toggle whole candidate selection
  function toggleCandidate(candidate) {
    setSelectedCandidates(p => {
      const next = { ...p };
      if (next[candidate.candidate_name]) delete next[candidate.candidate_name];
      else next[candidate.candidate_name] = candidate;
      return next;
    });
    setPushed(false);
  }

  // Toggle individual fact selection
  function toggleFact(candidate, factIndex, fact) {
    const key = `${candidate.candidate_name}::${factIndex}`;
    setSelectedFacts(p => {
      const next = { ...p };
      if (next[key]) delete next[key];
      else next[key] = { candidate, factIndex, fact };
      return next;
    });
    setPushed(false);
  }

  function isFactSelected(candidateName, factIndex) {
    return !!selectedFacts[`${candidateName}::${factIndex}`];
  }

  function pushToMessageMachine() {
    let sections = [];

    if (!hasAnythingSelected) {
      // Send all results
      sections = (results || []).map(c => buildCandidateText(c, null));
    } else {
      // Gather all candidate names involved
      const involvedCandidates = new Set([
        ...candidateSelList.map(c => c.candidate_name),
        ...factSelList.map(f => f.candidate.candidate_name),
      ]);

      involvedCandidates.forEach(name => {
        const candidate = candidateSelList.find(c => c.candidate_name === name)
          || factSelList.find(f => f.candidate.candidate_name === name)?.candidate;
        if (!candidate) return;

        if (selectedCandidates[name]) {
          // Whole profile selected
          sections.push(buildCandidateText(candidate, null));
        } else {
          // Only specific facts selected
          const factIndices = new Set(
            factSelList
              .filter(f => f.candidate.candidate_name === name)
              .map(f => f.factIndex)
          );
          sections.push(buildCandidateText(candidate, factIndices));
        }
      });
    }

    const allCandidateNames = hasAnythingSelected
      ? [...new Set([...candidateSelList.map(c => c.candidate_name), ...factSelList.map(f => f.candidate.candidate_name)])]
      : (results || []).map(c => c.candidate_name);

    const payload = {
      sourceArticleId:   null,
      sourceTitle:       `Candidate Research: ${allCandidateNames.join(', ')}`,
      sourcePublication: 'AZ 2026 Candidate Research',
      issueText:         sections.join('\n\n'),
      focalPoint:        sections[0]?.split('\n')[1] || '',
      pushedAt:          new Date().toISOString(),
    };
    try {
      localStorage.setItem('rr_pending_article', JSON.stringify(payload));
      setPushed(true);
    } catch {}
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const S = {
    wrap:      { fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text, padding: '0 24px' },
    label:     { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: B.textMid, marginBottom: 6, display: 'block' },
    input:     { width: '100%', padding: '12px 16px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 16, color: B.text, background: B.surface, fontFamily: 'inherit' },
    btnPrimary:{ background: B.teal, color: '#fff', fontWeight: 700, padding: '12px 28px', borderRadius: 8, border: `2px solid ${B.tealLight}`, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' },
    btnGold:   { background: B.gold, color: B.teal, fontWeight: 700, padding: '12px 24px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
    btnSmall:  { background: 'transparent', color: B.textMid, fontWeight: 700, padding: '6px 14px', borderRadius: 6, border: `1px solid ${B.border}`, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
    card:      { background: B.surface, border: `1.5px solid ${B.border}`, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
    filterBtn: (active) => ({
      padding: '7px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      background: active ? B.teal : B.surface,
      color:      active ? '#fff' : B.textMid,
      border:     active ? `1.5px solid ${B.tealLight}` : `1.5px solid ${B.border}`,
    }),
  };

  const totalSelected = candidateSelList.length + factSelList.length;

  return (
    <div style={S.wrap}>
      {/* Instructions */}
      <div style={{ background: B.surfaceAlt, border: `1px solid ${B.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Search candidate profiles by:</strong>{' '}
          issue or topic (e.g. <em>water</em>, <em>housing</em>, <em>education</em>),
          candidate name, office or seat, party, or district (e.g. <em>LD16</em>, <em>LD2</em>).
          Check a candidate's name to select their full profile, or check individual facts to send only those to Message Machine.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} style={{ marginBottom: 20 }}>
        <label style={S.label}>Search Candidates</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder='e.g. "water", "governor", "LD16", "housing"'
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

        {/* Filter chips — only after results load */}
        {hasResults && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {FILTER_TYPES.map(ft => (
              <button key={ft.id} type="button" onClick={() => setFilter(ft.id)} style={S.filterBtn(filter === ft.id)}>{ft.label}</button>
            ))}
          </div>
        )}
      </form>

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#991b1b', fontSize: 15 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: B.textMute }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${B.surfaceAlt}`, borderTopColor: B.teal, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 16 }}>Searching candidate profiles…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <>
          {/* Results header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <p style={{ fontSize: 15, color: B.textMid, fontWeight: 700, margin: 0 }}>
              {filteredResults.length} candidate{filteredResults.length !== 1 ? 's' : ''} found
              {filter !== 'all' ? ` (filtered: ${filter})` : ''}
              {hasAnythingSelected && (
                <span style={{ color: B.teal }}>
                  {' · '}{candidateSelList.length > 0 && `${candidateSelList.length} profile${candidateSelList.length !== 1 ? 's' : ''}`}
                  {candidateSelList.length > 0 && factSelList.length > 0 && ' + '}
                  {factSelList.length > 0 && `${factSelList.length} fact${factSelList.length !== 1 ? 's' : ''}`}
                  {' selected'}
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {hasAnythingSelected && (
                <button onClick={() => { setSelectedCandidates({}); setSelectedFacts({}); }} style={S.btnSmall}>Clear selection</button>
              )}
              <button
                onClick={pushToMessageMachine}
                style={{ ...S.btnGold, opacity: pushed ? 0.7 : 1, cursor: pushed ? 'default' : 'pointer' }}
              >
                {pushed
                  ? '✓ Sent to Message Machine'
                  : hasAnythingSelected
                    ? `Send ${totalSelected} item${totalSelected !== 1 ? 's' : ''} to Message Machine →`
                    : 'Send all to Message Machine →'
                }
              </button>
            </div>
          </div>

          {/* Seat groups — capped at 3 columns */}
          {seatGroupsFiltered.map((group, gi) => {
            const isContrast = group.length > 1;
            const seat = `${group[0].office || ''}${group[0].district ? ' · ' + group[0].district : ''}`;

            // Split into rows of max 3
            const rows = [];
            for (let i = 0; i < group.length; i += 3) {
              rows.push(group.slice(i, i + 3));
            }

            return (
              <div key={gi} style={{ marginBottom: isContrast ? 28 : 0 }}>
                {/* Contrast header */}
                {isContrast && (
                  <div style={{ background: B.teal, color: '#fff', borderRadius: '10px 10px 0 0', padding: '10px 18px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ background: B.gold, color: B.teal, borderRadius: 6, padding: '2px 10px', fontSize: 12 }}>⚡ Contrast</span>
                    {seat} — {group.length} candidates
                  </div>
                )}

                {/* Rows of up to 3 */}
                {rows.map((rowGroup, rowIdx) => (
                  <div
                    key={rowIdx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${rowGroup.length}, 1fr)`,
                      gap: 0,
                      borderRadius: !isContrast ? 10 : rowIdx === rows.length - 1 ? '0 0 10px 10px' : 0,
                      overflow: 'hidden',
                      border: `1.5px solid ${B.border}`,
                      borderTop: isContrast || rowIdx > 0 ? `1px solid ${B.border}` : `1.5px solid ${B.border}`,
                      marginBottom: rowIdx < rows.length - 1 ? 4 : 0,
                    }}
                  >
                    {rowGroup.map((candidate, ci) => {
                      const isExpanded = expanded[candidate.candidate_name];
                      const isCandidateSelected = !!selectedCandidates[candidate.candidate_name];
                      const pc = partyColor(candidate.party);
                      const factsToShow = candidate.facts || [];

                      return (
                        <div
                          key={candidate.candidate_name}
                          style={{
                            borderLeft: ci > 0 ? `1px solid ${B.border}` : undefined,
                            background: isCandidateSelected ? '#f0fdf9' : B.surface,
                          }}
                        >
                          {/* Candidate header */}
                          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: `1px solid ${B.border}` }}>
                            {/* Whole-candidate checkbox */}
                            <input
                              type="checkbox"
                              checked={isCandidateSelected}
                              onChange={() => toggleCandidate(candidate)}
                              style={{ width: 18, height: 18, marginTop: 3, accentColor: B.teal, flexShrink: 0, cursor: 'pointer' }}
                              aria-label={`Select ${candidate.candidate_name}`}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: B.text, marginBottom: 4, wordBreak: 'break-word' }}>
                                {candidate.candidate_name}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: pc.bg, color: pc.text }}>{candidate.party}</span>
                                {candidate.incumbent_status && <span style={{ fontSize: 11, color: B.textMute }}>{candidate.incumbent_status}</span>}
                              </div>
                              <p style={{ fontSize: 13, color: B.textMute, margin: 0 }}>
                                {candidate.office}{candidate.district ? ` · ${candidate.district}` : ''}
                              </p>
                            </div>
                            <button
                              onClick={() => toggleExpand(candidate.candidate_name)}
                              style={{ ...S.btnSmall, flexShrink: 0, marginTop: 2 }}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? 'Hide ▲' : `${factsToShow.length} facts ▼`}
                            </button>
                          </div>

                          {/* Facts */}
                          {isExpanded && (
                            <div style={{ padding: '14px 16px' }}>
                              {factsToShow.length === 0
                                ? <p style={{ color: B.textMute, fontSize: 14 }}>No matching facts for this filter.</p>
                                : factsToShow.map((fact, fi) => {
                                    const fc = FACT_COLORS[fact.type] || FACT_COLORS.background;
                                    const factSelected = isFactSelected(candidate.candidate_name, fi);
                                    return (
                                      <div
                                        key={fi}
                                        style={{
                                          background: factSelected ? '#f0fdf9' : fc.bg,
                                          border: factSelected ? `2px solid ${B.turquoise}` : `1px solid ${fc.border}`,
                                          borderRadius: 8,
                                          padding: '10px 14px',
                                          marginBottom: 10,
                                          cursor: 'pointer',
                                        }}
                                        onClick={() => toggleFact(candidate, fi, fact)}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                          {/* Per-fact checkbox */}
                                          <input
                                            type="checkbox"
                                            checked={factSelected}
                                            onChange={() => toggleFact(candidate, fi, fact)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ width: 15, height: 15, marginTop: 2, accentColor: B.teal, flexShrink: 0, cursor: 'pointer' }}
                                            aria-label={`Select this ${fact.type} fact`}
                                          />
                                          <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                                              <span style={{ fontSize: 11, fontWeight: 700, color: fc.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{fact.type}</span>
                                              {fact.category && <span style={{ fontSize: 11, color: fc.text, opacity: 0.8 }}>· {fact.category}</span>}
                                            </div>
                                            <p style={{ fontSize: 14, color: B.text, lineHeight: 1.6, margin: 0, fontStyle: fact.type === 'quote' ? 'italic' : 'normal' }}>
                                              {fact.type === 'quote' ? `"${fact.text}"` : fact.text}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                              }
                              <p style={{ fontSize: 12, color: B.textMute, marginTop: 8 }}>
                                ☑ Check the candidate name above to select full profile · Check individual facts to select specific items
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Floating selection bar */}
          {hasAnythingSelected && (
            <div style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: B.teal, color: '#fff', borderRadius: 12,
              padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 50, flexWrap: 'wrap',
              maxWidth: '90vw',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                {candidateSelList.length > 0 && `${candidateSelList.length} profile${candidateSelList.length !== 1 ? 's' : ''}`}
                {candidateSelList.length > 0 && factSelList.length > 0 && ' + '}
                {factSelList.length > 0 && `${factSelList.length} fact${factSelList.length !== 1 ? 's' : ''}`}
                {' selected'}
              </span>
              <button
                onClick={pushToMessageMachine}
                style={{ background: B.gold, color: B.teal, fontWeight: 700, padding: '9px 20px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit', opacity: pushed ? 0.7 : 1 }}
              >
                {pushed ? '✓ Sent!' : 'Send to Message Machine →'}
              </button>
              <button onClick={() => { setSelectedCandidates({}); setSelectedFacts({}); }} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
