import { useState } from 'react';
import CandidateQuery from './CandidateQuery';
import RaceComparison from './RaceComparison';
import DistrictProfiles from './DistrictProfiles';
import IssuesPage from './IssuesPage';

const B = {
  teal:      'var(--teal)',
  tealLight: 'var(--teal-mid)',
  gold:      'var(--gold)',
  turquoise: 'var(--turquoise)',
  charcoal:  'var(--charcoal)',
  surface:   'var(--bg)',
  surfaceAlt:'var(--surface-alt)',
  border:    'var(--border)',
  text:      'var(--text)',
  textMid:   'var(--text-mid)',
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
  {
    id:    'geo',
    label: '🗺️ Geographic Profiles',
    desc:  'Districts, counties & statewide demographics',
  },
  {
    id:    'issues',
    label: '🌶️ Issues',
    desc:  'Statewide & local issue briefs with messaging angles',
  },
];

export default function ResearchPage() {
  const [activeTab, setActiveTab] = useState('search');

  return (
    <div style={{ fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: B.text }}>

      {/* Eyebrow */}
      <div style={{
        background: `${B.teal}08`,
        border: `1px solid ${B.teal}25`,
        borderRadius: 10,
        padding: '14px 20px',
        marginBottom: 20,
      }}>
        <p style={{ fontSize: 14, color: B.textMid, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: B.teal }}>Research Hub —</strong>{' '}
          everything you need to know your races, your districts, and your issues. Search every
          candidate's record, compare D vs R head-to-head, look up district and county demographics
          and messaging guidance, or pull a ready-made brief on a statewide issue. Anything you find
          can be sent straight to Message Machine to start drafting.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: `2px solid ${B.border}`,
        marginBottom: 28,
        gap: 0,
        flexWrap: 'wrap',
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                minWidth: 180,
                padding: '14px 20px',
                border: 'none',
                borderBottom: isActive ? `4px solid ${B.gold}` : `4px solid transparent`,
                background: isActive ? B.teal : B.surfaceAlt,
                color: isActive ? '#fff' : B.textMid,
                fontWeight: isActive ? 700 : 500,
                fontSize: 15,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                marginBottom: -2,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: isActive ? 700 : 600 }}>{tab.label}</div>
              <div style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.8)' : '#aaa', marginTop: 2 }}>{tab.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'search' && <CandidateQuery />}
      {activeTab === 'races'  && <RaceComparison />}
      {activeTab === 'geo'    && <DistrictProfiles />}
      {activeTab === 'issues' && <IssuesPage />}
    </div>
  );
}
