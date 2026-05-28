import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CandidateQuery.css';

const FILTER_TYPES = [
  { id: 'all',            label: 'All Results' },
  { id: 'accomplishment', label: 'Accomplishments' },
  { id: 'vulnerability',  label: 'Vulnerabilities' },
  { id: 'strength',       label: 'Strengths' },
  { id: 'quote',          label: 'Quotes' },
  { id: 'background',     label: 'Background' },
];

export default function CandidateQuery() {
  const [query,             setQuery]             = useState('');
  const [filterType,        setFilterType]        = useState('all');
  const [results,           setResults]           = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState(null);
  const [expandedCandidate, setExpandedCandidate] = useState(null);
  const [copiedFact,        setCopiedFact]        = useState(null);
  const [sentFact,          setSentFact]          = useState(null);

  const navigate = useNavigate();

  async function handleQuery(e) {
    e.preventDefault();
    if (!query.trim()) { setError('Please enter a search query'); return; }
    setLoading(true); setError(null); setResults(null); setFilterType('all');
    try {
      const response = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), filterType: null }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) { setError(data.error || 'Query failed'); return; }
      if (data.results.length === 0) { setError('No results found. Try a different search.'); return; }
      setResults(data.results);
      setExpandedCandidate(null);
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Client-side filter on already-returned results
  const filteredResults = results ? results.map(candidate => {
    if (filterType === 'all') return candidate;
    const filteredFacts = (candidate.facts || []).filter(f =>
      f.type?.toLowerCase().includes(filterType) ||
      f.category?.toLowerCase().includes(filterType)
    );
    return { ...candidate, facts: filteredFacts };
  }).filter(candidate => filterType === 'all' || candidate.facts.length > 0) : [];

  const handleCopyFact = (candidate, fact, uniqueIdx) => {
    const text = `${candidate.candidate_name} (${candidate.office}): ${fact.text}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedFact(uniqueIdx);
        setTimeout(() => setCopiedFact(null), 2500);
      });
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(el); el.focus(); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
      setCopiedFact(uniqueIdx);
      setTimeout(() => setCopiedFact(null), 2500);
    }
  };

  const handleTakeToMessageMachine = (candidate, fact, uniqueIdx) => {
    const issueText = `${candidate.candidate_name} (${candidate.office}, ${candidate.party === 'D' ? 'Democrat' : candidate.party === 'R' ? 'Republican' : 'Independent'}): ${fact.text}`;
    setSentFact(uniqueIdx);
    setTimeout(() => setSentFact(null), 2000);
    navigate('/messaging', {
      state: {
        prefillIssue: issueText,
      }
    });
  };

  const totalFacts = filterType === 'all'
    ? null
    : filteredResults.reduce((sum, c) => sum + c.facts.length, 0);

  return (
    <div className="candidate-query">
      <div className="query-header">
        <h2>Candidate Research Query</h2>
        <p>Search candidate profiles by issue, accomplishment, vulnerability, or quote</p>
      </div>

      <form onSubmit={handleQuery} className="query-form">
        <input
          type="text"
          placeholder="e.g., 'What has Hobbs done on housing?' or 'Bolick vulnerabilities'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          className="query-input"
        />
        <button type="submit" disabled={loading} className="query-button">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Filter — only shown after results load */}
      {results && (
        <div className="filter-controls">
          <label>Filter by type:</label>
          <div className="filter-buttons">
            {FILTER_TYPES.map((filter) => (
              <button
                key={filter.id}
                className={`filter-button ${filterType === filter.id ? 'active' : ''}`}
                onClick={() => setFilterType(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {filterType !== 'all' && (
            <p style={{ fontSize:13, color:"#777", marginTop:8 }}>
              Showing {totalFacts} fact{totalFacts !== 1 ? 's' : ''} matching "{FILTER_TYPES.find(f=>f.id===filterType)?.label}"
            </p>
          )}
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {filteredResults.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h3>
              {filterType === 'all'
                ? `Results (${filteredResults.length} candidate${filteredResults.length !== 1 ? 's' : ''})`
                : `${filteredResults.length} candidate${filteredResults.length !== 1 ? 's' : ''} · ${totalFacts} matching fact${totalFacts !== 1 ? 's' : ''}`
              }
            </h3>
            <p className="results-subtext">Click a candidate card to expand and see facts</p>
          </div>

          <div className="results-list">
            {filteredResults.map((candidate, idx) => (
              <div
                key={idx}
                className={`candidate-card ${expandedCandidate === idx ? 'expanded' : ''}`}
                onClick={() => setExpandedCandidate(expandedCandidate === idx ? null : idx)}
              >
                <div className="candidate-header">
                  <div className="candidate-info">
                    <h4>{candidate.candidate_name}</h4>
                    <div className="candidate-meta">
                      <span className={`party-badge party-${candidate.party}`}>
                        {candidate.party === 'D' ? 'Democrat' : candidate.party === 'R' ? 'Republican' : 'Independent'}
                      </span>
                      <span className="office-badge">{candidate.office}</span>
                      {candidate.district && (
                        <span className="district-badge">{candidate.district}</span>
                      )}
                    </div>
                  </div>
                  <div className="expand-icon">
                    {expandedCandidate === idx ? '▼' : '▶'}
                  </div>
                </div>

                {expandedCandidate === idx && (
                  <div className="candidate-facts">
                    {candidate.facts && candidate.facts.length > 0 ? (
                      candidate.facts.map((fact, factIdx) => {
                        const uniqueIdx = `${idx}-${factIdx}`;
                        const isCopied = copiedFact === uniqueIdx;
                        const isSent   = sentFact   === uniqueIdx;
                        return (
                          <div key={factIdx} className="fact-item">
                            <div className="fact-type-badge">{fact.type}</div>
                            <div className="fact-category">{fact.category}</div>
                            <div className="fact-text">{fact.text}</div>
                            <div className="fact-source">{fact.source_section}</div>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
                              <button
                                className="use-in-post-button"
                                style={{
                                  background: isCopied ? "#1D5C4A" : undefined,
                                  color:      isCopied ? "#ffffff"  : undefined,
                                  borderColor:isCopied ? "#1D5C4A"  : undefined,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyFact(candidate, fact, uniqueIdx);
                                }}
                              >
                                {isCopied ? "✓ Copied!" : "Copy Fact"}
                              </button>
                              <button
                                className="use-in-post-button"
                                style={{
                                  background:  isSent ? "#1D5C4A" : "#3ECFB2",
                                  color:       "#1D5C4A",
                                  borderColor: "#1D5C4A",
                                  fontWeight:  700,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTakeToMessageMachine(candidate, fact, uniqueIdx);
                                }}
                              >
                                {isSent ? "✓ Sending…" : "→ Message Machine"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="no-facts">No facts found matching this filter</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results && filteredResults.length === 0 && filterType !== 'all' && (
        <div className="error-message">
          No results match "{FILTER_TYPES.find(f=>f.id===filterType)?.label}". Try a different filter or clear it to see all results.
        </div>
      )}
    </div>
  );
}
