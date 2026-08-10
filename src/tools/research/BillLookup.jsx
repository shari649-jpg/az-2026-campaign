// src/tools/research/BillLookup.jsx
//
// Frontend for the bill-lookup pipeline (resolve-bill.mjs -> bill-votes.mjs).
// Built to actually TEST the backend end-to-end, not as final polished UI —
// functional and honest about the two known gaps (pre-118th-Congress
// coverage, no Senate data) rather than hiding them. Polish pass can come
// once the pipeline itself is confirmed working against real queries.

import { useState } from 'react';
import { auth } from '../../firebase';

const B = {
  teal:      'var(--teal)',
  gold:      'var(--gold)',
  charcoal:  'var(--charcoal)',
  surface:   'var(--bg)',
  surfaceAlt:'var(--surface-alt)',
  border:    'var(--border)',
  text:      'var(--text)',
  textMid:   'var(--text-mid)',
  textMute:  'var(--text-mute)',
  red:       '#c0392b',
  green:     '#1e8449',
};

async function callFunction(name, body) {
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ idToken, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

function VoteBadge({ position }) {
  if (!position) return <span style={{ color: B.textMute, fontSize: 13 }}>No record</span>;
  // Exact matching, not fuzzy substring — a loose /nay|no/i check previously
  // misclassified "Not Voting" as a "No" vote, since "no" is literally the
  // first two letters of "Not". That's a real accuracy problem for a tool
  // making claims about how someone voted: "didn't vote" (absent/abstained)
  // and "voted no" are very different things to say about a candidate.
  // House Clerk vote-cast values are consistently one of these four.
  const normalized = position.trim().toLowerCase();
  if (normalized === 'yea' || normalized === 'aye') return <span style={{ color: B.green, fontWeight: 700, fontSize: 13 }}>{position}</span>;
  if (normalized === 'nay' || normalized === 'no') return <span style={{ color: B.red, fontWeight: 700, fontSize: 13 }}>{position}</span>;
  if (normalized === 'present' || normalized === 'not voting') return <span style={{ color: B.textMid, fontWeight: 700, fontSize: 13 }}>{position}</span>;
  // Anything else unexpected: show it plainly rather than guessing a color.
  return <span style={{ color: B.textMid, fontWeight: 700, fontSize: 13 }}>{position}</span>;
}

function CandidateVoteRow({ cv }) {
  return (
    <tr style={{ borderTop: `1px solid ${B.border}` }}>
      <td style={{ padding: '10px 8px' }}>
        {cv.name} <span style={{ color: B.textMute, fontSize: 14 }}>({cv.party}-{cv.state}, {cv.district})</span>
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right' }}><VoteBadge position={cv.position} /></td>
    </tr>
  );
}

export default function BillLookup() {
  const [level, setLevel] = useState('federal'); // 'federal' | 'state' — explicit toggle, not inferred, since a query like "education funding bill" is genuinely ambiguous between the two
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [billList, setBillList] = useState(null);   // issue-search mode: pick from a list
  const [votesResult, setVotesResult] = useState(null); // resolved bill + roll calls
  const [expandedRollCall, setExpandedRollCall] = useState(-1); // -1 = all collapsed by default; only one open at a time to keep this usable on mobile
  const [expandedNotInCongress, setExpandedNotInCongress] = useState({}); // keyed by roll call index — separate from the roll-call accordion, so opening one doesn't affect the other

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(null); setBillList(null); setVotesResult(null);
    try {
      const resolved = await callFunction('resolve-bill', { query: query.trim(), level, state: 'AZ' });
      if (resolved.mode === 'none') {
        setError(resolved.reason || "Couldn't identify a specific bill from that.");
      } else if (resolved.mode === 'single') {
        await fetchVotes(resolved.bill);
      } else if (resolved.mode === 'list') {
        setBillList(resolved.bills);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function fetchVotes(bill) {
    setLoading(true); setError(null);
    try {
      const result = await callFunction('bill-votes', bill); // bill already carries level/congress-or-year/billType/billNumber from resolve-bill's response shape
      setVotesResult(result);
      setExpandedRollCall(-1);
      // billList is deliberately NOT cleared here anymore — kept in memory
      // so a "← Back to results" control can return to the same picklist
      // without re-querying Perplexity, in case the picked bill wasn't the
      // right one.
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  function backToList() {
    setVotesResult(null);
    setError(null);
  }

  return (
    <div style={{ fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text, padding: '0 20px' }}>
      <div style={{ background: `${B.teal}08`, border: `1px solid ${B.teal}25`, borderRadius: 10, padding: '14px 20px', marginBottom: 20 }}>
        <p style={{ fontSize: 16, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Bill Lookup (testing) —</strong>{' '}
          pick Federal or Arizona State below, then type a bill name or an issue. Covers House and
          Senate votes for both levels. New this session — flag anything that looks off.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[{ id: 'federal', label: 'Federal' }, { id: 'state', label: 'Arizona State' }].map(opt => (
          <button
            key={opt.id}
            onClick={() => { setLevel(opt.id); setBillList(null); setVotesResult(null); setError(null); }}
            style={{
              padding: '8px 18px', fontSize: 15, fontWeight: 700, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${level === opt.id ? B.teal : B.border}`,
              background: level === opt.id ? B.teal : B.surface,
              color: level === opt.id ? '#fff' : B.textMid,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={level === 'state' ? 'e.g. "Prop 400 extension" or "water rights"' : 'e.g. "CHIPS Act" or "semiconductor manufacturing"'}
          disabled={loading}
          style={{ flex: 1, padding: '12px 16px', fontSize: 15, borderRadius: 8, border: `1.5px solid ${B.border}`, fontFamily: 'inherit' }}
        />
        <button type="submit" disabled={loading || !query.trim()} style={{
          padding: '12px 24px', fontSize: 15, fontWeight: 700, borderRadius: 8, border: 'none',
          background: B.teal, color: '#fff', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit',
        }}>
          {loading ? 'Searching…' : 'Search →'}
        </button>
      </form>

      {error && (
        <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 20, color: '#991b1b', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Issue-search picklist — hidden while viewing a bill's results, but
          kept in memory (not cleared) so "← Back to results" can return to
          it without re-querying Perplexity. */}
      {billList && !votesResult && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 700, marginBottom: 10 }}>Several bills matched — pick one:</p>
          {billList.map((b, i) => (
            <button key={i} onClick={() => fetchVotes(b)} disabled={loading} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', marginBottom: 8,
              borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.surface, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {b.billType} {b.billNumber} — {b.title}
                {b.year && <span style={{ color: B.textMute, fontWeight: 400 }}> ({b.year})</span>}
                {b.congress && <span style={{ color: B.textMute, fontWeight: 400 }}> ({b.congress}th Congress)</span>}
              </div>
              <div style={{ fontSize: 13, color: B.textMid, marginTop: 2 }}>{b.summary}</div>
            </button>
          ))}
        </div>
      )}

      {/* Resolved bill + vote results */}
      {votesResult && (
        <div>
          {billList && (
            <button onClick={backToList} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, padding: '8px 16px',
              borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.surface, color: B.teal,
              fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ← Back to results
            </button>
          )}
          <div style={{ background: B.surfaceAlt, borderRadius: '10px 10px 0 0', padding: '16px 20px', border: `1px solid ${B.border}`, borderBottom: 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.teal, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {votesResult.bill.billType} {votesResult.bill.billNumber} ·{' '}
              {votesResult.bill.level === 'state'
                ? `${votesResult.bill.state} Legislature, ${votesResult.bill.year}`
                : `${votesResult.bill.congress}th Congress`}
            </div>
            <h3 style={{ margin: '4px 0 8px', fontSize: 20 }}>{votesResult.bill.title}</h3>
            {votesResult.bill.summary && <p style={{ fontSize: 15, color: B.text, lineHeight: 1.6, margin: '0 0 10px' }}>{votesResult.bill.summary}</p>}
            {votesResult.bill.sponsor && <p style={{ fontSize: 15, color: B.textMid, margin: '0 0 4px' }}>Sponsor: {votesResult.bill.sponsor.name}</p>}
            {votesResult.bill.introducedDate && <p style={{ fontSize: 15, color: B.textMid, margin: '0 0 4px' }}>Introduced: {votesResult.bill.introducedDate}</p>}
            {votesResult.bill.latestAction && <p style={{ fontSize: 15, color: B.textMid, margin: 0 }}>Latest action ({votesResult.bill.latestAction.date}): {votesResult.bill.latestAction.text || votesResult.bill.latestAction.action}</p>}
            {votesResult.bill.history?.length > 1 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 15, color: B.teal, fontWeight: 700, cursor: 'pointer' }}>Full status history ({votesResult.bill.history.length} steps) — did it pass, get signed?</summary>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
                  <tbody>
                    {votesResult.bill.history.map((h, i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? `1px solid ${B.border}` : 'none' }}>
                        <td style={{ padding: '6px 8px', color: B.textMute, whiteSpace: 'nowrap' }}>{h.date}</td>
                        <td style={{ padding: '6px 8px' }}>{h.chamber && <span style={{ color: B.textMute }}>[{h.chamber}] </span>}{h.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {votesResult.subjects?.policyArea && (
              <p style={{ fontSize: 15, marginTop: 10 }}>
                <span style={{ background: B.gold, color: B.charcoal, padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>{votesResult.subjects.policyArea}</span>
                {votesResult.subjects.legislativeSubjects?.length > 0 && (
                  <span style={{ color: B.textMute, marginLeft: 10 }}>{votesResult.subjects.legislativeSubjects.join(' · ')}</span>
                )}
              </p>
            )}
          </div>

          <div style={{ border: `1px solid ${B.border}`, borderRadius: '0 0 10px 10px', padding: 20 }}>
            {votesResult.rollCalls.length === 0 && (
              <p style={{ color: B.textMid, fontSize: 14 }}>No recorded votes found for this bill.</p>
            )}
            {votesResult.legiscanNote && (
              <div style={{ background: '#fff7ed', border: '1px solid #f5c842', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 15, color: '#7a4f00' }}>
                {votesResult.legiscanNote}
              </div>
            )}

            {votesResult.rollCalls.map((rc, i) => {
              const isOpen = expandedRollCall === i;
              return (
                <div key={i} style={{ marginBottom: 10, border: `1px solid ${B.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedRollCall(isOpen ? -1 : i)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '14px 16px', border: 'none', cursor: 'pointer',
                      background: isOpen ? B.surfaceAlt : B.surface, fontFamily: 'inherit',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <span style={{ background: rc.chamber === 'Senate' ? B.gold : B.teal, color: rc.chamber === 'Senate' ? B.charcoal : '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, marginRight: 8 }}>{rc.chamber}</span>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{rc.voteQuestion || 'Vote'}</span>
                      {rc.result && <span style={{ color: rc.result === 'Passed' ? B.green : B.red, fontWeight: 700, fontSize: 16 }}> ({rc.result})</span>}
                      <span style={{ display: 'block', fontSize: 13, color: B.textMute, marginTop: 2 }}>
                        {rc.date} · {rc.tally?.yea ?? '–'} Yea, {rc.tally?.nay ?? '–'} Nay
                        {rc.tally?.notVoting ? `, ${rc.tally.notVoting} Not Voting` : ''}
                        {rc.tally?.absent ? `, ${rc.tally.absent} Absent` : ''}
                      </span>
                    </span>
                    <span style={{ fontSize: 20, color: B.textMid }}>{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: '12px 16px', borderTop: `1px solid ${B.border}` }}>
                      {rc.matchIntegrityWarning && (
                        <div style={{ background: '#fee2e2', border: '1.5px solid #dc2626', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 15, color: '#991b1b', fontWeight: 700 }}>
                          ⚠️ Vote matching failed an internal integrity check for this action — more candidates were matched than people who actually voted. Do NOT use these results; this has been logged for investigation.
                        </div>
                      )}
                      {rc.noIndividualVoteData ? (
                        <div style={{ background: '#f0f4f8', border: `1px solid ${B.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 15, color: B.textMid }}>
                          No individual member positions recorded for this action — likely a voice vote or unanimous-consent action rather than a real gap in the data.
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16 }}>
                          <tbody>
                            {rc.candidateVotes.filter(cv => !cv.notInCongressForThisVote).map((cv, j) => (
                              <CandidateVoteRow key={j} cv={cv} />
                            ))}
                          </tbody>
                        </table>
                      )}

                      {!rc.noIndividualVoteData && (() => {
                        const notInCongress = rc.candidateVotes.filter(cv => cv.notInCongressForThisVote);
                        if (notInCongress.length === 0) return null;
                        const isNicOpen = !!expandedNotInCongress[i];
                        return (
                          <div style={{ marginTop: 14 }}>
                            <button
                              onClick={() => setExpandedNotInCongress(prev => ({ ...prev, [i]: !prev[i] }))}
                              style={{
                                width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 8,
                                border: `1px solid ${B.border}`, background: B.surfaceAlt, color: B.textMid,
                                fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              }}
                            >
                              <span>Not in Congress yet ({notInCongress.length})</span>
                              <span>{isNicOpen ? '▲' : '▼'}</span>
                            </button>
                            {isNicOpen && (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, marginTop: 6 }}>
                                <tbody>
                                  {notInCongress.map((cv, j) => (
                                    <tr key={j} style={{ borderTop: j > 0 ? `1px solid ${B.border}` : 'none' }}>
                                      <td style={{ padding: '8px', color: B.textMute }}>
                                        {cv.name} <span style={{ fontSize: 13 }}>({cv.party}-{cv.state}, {cv.district})</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
