import { useState } from 'react';
import CandidateQuery from './CandidateQuery';
import RaceComparison from './RaceComparison';

const B = {
  teal:      '#1D5C4A',
  tealLight: '#2a7a62',
  gold:      '#F5C842',
  turquoise: '#3ECFB2',
  charcoal:  '#4A4558',
  surface:   '#FFFFFF',
  surfaceAlt:'#F3F4F0',
  border:    '#C8C4BC',
  text:      '#1A1A1A',
  textMid:   '#4A4558',
};

const TABS = [
  {
    id:    'search',
    label: '🔍 Search Candidates',
    desc:  'Search by name, issue, district, or party',
  },
  {
    id:    'races',
    label: '⚡ Compare Races',
    desc:  'Browse all races — D vs R side-by-side',
  },
];

export default function ResearchPage() {
  const [activeTab, setActiveTab] = useState('search');

  return (
    <div style={{ fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text }}>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: `2px solid ${B.border}`,
        marginBottom: 28,
        gap: 0,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '14px 20px',
                border: 'none',
                borderBottom: isActive ? `3px solid ${B.teal}` : '3px solid transparent',
                background: isActive ? B.surface : B.surfaceAlt,
                color: isActive ? B.teal : B.textMid,
                fontWeight: isActive ? 700 : 500,
                fontSize: 15,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                marginBottom: -2, // overlap the border-bottom
              }}
            >
              <div style={{ fontSize: 15, fontWeight: isActive ? 700 : 600 }}>{tab.label}</div>
              <div style={{ fontSize: 12, color: isActive ? B.tealLight : '#aaa', marginTop: 2 }}>{tab.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'search' && <CandidateQuery />}
      {activeTab === 'races'  && <RaceComparison />}
    </div>
  );
}
