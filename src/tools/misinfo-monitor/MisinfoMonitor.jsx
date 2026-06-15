import { useState, useEffect, useCallback } from "react";

// ── Brand tokens ────────────────────────────────────────────────────────────
const TEAL      = "#1D5C4A";
const GOLD      = "#F5C842";
const CHARCOAL  = "#4A4558";
const TURQUOISE = "#3ECFB2";
const TERRA     = "#C1673A";
const SURFACE   = "#F9F8F5";
const BORDER    = "#E0DDD6";
const TEAL_LITE = "#e0f2ec";
const INK       = CHARCOAL;

// ── Narrative category labels (used for filter dropdown) ────────────────────
const NARRATIVE_LABELS = [
  "Election Integrity Claims",
  "Immigration Misinformation",
  "Economic Falsehoods",
  "Health & Science Denial",
  "Crime & Safety Distortions",
  "Identity & Social Issues",
];

// ── Mini bar chart ───────────────────────────────────────────────────────────
function BarChart({ data }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => Math.max(d.r, d.d)), 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, minWidth: data.length * 52, height: 140, paddingBottom: 24, position: "relative" }}>
        {data.map((week, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1, minWidth: 44 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 110 }}>
              <div title={`Republican-targeting: ${week.r}`} style={{
                width: 18, height: Math.max(2, (week.r / maxVal) * 110),
                background: TERRA, borderRadius: "3px 3px 0 0", transition: "height 0.4s",
              }} />
              <div title={`Democrat-targeting: ${week.d}`} style={{
                width: 18, height: Math.max(2, (week.d / maxVal) * 110),
                background: TEAL, borderRadius: "3px 3px 0 0", transition: "height 0.4s",
              }} />
            </div>
            <div style={{ fontSize: 10, color: "#999", whiteSpace: "nowrap", marginTop: 4 }}>{week.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: INK }}>
          <span style={{ width: 12, height: 12, background: TERRA, borderRadius: 2, display: "inline-block" }} />
          Flagging GOP-aligned claims
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: INK }}>
          <span style={{ width: 12, height: 12, background: TEAL, borderRadius: 2, display: "inline-block" }} />
          Flagging Dem-aligned claims
        </span>
      </div>
    </div>
  );
}

// ── Narrative pill ──────────────────────────────────────────────────────────
function NarrativePill({ label }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      background: TEAL_LITE, color: TEAL, borderRadius: 4,
      padding: "2px 7px", border: `1px solid #b2d9cc`,
    }}>{label}</span>
  );
}

// ── Note card ───────────────────────────────────────────────────────────────
function NoteCard({ note, onSendToRebuttal }) {
  const [sent, setSent]         = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inferring, setInferring] = useState(false);

  const isLong = note.summary.length > 280;
  const displayText = expanded || !isLong
    ? note.summary
    : note.summary.slice(0, 280) + "…";

  // Infer the original false claim from the Community Note (correction text),
  // then push that as the narrative to the Rebuttal Generator.
  async function handleSend() {
    setInferring(true);
    try {
      let narrative = note.summary;

      // Ask Claude to infer the original false claim from the correction note
      try {
        const res = await fetch("/.netlify/functions/generate-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            max_tokens: 150,
            messages: [{
              role: "user",
              content: `A Community Note is a fact-check correction posted on X/Twitter. Based on the correction below, infer the original false claim or misleading narrative that was being corrected. State the false claim in one concise sentence as if it were being spread — no commentary, no preamble, just the claim itself.

Community Note (the correction): "${note.summary}"

Original false claim:`,
            }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const inferred = data.content?.[0]?.text?.trim();
          if (inferred && inferred.length > 10) narrative = inferred;
        }
      } catch {
        // Fall back to using the note summary directly
      }

      try {
        localStorage.setItem("rebuttal_push_results", JSON.stringify({
          narrative,
          source: "Community Notes Monitor",
          communityNote: note.summary,
          sentAt: new Date().toISOString(),
        }));
        setSent(true);
        setTimeout(() => window.location.assign("/rebuttal"), 700);
      } catch {
        onSendToRebuttal(narrative);
      }
    } finally {
      setInferring(false);
    }
  }

  return (
    <div style={{
      background: "#fff",
      border: `1.5px solid ${BORDER}`,
      borderLeft: `4px solid ${note.side === "R" ? TERRA : TEAL}`,
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1 }}>
          {/* Label: Community Note is the correction */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#aaa", marginBottom: 5 }}>
            Community Note · Fact-Check Correction
          </div>
          <p style={{ margin: 0, fontSize: 14, color: INK, lineHeight: 1.6 }}>
            {displayText}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(e => !e)} style={{
              background: "none", border: "none", color: TEAL, fontWeight: 700,
              fontSize: 12, cursor: "pointer", padding: "4px 0 0", fontFamily: "inherit",
            }}>
              {expanded ? "Show less ↑" : "Show full note ↓"}
            </button>
          )}
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
          padding: "3px 9px", borderRadius: 5,
          background: note.side === "R" ? "#fde8dc" : TEAL_LITE,
          color: note.side === "R" ? TERRA : TEAL,
          border: `1.5px solid ${note.side === "R" ? "#f3c4aa" : "#b2d9cc"}`,
        }}>
          {note.side === "R" ? "GOP-target" : note.side === "D" ? "Dem-target" : "Mixed"}
        </span>
      </div>

      {note.narratives.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {note.narratives.map(n => <NarrativePill key={n} label={n} />)}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#999" }}>
          {note.date && <span>Flagged {note.date}</span>}
          {inferring && <span style={{ marginLeft: 8, color: TEAL }}>Inferring claim…</span>}
        </div>
        <button
          onClick={handleSend}
          disabled={sent || inferring}
          style={{
            fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            padding: "5px 12px", borderRadius: 6,
            cursor: (sent || inferring) ? "default" : "pointer",
            background: sent ? TEAL_LITE : inferring ? "#f5f5f5" : GOLD,
            color: sent ? TEAL : CHARCOAL,
            border: `1.5px solid ${sent ? "#b2d9cc" : "#d4a800"}`,
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          {sent ? "✓ Sent to Rebuttal" : inferring ? "Analyzing…" : "Send to Rebuttal Generator →"}
        </button>
      </div>
    </div>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 10,
      padding: "18px 20px", borderTop: `4px solid ${accent}`,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: INK, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Narrative leaderboard ────────────────────────────────────────────────────
function NarrativeLeaderboard({ counts, side }) {
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,6);
  const max = sorted[0]?.[1] || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map(([label, count]) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: INK, fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 13, color: "#888", fontWeight: 700 }}>{count}</span>
          </div>
          <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${(count/max)*100}%`,
              background: side === "R" ? TERRA : TEAL,
              transition: "width 0.5s",
            }} />
          </div>
        </div>
      ))}
      {sorted.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>No data yet.</div>}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function MisinfoMonitor() {
  const [status, setStatus]         = useState("idle"); // idle | loading | done | error
  const [notes, setNotes]           = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [repNarCounts, setRepNar]   = useState({});
  const [demNarCounts, setDemNar]   = useState({});
  const [totalR, setTotalR]         = useState(0);
  const [totalD, setTotalD]         = useState(0);
  const [lastFetch, setLastFetch]   = useState(null);
  const [filter, setFilter]         = useState("all"); // all | R | D
  const [narrativeFilter, setNarrativeFilter] = useState(null);
  const [page, setPage]             = useState(0);
  const [errorMsg, setErrorMsg]     = useState("");

  const PER_PAGE = 12;

  // ── Apply stats from server response ─────────────────────────────────────
  const applyStats = useCallback((stats) => {
    setWeeklyData(stats.weeklyData || []);
    setTotalR(stats.totalR || 0);
    setTotalD(stats.totalD || 0);
    setRepNar(stats.repNar || {});
    setDemNar(stats.demNar || {});
  }, []);

  // ── Fetch data via Netlify function (server-side, no CORS issues) ─────────
  const fetchData = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/.netlify/functions/fetch-community-notes", {
        signal: AbortSignal.timeout(28000),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }
      if (!data.notes?.length) {
        throw new Error(data.warning || "No political notes found in dataset.");
      }

      setNotes(data.notes);
      applyStats(data.stats);
      const fetched = data.fetchedAt
        ? new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : "just now";
      setLastFetch(`Live data · ${fetched}`);
      setStatus("done");
      setPage(0);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to load Community Notes data.");
      loadDemoData();
    }
  }, [applyStats]);

  // ── Demo / fallback data shown on first load before live fetch ───────────
  const loadDemoData = useCallback(() => {
    const demo = [
      { summary: "This post falsely claims that mail-in ballots were destroyed in Maricopa County during the 2024 election. Official records show no evidence of this.", side:"R", date:"Jun 10", weekLbl:"6/8", narratives:["Election Integrity Claims"] },
      { summary: "False claim that illegal immigration has caused a 400% increase in crime in Arizona border towns. FBI data shows no such trend.", side:"R", date:"Jun 9", weekLbl:"6/8", narratives:["Immigration Misinformation","Crime & Safety Distortions"] },
      { summary: "This post claims vaccines caused more deaths than COVID-19. CDC data directly contradicts this assertion.", side:"R", date:"Jun 8", weekLbl:"6/8", narratives:["Health & Science Denial"] },
      { summary: "False: Democrats voted to defund the police in Arizona. No such bill was introduced or passed in the Arizona legislature.", side:"D", date:"Jun 10", weekLbl:"6/8", narratives:["Crime & Safety Distortions"] },
      { summary: "Claim that Biden's economy added zero jobs is false — BLS data shows consistent monthly job growth throughout 2023-2024.", side:"D", date:"Jun 9", weekLbl:"6/8", narratives:["Economic Falsehoods"] },
      { summary: "This post falsely attributes a quote about 'open borders' to Senator Mark Kelly. No such statement exists in the public record.", side:"D", date:"Jun 7", weekLbl:"6/1", narratives:["Immigration Misinformation"] },
      { summary: "Claim that Trump was found guilty of election interference in Arizona is false — no such conviction occurred in Arizona courts.", side:"R", date:"Jun 6", weekLbl:"6/1", narratives:["Election Integrity Claims"] },
      { summary: "False: Arizona banned all books about LGBTQ topics in schools. The legislation referenced only applied to explicit material and has specific criteria.", side:"D", date:"Jun 5", weekLbl:"6/1", narratives:["Identity & Social Issues"] },
      { summary: "Post claims fentanyl seizures at legal ports of entry support the case for a border wall. Experts note most seizures occur at legal crossings, contradicting this framing.", side:"R", date:"Jun 4", weekLbl:"6/1", narratives:["Immigration Misinformation","Health & Science Denial"] },
      { summary: "False claim that MAGA Republicans voted to cut Social Security by 30%. No such vote occurred in the current Congress.", side:"R", date:"Jun 3", weekLbl:"5/25", narratives:["Economic Falsehoods"] },
      { summary: "This post falsely states that climate scientists receive government payments for favorable reports. No evidence of this practice exists.", side:"R", date:"Jun 2", weekLbl:"5/25", narratives:["Health & Science Denial"] },
      { summary: "Viral post claiming Democrats passed a bill allowing abortion up to birth in Arizona is false. No such bill passed.", side:"D", date:"Jun 1", weekLbl:"5/25", narratives:["Identity & Social Issues"] },
      { summary: "False: Ruben Gallego supports abolishing ICE. His voting record shows no such position.", side:"D", date:"May 31", weekLbl:"5/25", narratives:["Immigration Misinformation"] },
      { summary: "Post falsely claims Arizona unemployment skyrocketed under Democratic leadership. BLS data shows it remained near historic lows.", side:"D", date:"May 30", weekLbl:"5/25", narratives:["Economic Falsehoods"] },
      { summary: "Claim that transgender athletes have dominated every Arizona high school sports category is false. No documented cases of the scale described.", side:"R", date:"May 29", weekLbl:"5/25", narratives:["Identity & Social Issues"] },
      { summary: "False: There were no Republican observers present during Maricopa County ballot counting. Observers from both parties were documented on-site.", side:"R", date:"May 28", weekLbl:"5/18", narratives:["Election Integrity Claims"] },
    ];
    // Build stats inline (no dependency on removed buildStats)
    const wkMap = {};
    let rCount = 0, dCount = 0;
    const rNar = {}, dNar = {};
    demo.forEach(n => {
      if (!wkMap[n.weekLbl]) wkMap[n.weekLbl] = { label: n.weekLbl, r: 0, d: 0 };
      if (n.side === "R" || n.side === "both") { wkMap[n.weekLbl].r++; rCount++; }
      if (n.side === "D" || n.side === "both") { wkMap[n.weekLbl].d++; dCount++; }
      n.narratives.forEach(nar => {
        if (n.side === "R" || n.side === "both") rNar[nar] = (rNar[nar] || 0) + 1;
        if (n.side === "D" || n.side === "both") dNar[nar] = (dNar[nar] || 0) + 1;
      });
    });
    const sortedWeeks = Object.values(wkMap).sort((a,b) => {
      const p = s => { const x = s.split("/"); return parseInt(x[0])*100+parseInt(x[1]); };
      return p(a.label) - p(b.label);
    });
    setNotes(demo);
    setWeeklyData(sortedWeeks);
    setTotalR(rCount);
    setTotalD(dCount);
    setRepNar(rNar);
    setDemNar(dNar);
    setLastFetch("Demo data · click Load Live Data for real notes");
    setStatus("done");
    setPage(0);
  }, []);

  // ── On mount: try Firestore cache first, fall back to demo ───────────────
  useEffect(() => {
    const loadCached = async () => {
      setStatus("loading");
      try {
        // fetch-community-notes now accepts ?source=cache to read Firestore
        // instead of hitting X directly — instant load from yesterday's data
        const res = await fetch("/.netlify/functions/fetch-community-notes?source=cache", {
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json();
        if (res.ok && data.notes?.length) {
          setNotes(data.notes);
          applyStats(data.stats);
          const dateStr = data.fetchedAt
            ? new Date(data.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : "today";
          setLastFetch(`Updated ${dateStr}`);
          setStatus("done");
          return;
        }
      } catch (err) {
        console.warn("Cache load failed, falling back to demo:", err.message);
      }
      // Only reach here if Firestore cache is empty (first-ever run)
      loadDemoData();
    };
    loadCached();
  }, [applyStats, loadDemoData]);

  // ── Filtered notes ────────────────────────────────────────────────────────
  const filtered = notes.filter(n => {
    if (filter === "R" && n.side !== "R" && n.side !== "both") return false;
    if (filter === "D" && n.side !== "D" && n.side !== "both") return false;
    if (narrativeFilter && !n.narratives.includes(narrativeFilter)) return false;
    return true;
  });
  const paged = filtered.slice(page * PER_PAGE, (page+1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "80vh", background: SURFACE, fontFamily: "'Atkinson Hyperlegible', Georgia, serif" }}>

      {/* Header */}
      <div style={{
        background: TEAL, borderBottom: `4px solid ${GOLD}`,
        padding: "28px 24px 22px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>🔎</span>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase",
                  background: GOLD, color: CHARCOAL, borderRadius: 4, padding: "2px 8px",
                }}>Misinformation Monitor</span>
              </div>
              <h1 style={{ margin: 0, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", fontSize: 26, color: "#fff", fontWeight: 800, letterSpacing: "-0.01em" }}>
                Community Notes Dashboard
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "rgba(255,255,255,0.72)", lineHeight: 1.4 }}>
                Tracking X Community Notes flags across Republican &amp; Democratic political claims · Weekly misinformation trend analysis
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {lastFetch && (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
                  {status === "done" ? `Updated ${lastFetch}` : ""}
                </span>
              )}
              <button
                onClick={fetchData}
                disabled={status === "loading"}
                style={{
                  fontFamily: "inherit", fontWeight: 700, fontSize: 13,
                  padding: "8px 18px", borderRadius: 7, cursor: status === "loading" ? "default" : "pointer",
                  background: status === "loading" ? "rgba(255,255,255,0.1)" : GOLD,
                  color: status === "loading" ? "rgba(255,255,255,0.5)" : CHARCOAL,
                  border: "none", letterSpacing: "0.03em",
                  transition: "all 0.2s",
                }}
              >
                {status === "loading" ? "⏳ Loading live data…" : "↻ Load Live Data"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>

        {/* Error banner */}
        {errorMsg && (
          <div style={{
            background: "#fff8e8", border: `1.5px solid ${GOLD}`, borderRadius: 8,
            padding: "12px 16px", marginBottom: 24, fontSize: 13, color: CHARCOAL,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div>
              <strong>Live data unavailable:</strong> {errorMsg}<br />
              <span style={{ color: "#888" }}>Showing representative demo data. Click "Load Live Data" to retry.</span>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          <StatCard label="Total Flagged Notes" value={(totalR+totalD).toLocaleString()} sub="in dataset sample" accent={TURQUOISE} />
          <StatCard label="GOP-Targeting Flags" value={totalR.toLocaleString()} sub="notes flagging R claims" accent={TERRA} />
          <StatCard label="Dem-Targeting Flags" value={totalD.toLocaleString()} sub="notes flagging D claims" accent={TEAL} />
          <StatCard
            label="R vs D Ratio"
            value={totalD ? `${(totalR/totalD).toFixed(1)}×` : "—"}
            sub="GOP flags per Dem flag"
            accent={GOLD}
          />
        </div>

        {/* Weekly trend chart */}
        <div style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "20px 22px", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999", marginBottom: 3 }}>Weekly Trend</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Community Notes Flags by Week</div>
            </div>
          </div>
          <BarChart data={weeklyData} />
        </div>

        {/* Narrative leaderboards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
          {[
            { title: "Top GOP-Targeting Narratives", counts: repNarCounts, side: "R", accent: TERRA },
            { title: "Top Dem-Targeting Narratives", counts: demNarCounts, side: "D", accent: TEAL },
          ].map(({ title, counts, side, accent }) => (
            <div key={side} style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px", borderTop: `4px solid ${accent}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999", marginBottom: 4 }}>Narrative Breakdown</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 16 }}>{title}</div>
              <NarrativeLeaderboard counts={counts} side={side} />
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{
          background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 10,
          padding: "14px 18px", marginBottom: 18,
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em" }}>Filter:</span>
          {[
            { key:"all", label:"All Notes" },
            { key:"R",   label:"GOP-Targeting" },
            { key:"D",   label:"Dem-Targeting" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(0); }}
              style={{
                fontFamily: "inherit", fontWeight: 700, fontSize: 12,
                padding: "5px 13px", borderRadius: 6, cursor: "pointer",
                background: filter === f.key ? (f.key==="R" ? TERRA : f.key==="D" ? TEAL : CHARCOAL) : "transparent",
                color: filter === f.key ? "#fff" : INK,
                border: `1.5px solid ${filter === f.key ? "transparent" : BORDER}`,
                transition: "all 0.15s",
              }}
            >{f.label}</button>
          ))}
          <span style={{ width: 1, height: 20, background: BORDER, margin: "0 4px" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em" }}>Narrative:</span>
          <select
            value={narrativeFilter || ""}
            onChange={e => { setNarrativeFilter(e.target.value || null); setPage(0); }}
            style={{
              fontFamily: "inherit", fontSize: 12, padding: "4px 10px",
              borderRadius: 6, border: `1.5px solid ${BORDER}`, color: INK,
              background: "#fff", cursor: "pointer",
            }}
          >
            <option value="">All Narratives</option>
            {NARRATIVE_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#999" }}>{filtered.length} notes</span>
        </div>

        {/* Note cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {paged.map((note, i) => (
            <NoteCard
              key={note.noteId || i}
              note={note}
              onSendToRebuttal={(text) => {
                try { localStorage.setItem("rebuttal_push_results", JSON.stringify({ narrative: text, source: "Community Notes Monitor", sentAt: new Date().toISOString() })); } catch {}
                window.location.assign("/rebuttal");
              }}
            />
          ))}
          {paged.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa", fontSize: 14 }}>
              No notes match the current filter.
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
            <button
              onClick={() => setPage(p => Math.max(0, p-1))}
              disabled={page === 0}
              style={{ fontFamily:"inherit", fontWeight:700, fontSize:13, padding:"6px 14px", borderRadius:6, cursor: page===0?"default":"pointer", background:"#fff", color: page===0?"#ccc":INK, border:`1.5px solid ${BORDER}` }}
            >← Prev</button>
            <span style={{ fontSize: 13, color: "#888" }}>Page {page+1} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages-1, p+1))}
              disabled={page === totalPages-1}
              style={{ fontFamily:"inherit", fontWeight:700, fontSize:13, padding:"6px 14px", borderRadius:6, cursor: page===totalPages-1?"default":"pointer", background:"#fff", color: page===totalPages-1?"#ccc":INK, border:`1.5px solid ${BORDER}` }}
            >Next →</button>
          </div>
        )}

        {/* Data source note */}
        <div style={{
          marginTop: 40, padding: "16px 20px",
          background: TEAL_LITE, borderRadius: 10, border: `1px solid #b2d9cc`,
          fontSize: 12, color: "#556b62", lineHeight: 1.6,
        }}>
          <strong style={{ color: TEAL }}>Data source:</strong> X (Twitter) Community Notes publishes its full notes dataset as open TSV files daily at{" "}
          <a href="https://communitynotes.x.com/guide/en/under-the-hood/download-data" target="_blank" rel="noreferrer" style={{ color: TEAL }}>
            communitynotes.x.com ↗
          </a>. Data is fetched server-side via a Netlify function, parsed, and classified by political alignment using keyword matching against note summary text. Up to 10,000 notes are sampled per fetch. Classification is heuristic — intended for trend analysis, not individual attribution. Click "Load Live Data" to pull the latest dataset.
        </div>
      </div>
    </div>
  );
}
