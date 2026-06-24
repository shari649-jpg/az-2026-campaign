import { useState, useEffect, useMemo } from 'react';
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

const FACT_LABELS = {
  accomplishment: 'Accomplishment',
  vulnerability:  'Vulnerability',
  strength:       'Strength',
  quote:          'Quote',
  background:     'Background',
  policy:         'Policy Platform',
  notes:          'Additional Notes',
};

const FACT_COLORS = {
  accomplishment: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  vulnerability:  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  strength:       { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  quote:          { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  background:     { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  policy:         { bg: '#e6faf7', text: '#1D5C4A', border: '#3ECFB2' },
  notes:          { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

function partyColor(party) {
  const p = (party || '').toUpperCase();
  if (p === 'D') return { bg: B.dBlue, text: '#fff', lightBg: B.dBlueBg, nameColor: B.dBlue };
  if (p === 'R') return { bg: B.rRed,  text: '#fff', lightBg: B.rRedBg,  nameColor: B.rRed  };
  return              { bg: B.charcoal, text: '#fff', lightBg: B.surfaceAlt, nameColor: B.rRed };
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
    const label = FACT_LABELS[f.type] || (f.type || '').toUpperCase();
    const tag = f.type ? `[${label}] ` : '';
    return `• ${tag}${f.text}`;
  });
  return [header, ...lines].join('\n');
}

export default function RaceComparison() {
  const navigate = useNavigate();
  const { showUp, showDown } = useScrollArrows();
  const [races,    setRaces]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState({});
  const [selectedFacts, setSelectedFacts] = useState({}); // `candidateName:factIndex` -> fact object
  const [pushed,   setPushed]   = useState(false);
  const [lsError,  setLsError]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [districtMap,      setDistrictMap]      = useState({});
  const [districtExpanded, setDistrictExpanded] = useState({});
  const [districtPrompt,   setDistrictPrompt]   = useState(null); // district object to prompt about, or null

  useEffect(() => { loadRaces(); loadDistricts(); }, []);

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
    } catch { /* silent */ }
  }

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
  const selectedFactList = Object.values(selectedFacts);
  const hasSelectedFacts = selectedFactList.length > 0;

  function buildDistrictIssueText(d) {
    const lines = [`── District Context: ${d.district_id} ──`];
    if (d.counties)       lines.push(`Counties: ${d.counties}`);
    if (d.location_note)  lines.push(`Location: ${d.location_note}`);
    if (d.registration)   lines.push(`Registration: ${d.registration}`);
    if (d.voting_history) lines.push(`Voting History: ${d.voting_history}`);
    if (d.demographics)   lines.push(`Demographics: ${d.demographics}`);
    if (d.top_issues)     lines.push(`Top Issues: ${d.top_issues}`);
    return lines.join('\n');
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

  function buildCandidateIssueText() {
    if (hasSelectedFacts) {
      const byCandidate = {};
      selectedFactList.forEach(({ candidate, fact }) => {
        const label = candidateLabel(candidate);
        if (!byCandidate[label]) byCandidate[label] = [];
        const label2 = FACT_LABELS[fact.type] || (fact.type || '').toUpperCase();
        const tag = fact.type ? `[${label2}] ` : '';
        byCandidate[label].push(`• ${tag}${fact.text}`);
      });
      return Object.entries(byCandidate)
        .map(([label, lines]) => `── ${label} ──\n${lines.join('\n')}`)
        .join('\n\n');
    } else if (hasSelected) {
      return selectedList.map(c => factsToText(c)).join('\n\n');
    } else {
      return (races || []).flatMap(r => r.candidates).map(c => factsToText(c)).join('\n\n');
    }
  }

  function doSend(issueText, withDistrict) {
    const candidatesForTitle = hasSelected ? selectedList : (races||[]).flatMap(r=>r.candidates);
    const payload = {
      sourceArticleId:   null,
      sourceTitle:       hasSelectedFacts ? 'Selected Facts — AZ 2026 Research' : `Candidate Research: ${candidatesForTitle.map(c=>c.candidate_name).join(', ')}`,
      sourcePublication: 'AZ 2026 Candidate Research',
      issueText,
      focalPoint:        '',
      pushedAt:          new Date().toISOString(),
    };
    const ok = localStorageSafe('rr_pending_article', payload);
    if (!ok) { setLsError(true); setDistrictPrompt(null); return; }
    setPushed(true);
    setDistrictPrompt(null);
    navigate('/messaging');
  }

  function pushToMessageMachine() {
    const candidateIssueText = buildCandidateIssueText();

    // Check if all selected candidates share a single district that exists in districtMap
    const activeCandidates = hasSelectedFacts
      ? [...new Map(selectedFactList.map(({candidate}) => [candidate.candidate_name, candidate])).values()]
      : hasSelected ? selectedList : (races||[]).flatMap(r=>r.candidates);

    const districts = [...new Set(activeCandidates.map(c => c.district).filter(Boolean))];
    const singleDistrict = districts.length === 1 ? districtMap[districts[0]] : null;

    if (singleDistrict) {
      setDistrictPrompt({ district: singleDistrict, candidateIssueText });
    } else {
      doSend(candidateIssueText, false);
    }
  }

  function sendWithDistrict() {
    if (!districtPrompt) return;
    const { district, candidateIssueText } = districtPrompt;
    const districtText = [
      `\n── District Context: ${district.district_id} ──`,
      district.counties        ? `Counties: ${district.counties}`         : null,
      district.location_note  ? `Location: ${district.location_note}`     : null,
      district.registration   ? `Registration: ${district.registration}`   : null,
      district.voting_history ? `Voting History: ${district.voting_history}` : null,
      district.demographics   ? `Demographics: ${district.demographics}`   : null,
      district.top_issues     ? `Top Issues: ${district.top_issues}`       : null,
    ].filter(Boolean).join('\n');
    doSend(candidateIssueText + districtText, true);
  }

  const S = {
    wrap:       { fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text, padding: '0 24px' },
    input:      { width: '100%', padding: '11px 16px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 15, color: B.text, background: B.surface, fontFamily: 'inherit', boxSizing: 'border-box' },
    btnPrimary: { background: B.teal, color: '#fff', fontWeight: 700, padding: '10px 22px', borderRadius: 8, border: `2px solid ${B.tealLight}`, cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
    btnGold:    { background: B.gold, color: B.teal, fontWeight: 700, padding: '10px 22px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
    btnSmall:   { background: 'transparent', color: B.textMid, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: `1px solid ${B.border}`, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  };

  return (
    <div style={S.wrap}>
      {/* Floating scroll arrows */}
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

      {/* Instructions */}
      <div style={{ background: B.surfaceAlt, border: `1px solid ${B.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Browse all races with D vs R side-by-side.</strong>{' '}
          Democrats on the left, Republicans and third party on the right.
          Select candidates to send to Message Machine.
        </p>
      </div>

      {/* Search + Refresh row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <input
            style={S.input}
            placeholder='Search by office, district, or candidate name…'
            value={search}
            onChange={e => { setSearch(e.target.value); setPushed(false); }}
          />
        </div>
        <button onClick={loadRaces} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>↺ Refresh</button>
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
          <p style={{ fontSize: 16 }}>Loading race data…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* lsError */}
      {lsError && (
        <div style={{ background: '#fff7ed', border: '1.5px solid #f5c842', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#7a4f00', fontSize: 14 }}>
          <strong>⚠️ Could not send to Message Machine</strong> — browser storage is disabled. Copy your content manually.
          <button onClick={() => setLsError(false)} style={{ marginLeft: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#7a4f00' }}>✕</button>
        </div>
      )}

      {/* Summary bar */}
      {races && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <p style={{ fontSize: 15, color: B.textMid, fontWeight: 700, margin: 0 }}>
            {filteredRaces.length} race{filteredRaces.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : ''}
            {hasSelectedFacts && <span style={{ color: B.teal }}> · {selectedFactList.length} fact{selectedFactList.length !== 1 ? 's' : ''} selected</span>}
            {!hasSelectedFacts && hasSelected && <span style={{ color: B.teal }}> · {selectedList.length} candidate{selectedList.length !== 1 ? 's' : ''} selected</span>}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {(hasSelected || hasSelectedFacts) && (
              <button onClick={() => { setSelected({}); setSelectedFacts({}); setDistrictPrompt(null); }} style={S.btnSmall}>Clear selection</button>
            )}
            <button
              onClick={pushToMessageMachine}
              style={{ ...S.btnGold, opacity: pushed ? 0.7 : 1, cursor: pushed ? 'default' : 'pointer' }}
            >
              {pushed ? '✓ Sent to Message Machine'
                : hasSelectedFacts ? `Send ${selectedFactList.length} fact${selectedFactList.length!==1?'s':''} to Message Machine →`
                : hasSelected ? `Send ${selectedList.length} selected to Message Machine →`
                : 'Send all to Message Machine →'}
            </button>
          </div>
        </div>
      )}

      {/* Race cards */}
      {!loading && filteredRaces.map((race, ri) => {
        const raceLabel   = [race.office, race.district].filter(Boolean).join(' · ');
        const dCandidates = race.candidates.filter(c => c.party?.toUpperCase() === 'D');
        const rCandidates = race.candidates.filter(c => c.party?.toUpperCase() === 'R');
        const others      = race.candidates.filter(c => !['D','R'].includes((c.party || '').toUpperCase()));
        const hasContest  = dCandidates.length > 0 && (rCandidates.length > 0 || others.length > 0);
        const rightSide   = [...rCandidates, ...others];

        return (
          <div key={ri} style={{ marginBottom: 28, border: `1.5px solid ${B.border}`, borderRadius: 12, overflow: 'hidden', background: B.surface }}>

            {/* Race header */}
            <div style={{
              background: hasContest ? B.teal : B.surfaceAlt,
              color: hasContest ? '#fff' : B.textMid,
              padding: '12px 20px',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{raceLabel}</span>
              {hasContest && (
                <span style={{ background: B.gold, color: B.teal, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>⚡ Contest</span>
              )}
              <span style={{ fontSize: 13, opacity: 0.75, marginLeft: 'auto' }}>
                {race.candidates.length} candidate{race.candidates.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Two-column layout: Dems left, R/others right */}
            <div style={{ display: 'grid', gridTemplateColumns: dCandidates.length > 0 && rightSide.length > 0 ? '1fr 1fr' : '1fr', gap: 0 }}>

              {/* Left: Democrats */}
              {dCandidates.length > 0 && (
                <div style={{ borderRight: rightSide.length > 0 ? `2px solid ${B.border}` : undefined }}>
                  {dCandidates.map(candidate => renderCandidate(candidate))}
                </div>
              )}

              {/* Right: Republicans + others */}
              {rightSide.length > 0 && (
                <div>
                  {rightSide.map(candidate => renderCandidate(candidate))}
                </div>
              )}

              {/* If only one side exists, show full width */}
              {dCandidates.length === 0 && rightSide.map(candidate => renderCandidate(candidate))}
            </div>

            {/* District strip — one per race group */}
            {(() => {
              const raceDistrict = race.district ? districtMap[race.district] : null;
              if (!raceDistrict) return null;
              const stripKey = race.district;
              const isOpen = districtExpanded[stripKey];
              return (
                <div style={{ borderTop: `1.5px solid ${B.teal}25`, background: `${B.teal}05` }}>
                  <button
                    onClick={() => setDistrictExpanded(p => ({ ...p, [stripKey]: !p[stripKey] }))}
                    style={{ width: '100%', padding: '9px 20px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', color: B.teal }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>🗺️ District Context: {raceDistrict.district_id}</span>
                    {raceDistrict.location_note && <span style={{ fontSize: 12, color: B.textMute }}>{raceDistrict.location_note}</span>}
                    {raceDistrict.counties && <span style={{ fontSize: 12, color: B.textMute }}>· {raceDistrict.counties} {raceDistrict.counties.includes(',') ? 'Counties' : 'County'}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 14, color: B.textMute, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '12px 20px', borderTop: `1px solid ${B.teal}15` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        {raceDistrict.counties && (
                          <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Counties</div>
                            <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{raceDistrict.counties}</div>
                          </div>
                        )}
                        {raceDistrict.registration && (
                          <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Registration</div>
                            <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{raceDistrict.registration}</div>
                          </div>
                        )}
                        {raceDistrict.voting_history && (
                          <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Voting History</div>
                            <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{raceDistrict.voting_history}</div>
                          </div>
                        )}
                        {raceDistrict.demographics && (
                          <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Demographics</div>
                            <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{raceDistrict.demographics}</div>
                          </div>
                        )}
                        {raceDistrict.top_issues && (
                          <div style={{ background: '#fff', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: B.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Top Issues</div>
                            <div style={{ fontSize: 13, color: B.text, lineHeight: 1.5 }}>{raceDistrict.top_issues}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );

        function renderCandidate(candidate) {
          const isExpanded = expanded[candidate.candidate_name];
          const isSelected = !!selected[candidate.candidate_name];
          const pc         = partyColor(candidate.party);
          const isRepOrOther = candidate.party?.toUpperCase() !== 'D';

          return (
            <div
              key={candidate.candidate_name}
              style={{
                background: isSelected ? pc.lightBg : B.surface,
                borderTop: `3px solid ${pc.bg}`,
                transition: 'background 0.15s',
              }}
            >
              {/* Candidate header */}
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${B.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(candidate)}
                  style={{ width: 17, height: 17, marginTop: 4, accentColor: B.teal, flexShrink: 0, cursor: 'pointer' }}
                  aria-label={`Select ${candidate.candidate_name}`}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {/* Name in red for R and third party */}
                    <span style={{ fontSize: 16, fontWeight: 700, color: isRepOrOther ? B.rRed : B.text }}>
                      {candidate.candidate_name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: pc.bg, color: pc.text }}>
                      {candidate.party}
                    </span>
                    {candidate.incumbent_status && (
                      <span style={{ fontSize: 11, color: B.textMute }}>{candidate.incumbent_status}</span>
                    )}
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
                  {isExpanded ? '▲ Hide' : `${candidate.facts?.length || 0} facts ▼`}
                </button>
              </div>

              {/* Facts */}
              {isExpanded && (
                <div style={{ padding: '14px 16px' }}>
                  {(candidate.facts || []).length === 0 ? (
                    <p style={{ color: B.textMute, fontSize: 14, margin: 0 }}>No facts on file.</p>
                  ) : (
                    (candidate.facts || []).map((fact, fi) => {
                      const fc = FACT_COLORS[fact.type] || FACT_COLORS.background;
                      const factKey = `${candidate.candidate_name}:${fi}`;
                      const isFactSelected = !!selectedFacts[factKey];
                      return (
                        <div key={fi} style={{ background: isFactSelected ? fc.bg : fc.bg + 'aa', border: `1.5px solid ${isFactSelected ? fc.text : fc.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 5, alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isFactSelected}
                              onChange={() => toggleFact(candidate, fi, fact)}
                              style={{ width: 15, height: 15, accentColor: B.teal, cursor: 'pointer', flexShrink: 0 }}
                              aria-label={`Select fact: ${fact.text.substring(0, 40)}`}
                            />
                            <span style={{ fontSize: 11, fontWeight: 700, color: fc.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{FACT_LABELS[fact.type] || fact.type}</span>
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
        }
      })}

      {/* Empty state */}
      {!loading && races && filteredRaces.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: B.textMute }}>
          <p style={{ fontSize: 16 }}>No races match "{search}".</p>
          <button onClick={() => setSearch('')} style={{ ...S.btnSmall, marginTop: 8 }}>Clear search</button>
        </div>
      )}

      {/* Floating selection bar — also hosts district prompt */}
      {(hasSelected || districtPrompt) && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: B.teal, color: '#fff', borderRadius: 12,
          padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 50, flexWrap: 'wrap',
          maxWidth: '90vw',
        }}>
          {districtPrompt ? (
            <>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                Also include {districtPrompt.district.district_id} district details?
              </span>
              <button
                onClick={sendWithDistrict}
                style={{ background: B.gold, color: B.teal, fontWeight: 700, padding: '9px 20px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}
              >
                Yes, include it →
              </button>
              <button
                onClick={() => doSend(districtPrompt.candidateIssueText, false)}
                style={{ background: 'transparent', color: '#fff', fontWeight: 700, padding: '9px 20px', borderRadius: 8, border: '2px solid rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}
              >
                No, just candidates
              </button>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                {selectedList.length} selected: {selectedList.map(c => c.candidate_name).join(', ')}
              </span>
              <button
                onClick={pushToMessageMachine}
                style={{ background: B.gold, color: B.teal, fontWeight: 700, padding: '9px 20px', borderRadius: 8, border: '2px solid #d4aa30', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit', opacity: pushed ? 0.7 : 1 }}
              >
                {pushed ? '✓ Sent!' : 'Send to Message Machine →'}
              </button>
              <button onClick={() => { setSelected({}); setSelectedFacts({}); setDistrictPrompt(null); }} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>✕</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
