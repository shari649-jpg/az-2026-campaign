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
  const isYea = /yea|yes|aye/i.test(position);
  const isNay = /nay|no/i.test(position);
  const color = isYea ? B.green : isNay ? B.red : B.textMid;
  return <span style={{ color, fontWeight: 700, fontSize: 13 }}>{position}</span>;
}

export default function BillLookup() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [billList, setBillList] = useState(null);   // issue-search mode: pick from a list
  const [votesResult, setVotesResult] = useState(null); // resolved bill + roll calls
  const [expandedRollCall, setExpandedRollCall] = useState(-1); // -1 = all collapsed by default; only one open at a time to keep this usable on mobile

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(null); setBillList(null); setVotesResult(null);
    try {
      const resolved = await callFunction('resolve-bill', { query: query.trim() });
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
      const result = await callFunction('bill-votes', {
        congress: bill.congress, billType: bill.billType, billNumber: bill.billNumber,
      });
      setVotesResult(result);
      setBillList(null);
      setExpandedRollCall(-1);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text }}>
      <div style={{ background: `${B.teal}08`, border: `1px solid ${B.teal}25`, borderRadius: 10, padding: '14px 20px', marginBottom: 20 }}>
        <p style={{ fontSize: 16, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Bill Lookup (testing) —</strong>{' '}
          type a bill name ("CHIPS Act") or an issue ("semiconductor manufacturing"). House votes
          only for now, and only for the 118th Congress (2023) onward — see notes below results.
        </p>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder='e.g. "CHIPS Act" or "semiconductor manufacturing"'
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

      {/* Issue-search picklist */}
      {billList && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 700, marginBottom: 10 }}>Several bills matched — pick one:</p>
          {billList.map((b, i) => (
            <button key={i} onClick={() => fetchVotes(b)} disabled={loading} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', marginBottom: 8,
              borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.surface, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.billType} {b.billNumber} — {b.title}</div>
              <div style={{ fontSize: 13, color: B.textMid, marginTop: 2 }}>{b.summary}</div>
            </button>
          ))}
        </div>
      )}

      {/* Resolved bill + vote results */}
      {votesResult && (
        <div>
          <div style={{ background: B.surfaceAlt, borderRadius: '10px 10px 0 0', padding: '16px 20px', border: `1px solid ${B.border}`, borderBottom: 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.teal, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {votesResult.bill.billType} {votesResult.bill.billNumber} · {votesResult.bill.congress}th Congress
            </div>
            <h3 style={{ margin: '4px 0 8px', fontSize: 20 }}>{votesResult.bill.title}</h3>
            {votesResult.bill.sponsor && <p style={{ fontSize: 15, color: B.textMid, margin: '0 0 4px' }}>Sponsor: {votesResult.bill.sponsor.name}</p>}
            {votesResult.bill.latestAction && <p style={{ fontSize: 15, color: B.textMid, margin: 0 }}>Latest action ({votesResult.bill.latestAction.date}): {votesResult.bill.latestAction.text}</p>}
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
              <p style={{ color: B.textMid, fontSize: 14 }}>No recorded House votes found on this bill's actions.</p>
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
                      <span style={{ fontWeight: 700, fontSize: 16 }}>Roll Call #{rc.rollNumber} — {rc.voteQuestion || 'Vote'}</span>
                      {rc.result && <span style={{ color: rc.result === 'Passed' ? B.green : B.red, fontWeight: 700, fontSize: 16 }}> ({rc.result})</span>}
                      <span style={{ display: 'block', fontSize: 13, color: B.textMute, marginTop: 2 }}>{rc.date}</span>
                    </span>
                    <span style={{ fontSize: 20, color: B.textMid }}>{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: '12px 16px', borderTop: `1px solid ${B.border}` }}>
                      {rc.voteCoverageGap ? (
                        <div style={{ background: '#fff7ed', border: '1px solid #f5c842', borderRadius: 8, padding: '12px 16px', fontSize: 15, color: '#7a4f00' }}>
                          This vote happened, but member-level position data isn't available for Congresses before the 118th (2023) — known API limitation, not a bug.
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16 }}>
                          <tbody>
                            {rc.candidateVotes.map((cv, j) => (
                              <tr key={j} style={{ borderTop: j > 0 ? `1px solid ${B.border}` : 'none' }}>
                                <td style={{ padding: '10px 8px' }}>
                                  {cv.name} <span style={{ color: B.textMute, fontSize: 14 }}>({cv.party}-{cv.state}, {cv.district})</span>
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                  {cv.notInCongressForThisVote ? <span style={{ color: B.textMute, fontSize: 15 }}>Not in Congress for this vote</span> : <VoteBadge position={cv.position} />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {votesResult.senateNote && (
              <div style={{ background: '#fff7ed', border: '1px solid #f5c842', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#7a4f00' }}>
                {votesResult.senateNote}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
