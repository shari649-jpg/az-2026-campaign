import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  useSocialPosting, callSocial, networkLabel,
  PRICE_PER_PROFILE, MAX_PROFILES,
} from "../lib/socialPosting";

// Social Posting panel (Oct 2026) — lives on the Profile page.
//
// States, all driven by the live socialPosting/{uid} doc (see
// lib/socialPosting.js):
//   none / canceled / incomplete → pitch + quantity + Subscribe (Stripe Checkout)
//   active                       → one card per paid profile: connect accounts,
//                                  see what's connected; add a profile; manage billing
//   past_due                     → locked, with a link to fix the card
//
// After Stripe redirects back with ?social=success, nothing here "approves"
// anything: we just wait for the webhook to flip the doc to active, which
// the live listener picks up on its own.

const PLUM = "#4A3163";
const TEAL = "#0E7A8C";
const SALMON = "#EB8292";
const INK = "#362A44";
const CHROME = "#E1E7F0";

const btn = (primary, disabled) => ({
  background: primary ? TEAL : "#fff",
  color: primary ? "#fff" : TEAL,
  border: `2px solid ${TEAL}`,
  borderRadius: 8,
  padding: "9px 16px",
  fontWeight: 700,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

const notice = (kind) => ({
  background: kind === "error" ? "#fdf2f2" : kind === "warn" ? "#fff7ed" : "#eef7f9",
  border: `1px solid ${kind === "error" ? "#f5c6c6" : kind === "warn" ? "#f5c842" : "#b9dde3"}`,
  color: kind === "error" ? "#c41e1e" : kind === "warn" ? "#7a4f00" : INK,
  borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12, lineHeight: 1.5,
});

export default function SocialPostingPanel() {
  const { user } = useAuth();
  const location = useLocation();
  const { loading, data, status, active, profilesPaid } = useSocialPosting();

  const params = new URLSearchParams(location.search);
  const justPaid = params.get("social") === "success";
  const justConnected = params.get("social") === "connected";
  const cancelled = params.get("social") === "cancelled";

  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [conn, setConn] = useState(null); // { profiles: [{ slot, created, connected: [] }] }
  const [gaveUp, setGaveUp] = useState(false);

  // Give the webhook ~40s after checkout before suggesting a refresh.
  useEffect(() => {
    if (!justPaid || active) return undefined;
    const t = setTimeout(() => setGaveUp(true), 40000);
    return () => clearTimeout(t);
  }, [justPaid, active]);

  const loadConnections = useCallback(async () => {
    if (!user) return;
    try {
      setConn(await callSocial("social-connect", user, { action: "status" }));
    } catch (err) {
      setError(err.message);
    }
  }, [user]);

  // Refresh connection state when the subscription becomes active, when the
  // paid-profile count changes, or when Upload-Post sends the user back.
  useEffect(() => {
    if (active) loadConnections();
  }, [active, profilesPaid, justConnected, loadConnections]);

  async function run(label, fn) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  const goTo = (url) => { window.location.href = url; };
  const subscribe = () => run("checkout", async () => goTo((await callSocial("social-billing", user, { action: "checkout", quantity: qty })).url));
  const portal = () => run("portal", async () => goTo((await callSocial("social-billing", user, { action: "portal" })).url));
  const connect = (slot) => run(`connect-${slot}`, async () => goTo((await callSocial("social-connect", user, { action: "connect", slot })).url));
  const addProfile = () => run("add", async () => {
    await callSocial("social-billing", user, { action: "add_profile" });
    setBusy(""); // webhook updates profilesPaid; the live listener re-renders
  });

  if (loading) return <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>;

  const renewal = data?.currentPeriodEnd?.toDate?.();
  const renewalText = renewal ? renewal.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <div>
      {error && <div style={notice("error")} role="alert">{error}</div>}

      {/* ── waiting on the webhook after Stripe redirect ── */}
      {justPaid && !active && (
        <div style={notice(gaveUp ? "warn" : "info")}>
          {gaveUp
            ? "Still waiting on confirmation of your payment. If you finished checkout, give it a minute and refresh this page — posting unlocks on its own once it's confirmed."
            : "⏳ Confirming your payment… posting unlocks automatically when it clears."}
        </div>
      )}
      {cancelled && !active && <div style={notice("info")}>Checkout was cancelled — nothing was charged.</div>}

      {/* ── not subscribed ── */}
      {!active && status !== "past_due" && (
        <div>
          <p style={{ fontSize: 14, color: INK, lineHeight: 1.6, marginTop: 0 }}>
            Send posts from Message Machine straight to your own accounts — post now or schedule for later.
            <strong> ${PRICE_PER_PROFILE} per profile per month</strong>, cancel any time.
          </p>
          <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
            A <em>profile</em> holds one account on each network (one Facebook, one X, one Threads, one Bluesky…).
            You only need more than one if you run two accounts on the same network.
            You sign in to each network on its own page — we never see your passwords.
          </p>
          {status === "canceled" && <div style={notice("info")}>Your previous subscription ended. You can start a new one below.</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" aria-label="Fewer profiles" disabled={busy || qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}
                style={{ width: 30, height: 30, borderRadius: 6, border: "1.5px solid #ccc", background: "#fff", fontSize: 16, cursor: busy || qty <= 1 ? "not-allowed" : "pointer" }}>−</button>
              <span style={{ minWidth: 28, textAlign: "center", fontWeight: 700 }}>{qty}</span>
              <button type="button" aria-label="More profiles" disabled={busy || qty >= MAX_PROFILES} onClick={() => setQty((q) => Math.min(MAX_PROFILES, q + 1))}
                style={{ width: 30, height: 30, borderRadius: 6, border: "1.5px solid #ccc", background: "#fff", fontSize: 16, cursor: busy || qty >= MAX_PROFILES ? "not-allowed" : "pointer" }}>+</button>
              <span style={{ fontSize: 13, color: "#888" }}>profile{qty > 1 ? "s" : ""} · ${qty * PRICE_PER_PROFILE}/month</span>
            </div>
            <button type="button" style={btn(true, !!busy)} disabled={!!busy} onClick={subscribe}>
              {busy === "checkout" ? "Opening checkout…" : "Subscribe"}
            </button>
          </div>
        </div>
      )}

      {/* ── payment problem ── */}
      {status === "past_due" && (
        <div>
          <div style={notice("warn")}>
            Your last payment didn't go through, so posting is paused. Update your card and it unlocks again automatically.
          </div>
          <button type="button" style={btn(true, !!busy)} disabled={!!busy} onClick={portal}>
            {busy === "portal" ? "Opening…" : "Update payment method"}
          </button>
        </div>
      )}

      {/* ── active ── */}
      {active && (
        <div>
          {data?.cancelAtPeriodEnd && (
            <div style={notice("warn")}>
              Your subscription is set to end{renewalText ? ` on ${renewalText}` : " at the end of this billing period"}. Posting keeps working until then.
            </div>
          )}
          {justConnected && <div style={notice("info")}>✓ Back from the connection page — your connected accounts are shown below.</div>}

          <div style={{ display: "grid", gap: 12 }}>
            {Array.from({ length: profilesPaid }, (_, slot) => {
              const p = conn?.profiles?.find((x) => x.slot === slot);
              const connected = p?.connected || [];
              return (
                <div key={slot} style={{ border: `1.5px solid ${CHROME}`, borderRadius: 10, padding: "14px 16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 800, color: PLUM, fontSize: 15 }}>Profile {slot + 1}</div>
                      <div style={{ fontSize: 13, color: "#777", marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {!conn ? "Checking…" : connected.length === 0
                          ? "No accounts connected yet"
                          : connected.map((k) => (
                              <span key={k} style={{ background: CHROME, color: INK, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{networkLabel(k)}</span>
                            ))}
                      </div>
                    </div>
                    <button type="button" style={btn(connected.length === 0, !!busy)} disabled={!!busy} onClick={() => connect(slot)}>
                      {busy === `connect-${slot}` ? "Opening…" : connected.length === 0 ? "Connect accounts" : "Manage connections"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 12.5, color: "#777", lineHeight: 1.6, margin: "14px 0" }}>
            From Message Machine you can currently send to <strong>Facebook, Threads, Bluesky and X</strong> (text posts).
            Instagram and TikTok need an image or video, which isn't supported yet.
            Note: X removes clickable links from posts unless the link add-on is enabled on the posting account.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {profilesPaid < MAX_PROFILES && !data?.cancelAtPeriodEnd && (
              <button type="button" style={btn(false, !!busy)} disabled={!!busy} onClick={addProfile}>
                {busy === "add" ? "Adding…" : `Add a profile (+$${PRICE_PER_PROFILE}/mo)`}
              </button>
            )}
            <button type="button" style={btn(false, !!busy)} disabled={!!busy} onClick={portal}>
              {busy === "portal" ? "Opening…" : "Manage billing / cancel"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#999", marginTop: 10 }}>
            {profilesPaid} profile{profilesPaid > 1 ? "s" : ""} · ${profilesPaid * PRICE_PER_PROFILE}/month{renewalText && !data?.cancelAtPeriodEnd ? ` · renews ${renewalText}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
