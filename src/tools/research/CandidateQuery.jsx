import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';
import { useAuth } from '../../context/AuthContext';

function localStorageSafe(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

// Sentinel value for the org switcher's "All Candidates" option — bypasses
// focusOrgIds filtering entirely, showing every candidate regardless of
// which org(s) they're tagged for. Available to everyone, not just users
// with multi-org researchOrgIds access — e.g. spot-checking that a fresh
// data migration or sheet update normalized correctly across every org's
// candidates, not just your own org's slice of them.
const ALL_ORGS = '__all__';

const B = {
  teal:      'var(--teal)',
  tealLight: 'var(--teal-mid)',
  gold:      'var(--gold)',
  turquoise: 'var(--turquoise)',
  terracotta:'var(--terracotta)',
  charcoal:  'var(--charcoal)',
  pageBg:    'var(--bg)',
  surface:   'var(--bg)',
  surfaceAlt:'var(--surface-alt)',
  border:    'var(--border)',
  text:      'var(--text)',
  textMid:   'var(--text-mid)',
  textMute:  'var(--text-mute)',
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
  { id: 'policy',         label: 'Policy Platform' },
  { id: 'notes',          label: 'Additional Notes' },
  // New August 2026 — Issue Tags, Endorsements, Fundraising, Campaign
  // Website, Ballotpedia URL, and Wins deliberately NOT added here; they're
  // card-only display fields, not filter pills (see conversation — keeping
  // this row from growing past what's actually worth a global filter).
  { id: 'opponent',               label: 'Opponent' },
  { id: 'opponent_vulnerability', label: 'Opp. Vulnerabilities' },
  { id: 'messaging_hook',         label: 'Messaging Hooks' },
];

const FACT_LABELS = {
  accomplishment: 'Accomplishment',
  vulnerability:  'Vulnerability',
  strength:       'Strength',
  quote:          'Quote',
  background:     'Background',
  policy:         'Policy Platform',
  notes:          'Additional Notes',
  opponent:               'Opponent',
  opponent_vulnerability: 'Opponent Vulnerability',
  messaging_hook:         'Messaging Hook',
};

const FACT_COLORS = {
  accomplishment: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  vulnerability:  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  strength:       { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  quote:          { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  background:     { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  policy:         { bg: 'var(--teal-light)', text: 'var(--teal)', border: 'var(--turquoise)' },
  notes:          { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  // New August 2026 — see FILTER_TYPES/FACT_LABELS below for the matching entries
  opponent:               { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  opponent_vulnerability: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  messaging_hook:         { bg: 'var(--teal-light)', text: 'var(--teal)', border: 'var(--turquoise)' },
};

// Escapes regex special characters in a raw search string before it's used
// to build a RegExp — otherwise a query containing e.g. "(" or "." would
// either throw or match something the person never typed.
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Splits fact text into plain/highlighted segments around every
// case-insensitive match of `query`, for rendering as React nodes — never
// via dangerouslySetInnerHTML, since this only needs plain-text
// highlighting, not markup injection. Returns the original text
// unmodified (as a single segment) when there's no query or no match.
function highlightText(text, query) {
  const q = (query || '').trim();
  if (!q) return [{ text, hit: false }];
  const re = new RegExp(`(${escapeRegExp(q)})`, 'gi');
  const parts = text.split(re);
  if (parts.length === 1) return [{ text, hit: false }];
  return parts.map(part => ({ text: part, hit: re.test(part) && part.toLowerCase() === q.toLowerCase() }));
}
// NOTE: String.split with a capturing group interleaves matches and
// non-matches in order, so re-testing each part against the same query
// (case-insensitively) is enough to tell which parts were the match vs.
// surrounding text — no index bookkeeping needed.

// Collapsed-state preview: centers a short window of text on the first
// query match (so the relevant part is visible without expanding), or
// just the first ~90 characters when there's no active search — this is
// what lets someone scan which of several collapsed facts is worth
// opening, rather than having to open every one to find the hit.
function getSnippet(text, query, radius = 60) {
  const q = (query || '').trim();
  if (!q) return text.length > 90 ? text.slice(0, 90) + '…' : text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text.length > 90 ? text.slice(0, 90) + '…' : text;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// Renders highlightText()'s segments as React nodes — a small styled span
// for hits, plain text otherwise. Kept separate from highlightText() so
// the pure text-splitting logic stays independently testable.
function HighlightedText({ text, query }) {
  const segments = highlightText(text, query);
  return segments.map((seg, i) =>
    seg.hit
      ? <mark key={i} style={{ background: 'var(--gold)', color: B.text, padding: '0 2px', borderRadius: 3 }}>{seg.text}</mark>
      : <span key={i}>{seg.text}</span>
  );
}

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
  // incumbent_status added (Aug 2026) — without this, pushed text gave the
  // model an office label and real accomplishments with zero signal on
  // whether the candidate currently holds that seat, which produced false
  // "came to Congress" framing for a challenger. The field was always
  // complete in the data; it just never made it into this string.
  if (c.incumbent_status) parts.push(c.incumbent_status);
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

// Group candidates by state+office+district for contrast view. State is
// part of the key (August 2026 fix) — previously office+district only,
// which silently merged the same race across different states (every
// state's Attorney General in one group, etc.). Invisible while data was
// AZ-only; surfaced once other states' candidates were migrated in.
function groupByseat(results) {
  const seats = {};
  results.forEach(c => {
    const key = `${(c.state || '').trim()}|${(c.office || '').trim()}|${(c.district || '').trim()}`;
    if (!seats[key]) seats[key] = [];
    seats[key].push(c);
  });
  // Group states together (alphabetical), race alphabetical within each state.
  return Object.values(seats).sort((a, b) => {
    const stateCompare = (a[0]?.state || '').localeCompare(b[0]?.state || '');
    if (stateCompare !== 0) return stateCompare;
    const officeCompare = (a[0]?.office || '').localeCompare(b[0]?.office || '');
    if (officeCompare !== 0) return officeCompare;
    return (a[0]?.district || '').localeCompare(b[0]?.district || '', undefined, { numeric: true });
  });
}

export default function CandidateQuery() {
  const navigate = useNavigate();
  const { profile, isManager } = useAuth();

  // Cross-org Research visibility (Aug 2026) — separate from the user's
  // actual orgId (which still governs credits/billing/role, untouched).
  // researchOrgIds defaults to just the user's own org, so this is a
  // no-op for the vast majority of users; it only ever contains more than
  // one entry for someone an admin has explicitly granted extra research
  // visibility to.
  const researchOrgIds = useMemo(() => {
    if (profile?.researchOrgIds?.length) return profile.researchOrgIds;
    if (profile?.orgId) return [profile.orgId];
    return [];
  }, [profile]);

  const [activeOrg, setActiveOrg] = useState(null);
  useEffect(() => {
    if (!activeOrg) setActiveOrg(researchOrgIds.length ? researchOrgIds[0] : ALL_ORGS);
  }, [researchOrgIds, activeOrg]);

  const [query,     setQuery]     = useState('');
  const [filter,    setFilter]    = useState('all');
  const [results,   setResults]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lsError,   setLsError]   = useState(false);
  const [expanded,  setExpanded]  = useState({});
  // Per-fact accordion state (August 2026) — separate from `expanded`
  // above, which tracks whether a CANDIDATE's whole fact list is open at
  // all. This tracks whether an individual fact WITHIN an open candidate
  // is showing full text or just its collapsed header + snippet. Default
  // collapsed (nothing in this object = collapsed) — this is what keeps
  // opening a candidate with 10 facts from immediately dumping 10 long
  // paragraphs onto the screen at once.
  const [expandedFacts, setExpandedFacts] = useState({});
  function toggleFactExpanded(factKey) {
    setExpandedFacts(prev => ({ ...prev, [factKey]: !prev[factKey] }));
  }
  const [selected,  setSelected]  = useState({});  // candidateName -> candidate object
  const [selectedFacts, setSelectedFacts] = useState({}); // `candidateName:factIndex` -> {candidate, fact}
  const [pushed,    setPushed]    = useState(false);

  const hasResults = results !== null;
  const selectedList = Object.values(selected);
  const hasSelected  = selectedList.length > 0;

  // Client-side filter applied to already-loaded results
  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (filter === 'all') return results;
    return results
      .map(c => ({ ...c, facts: (c.facts || []).filter(f => f.type === filter) }))
      .filter(c => c.facts.length > 0);
  }, [results, filter]);

  // Org-focus filtering (Aug 2026) — a candidate shows if it's tagged for
  // the active org, OR if it isn't tagged at all yet. Untagged candidates
  // are fail-open by design (never silently hidden) and get an
  // "Unassigned" badge in the card header instead, so staff notice and can
  // go tag them rather than wondering where a candidate went.
  // query-candidates.mjs was rewired to Firestore in this same session —
  // focusOrgIds is now live data, not a no-op.
  const orgFilteredResults = useMemo(() => {
    if (!activeOrg || activeOrg === ALL_ORGS) return filteredResults;
    return filteredResults.filter(c => !c.focusOrgIds || c.focusOrgIds.length === 0 || c.focusOrgIds.includes(activeOrg));
  }, [filteredResults, activeOrg]);

  const seatGroupsFiltered = useMemo(() => groupByseat(orgFilteredResults), [orgFilteredResults]);

  async function runSearch(searchQuery, filterType) {
    setLoading(true);
    setError(null);
    setResults(null);
    setSelected({});
    setSelectedFacts({});
    setPushed(false);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ query: searchQuery.trim(), filterType: filterType !== 'all' ? filterType : null }),
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

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    await runSearch(query, filter);
  }

  async function handleFilterChange(newFilter) {
    setFilter(newFilter);
    if (query.trim() && results !== null) {
      // Re-run search with new filter so only candidates with matching facts in that category are returned
      await runSearch(query, newFilter);
    }
  }

  function handleNewSearch() {
    setQuery('');
    setResults(null);
    setError(null);
    setFilter('all');
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
        const label2 = FACT_LABELS[fact.type] || (fact.type || '').toUpperCase();
        const tag = fact.type ? `[${label2}] ` : '';
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
    btnGold:    { background: 'var(--purple)', color: '#fff', fontWeight: 700, padding: '12px 24px', borderRadius: 8, border: '2px solid var(--purple-dark)', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
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

      {/* ── Org switcher (Aug 2026) ── always visible now (previously only
          rendered for users with multi-org researchOrgIds access). Defaults
          to your own org's priority list; "All Candidates" bypasses
          focusOrgIds filtering entirely — useful for spot-checking that
          data normalized correctly across every org, not just your own. */}
      <div style={{ marginBottom: 20, maxWidth: 260 }}>
        <label style={S.label}>Viewing</label>
        <select
          value={activeOrg || ALL_ORGS}
          onChange={e => setActiveOrg(e.target.value)}
          style={{ ...S.input, cursor: 'pointer' }}
        >
          {researchOrgIds.map(orgId => (
            <option key={orgId} value={orgId}>{orgId}</option>
          ))}
          <option value={ALL_ORGS}>All Candidates</option>
        </select>
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
              <button key={ft.id} type="button" onClick={() => handleFilterChange(ft.id)} style={S.filterBtn(filter === ft.id)}>{ft.label}</button>
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
              {orgFilteredResults.length} candidate{orgFilteredResults.length !== 1 ? 's' : ''} found{filter !== 'all' ? ` (filtered: ${filter})` : ''}
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
              <div key={gi} style={{ marginBottom: 28 }}>
                {/* Seat header — always rendered (not just for contrast
                    groups). Previously a single-candidate group (a race
                    where only one side has a result on file) had no header
                    at all, so that candidate's card ran directly beneath
                    whichever contrast group happened to render before it —
                    reading as if it belonged to that group's race, even
                    though groupByseat() above already keys strictly on
                    state|office|district and never actually mixes races.
                    Every group now gets a labeled header, contrast or not,
                    matching the pattern RaceComparison.jsx already uses. */}
                <div style={{ background: isContrast ? B.teal : B.surfaceAlt, color: isContrast ? '#fff' : B.textMid, borderRadius: '10px 10px 0 0', padding: '10px 18px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isContrast && (
                    <span style={{ background: B.gold, color: B.teal, borderRadius: 6, padding: '2px 10px', fontSize: 12 }}>⚡ Contrast</span>
                  )}
                  {seat} — {group.length} candidate{group.length !== 1 ? 's' : ''}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {group.map((candidate, ci) => {
                    const isExpanded = expanded[candidate.candidate_name];
                    const isSelected = !!selected[candidate.candidate_name];
                    const pc = partyColor(candidate.party);
                    const factsToShow = candidate.facts || [];

                    return (
                      <div
                        key={candidate.candidate_name}
                        style={{
                          ...S.card,
                          // Every group now has a header above it (see
                          // above), so the top corners are always flattened
                          // against that header — the isContrast-only
                          // branch this used to have is gone along with
                          // the isContrast-only header.
                          borderRadius: ci === group.length - 1 ? '0 0 10px 10px' : 0,
                          borderTop: ci > 0 ? 'none' : undefined,
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
                              {/* Research→Admin deep link (Aug 8 2026 addition) —
                                  Manager/Admin only, since Members don't have
                                  Admin page access at all. Opens directly
                                  into the candidate's edit modal via the
                                  ?tab=candidates&edit=<id> query param
                                  AdminPage.jsx now reads on load. stopPropagation
                                  so clicking the name doesn't also toggle the
                                  card's expand/collapse. Requires candidate.id,
                                  which query-candidates.mjs only started
                                  returning as of this same change — a stale
                                  cached search result predating the fix just
                                  won't render as a link (candidate.id undefined),
                                  not throw. */}
                              {isManager && candidate.id ? (
                                <a
                                  href={`/admin?tab=candidates&edit=${candidate.id}`}
                                  onClick={e => { e.stopPropagation(); navigate(`/admin?tab=candidates&edit=${candidate.id}`); e.preventDefault(); }}
                                  style={{ fontSize: 17, fontWeight: 700, color: B.teal, textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.15)' }}
                                  title="Open in Admin"
                                >
                                  {candidate.candidate_name}
                                </a>
                              ) : (
                                <span style={{ fontSize: 17, fontWeight: 700, color: B.text }}>{candidate.candidate_name}</span>
                              )}
                              <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: pc.bg, color: pc.text }}>{candidate.party}</span>
                              {(!candidate.focusOrgIds || candidate.focusOrgIds.length === 0) && (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: B.surfaceAlt, color: B.textMute, border: `1px solid ${B.border}` }}>Unassigned</span>
                              )}
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
                                  // Default open/closed depends on whether there's an active
                                  // search hit in THIS fact — once the person taps a fact
                                  // (recorded in expandedFacts), that explicit choice always
                                  // wins over the auto-open-on-match default, in either
                                  // direction (they can manually close a match, or open a
                                  // non-match).
                                  const hasMatch = query.trim() && fact.text.toLowerCase().includes(query.trim().toLowerCase());
                                  const isFactOpen = expandedFacts[factKey] !== undefined ? expandedFacts[factKey] : !!hasMatch;
                                  return (
                                    <div key={fi} style={{ background: fc.bg, border: `1.5px solid ${isFactSelected ? fc.text : fc.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                                      {/* Header row — always visible, tapping it toggles this ONE
                                          fact open/closed. Checkbox stays independent of the
                                          open/closed state, so a fact can be selected for Message
                                          Machine without ever being expanded to read in full. */}
                                      <div
                                        onClick={() => toggleFactExpanded(factKey)}
                                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', cursor: 'pointer' }}
                                        role="button"
                                        aria-expanded={isFactOpen}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isFactSelected}
                                          onClick={e => e.stopPropagation()}
                                          onChange={() => toggleFact(candidate, fi, fact)}
                                          style={{ width: 15, height: 15, accentColor: B.teal, cursor: 'pointer', flexShrink: 0 }}
                                          aria-label={`Select fact: ${fact.text.substring(0, 40)}`}
                                        />
                                        <span style={{ fontSize: 11, fontWeight: 700, color: fc.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{FACT_LABELS[fact.type] || fact.type}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 13, color: fc.text, flexShrink: 0 }}>{isFactOpen ? '▲' : '▼'}</span>
                                      </div>

                                      {/* Collapsed: a short snippet centered on the search hit
                                          (if any), so someone can tell which facts are worth
                                          opening without opening all of them — the whole point
                                          of this accordion. */}
                                      {!isFactOpen && (
                                        <p style={{ fontSize: 13, color: B.textMute, lineHeight: 1.5, margin: '6px 0 0 0', fontStyle: fact.type === 'quote' ? 'italic' : 'normal' }}>
                                          <HighlightedText text={getSnippet(fact.text, query)} query={query} />
                                        </p>
                                      )}

                                      {/* Expanded: full text, same search-term highlighting
                                          carried through so the hit is easy to spot at a glance
                                          even in a long paragraph. */}
                                      {isFactOpen && (
                                        <>
                                          <p style={{ fontSize: 14, color: B.text, lineHeight: 1.6, margin: '8px 0 10px 0', fontStyle: fact.type === 'quote' ? 'italic' : 'normal' }}>
                                            {fact.type === 'quote'
                                              ? <>"<HighlightedText text={fact.text} query={query} />"</>
                                              : <HighlightedText text={fact.text} query={query} />}
                                          </p>
                                          <button
                                            onClick={() => toggleFact(candidate, fi, fact)}
                                            style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: `1px solid ${fc.border}`, background: isFactSelected ? fc.text : 'transparent', color: isFactSelected ? '#fff' : fc.text, cursor: 'pointer', fontFamily: 'inherit' }}
                                          >
                                            {isFactSelected ? '✓ Selected' : 'Select fact →'}
                                          </button>
                                        </>
                                      )}
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
                style={{ background: 'var(--purple)', color: '#fff', fontWeight: 700, padding: '9px 20px', borderRadius: 8, border: '2px solid var(--purple-dark)', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit', opacity: pushed ? 0.7 : 1 }}
              >
                {pushed ? '✓ Sent!' : 'Send to Message Machine →'}
              </button>
              <button onClick={() => setSelected({})} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          )}
        </>
      )}
      <p style={{ textAlign:"center", fontSize:12, color:"var(--text-mute)", padding:"20px 0 28px", margin:0 }}>
        ⚠️ AI-generated content — always verify facts and claims before publishing.
      </p>
    </div>
  );
}
