import React, { useState } from 'react';
import './CandidateQuery.css';

const FILTER_TYPES = [
  { id: 'all', label: 'All Results' },
  { id: 'accomplishment', label: 'Accomplishments' },
  { id: 'vulnerability', label: 'Vulnerabilities' },
  { id: 'strength', label: 'Strengths' },
  { id: 'quote', label: 'Quotes' },
  { id: 'background', label: 'Background' },
];

export default function CandidateQuery({ onResultSelected }) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedCandidate, setExpandedCandidate] = useState(null);

  async function handleQuery(e) {
    e.preventDefault();
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/.netlify/functions/query-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          filterType: filterType !== 'all' ? filterType : null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Query failed');
        return;
      }

      if (data.results.length === 0) {
        setError('No results found. Try a different search.');
        return;
      }

      setResults(data.results);
      setExpandedCandidate(null);
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const handleUseInPost = (candidate, fact) => {
    if (onResultSelected) {
      onResultSelected({
        candidate_name: candidate.candidate_name,
        office: candidate.office,
        party: candidate.party,
        fact_text: fact.text,
        fact_type: fact.type,
        fact_category: fact.category,
      });
    }
  };

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

      <div className="filter-controls">
        <label>Filter by type:</label>
        <div className="filter-buttons">
          {FILTER_TYPES.map((filter) => (
            <button
              key={filter.id}
              className={`filter-button ${filterType === filter.id ? 'active' : ''}`}
              onClick={() => setFilterType(filter.id)}
              disabled={loading}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {results && (
        <div className="results-section">
          <div className="results-header">
            <h3>Results ({results.length} candidate{results.length !== 1 ? 's' : ''})</h3>
            <p className="results-subtext">Click a candidate card to expand and see facts</p>
          </div>

          <div className="results-list">
            {results.map((candidate, idx) => (
              <div
                key={idx}
                className={`candidate-card ${
                  expandedCandidate === idx ? 'expanded' : ''
                }`}
                onClick={() =>
                  setExpandedCandidate(expandedCandidate === idx ? null : idx)
                }
              >
                <div className="candidate-header">
                  <div className="candidate-info">
                    <h4>{candidate.candidate_name}</h4>
                    <div className="candidate-meta">
                      <span className={`party-badge party-${candidate.party}`}>
                        {candidate.party === 'D'
                          ? 'Democrat'
                          : candidate.party === 'R'
                          ? 'Republican'
                          : 'Independent'}
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
                      candidate.facts.map((fact, factIdx) => (
                        <div key={factIdx} className="fact-item">
                          <div className="fact-type-badge">{fact.type}</div>
                          <div className="fact-category">{fact.category}</div>
                          <div className="fact-text">{fact.text}</div>
                          <div className="fact-source">{fact.source_section}</div>
                          <button
                            className="use-in-post-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUseInPost(candidate, fact);
                            }}
                          >
                            Use in Post
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="no-facts">No facts found for this candidate</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}