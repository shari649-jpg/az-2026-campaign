import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../firebase";
import { useState, useEffect, useRef } from "react";

// Same three packs as create-checkout-session.mjs / stripe-webhook.mjs —
// display copy only, the server independently re-derives price/credits
// from packId and never trusts anything the client sends about cost.
const CREDIT_PACKS = [
  { id: "starter",  name: "Starter",  credits: 500,  price: "$20" },
  { id: "standard", name: "Standard", credits: 2000, price: "$70" },
  { id: "value",    name: "Value",    credits: 5000, price: "$150" },
];

// Shown when profile.requiresPurchase is true — set by provision-account.mjs
// on a brand-new individual signup, or by manage-user.mjs's "reactivate
// without an org" action. Same flag, same screen, either way — see
// stripe-webhook.mjs's header on why these two cases share one gate.
//
// requiresPurchase is cleared by stripe-webhook.mjs, server-side, once a
// real Checkout Session completes — nothing client-side ever sets it to
// false directly. Since AuthContext's `profile` is a one-time fetch (not
// a live Firestore listener — confirmed by reading AuthContext.jsx before
// building this), this component has to actively poll refreshProfile()
// after returning from Stripe rather than assume the redirect alone means
// payment is confirmed; Stripe's webhook is asynchronous and can genuinely
// land after the browser is already back on this page.
function PurchaseRequiredScreen() {
  const { user, refreshProfile } = useAuth();
  const location = useLocation();
  const [purchasingPackId, setPurchasingPackId] = useState(null);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const [pollGaveUp, setPollGaveUp] = useState(false);
  const pollAttempts = useRef(0);

  const params = new URLSearchParams(location.search);
  const justSucceeded = params.get("purchase") === "success";
  const justCancelled = params.get("purchase") === "cancelled";

  useEffect(() => {
    if (!justSucceeded) return;
    setPolling(true);
    pollAttempts.current = 0;
    const interval = setInterval(async () => {
      pollAttempts.current += 1;
      await refreshProfile();
      // Note: this component only re-renders past this point once the
      // OUTER AuthGuard's own profile?.requiresPurchase check (not this
      // component) sees the update and stops rendering this screen at
      // all — refreshProfile() updates the same context state AuthGuard
      // reads from, so success here means this whole component unmounts
      // on the next render, not that anything needs to happen locally.
      if (pollAttempts.current >= 15) { // ~30s at 2s intervals
        clearInterval(interval);
        setPolling(false);
        setPollGaveUp(true);
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSucceeded]);

  async function handlePurchase(packId) {
    setPurchasingPackId(packId);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, packId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Couldn't start checkout.");
      }
      window.location.href = data.url; // full redirect to Stripe's hosted page
    } catch (err) {
      setError(err.message);
      setPurchasingPackId(null);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--teal)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 20px", fontFamily: "var(--font-body)",
    }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
      </div>

      <div style={{
        background: "#fff", borderRadius: 16, padding: "40px 36px",
        width: "100%", maxWidth: 520,
        boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
        textAlign: "center",
      }}>
        {polling ? (
          <>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⏳</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 10, marginTop: 0 }}>
              Confirming your payment…
            </h2>
            <p style={{ fontSize: 15, color: "var(--charcoal)", lineHeight: 1.7 }}>
              This usually takes just a few seconds. Hang tight — this page will continue automatically.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔓</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 10, marginTop: 0 }}>
              One step left — add credits
            </h2>
            <p style={{ fontSize: 15, color: "var(--charcoal)", lineHeight: 1.7, marginBottom: 8 }}>
              Individual accounts purchase credits directly — no subscription, use them whenever.
            </p>
            {pollGaveUp && (
              <div style={{ background: "#fff7ed", border: "1px solid #f5c842", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#7a4f00", marginBottom: 16, textAlign: "left" }}>
                Still waiting on confirmation from your bank/card — this can occasionally take a bit longer.
                If you already completed checkout, wait a moment and refresh this page. If you're stuck, contact{" "}
                <a href="mailto:info@arizonacoalition.net" style={{ color: "#7a4f00", fontWeight: 700 }}>info@arizonacoalition.net</a>.
              </div>
            )}
            {justCancelled && !pollGaveUp && (
              <p style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>Checkout was cancelled — pick a pack below to try again.</p>
            )}
            {error && (
              <div style={{ background: "#fdf2f2", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e", marginBottom: 16, textAlign: "left" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20, marginBottom: 20 }}>
              {CREDIT_PACKS.map(pack => (
                <button
                  key={pack.id}
                  onClick={() => handlePurchase(pack.id)}
                  disabled={purchasingPackId !== null}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 18px", borderRadius: 10,
                    border: "2px solid var(--teal)",
                    background: purchasingPackId === pack.id ? "var(--teal)" : "#fff",
                    color: purchasingPackId === pack.id ? "#fff" : "var(--teal)",
                    cursor: purchasingPackId !== null ? "not-allowed" : "pointer",
                    opacity: purchasingPackId !== null && purchasingPackId !== pack.id ? 0.5 : 1,
                    fontFamily: "inherit", textAlign: "left",
                  }}
                >
                  <span>
                    <strong style={{ fontSize: 15 }}>{pack.name}</strong>
                    <span style={{ display: "block", fontSize: 13, opacity: 0.85 }}>{pack.credits.toLocaleString()} credits</span>
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>
                    {purchasingPackId === pack.id ? "…" : pack.price}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ paddingTop: 16, borderTop: "1px solid #eee" }}>
              <p style={{ fontSize: 12.5, color: "#999", marginBottom: 12 }}>
                Something wrong with your account — like a mistyped email? Contact{" "}
                <a href="mailto:info@arizonacoalition.net" style={{ color: "#999", fontWeight: 700 }}>info@arizonacoalition.net</a>{" "}
                and an Administrator can fix it.
              </p>
              <button
                onClick={() => auth.signOut()}
                style={{ background: "none", border: "none", color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthGuard({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [resending, setResending]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendDone, setResendDone]     = useState(false);
  const [resendError, setResendError]   = useState("");

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Shared account-age calculation — used by both grace periods below.
  const createdAt = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime)
    : new Date();

  // Defense-in-depth alongside the firestore.rules fix on users/{uid}'s
  // create rule: a signed-in Firebase Auth user with no Firestore profile
  // doc is exactly the shape a bypass attempt (or a broken registration
  // that failed partway through) would produce. Previously this component
  // never checked profile existence at all — it only checked `user` and
  // emailVerified — so a request that got this far would have reached
  // every non-role-gated tool with zero enforcement at this layer.
  //
  // Grace period, same pattern as the emailVerified check below: this app
  // has been through several account-creation eras (no login → simple
  // login → Google sign-in → full waitlist/invite registration), and
  // earlier eras didn't necessarily produce the same Firestore profile
  // shape this check now expects. Rather than assume every existing
  // account has a matching profile doc, accounts created before this fix
  // shipped are grandfathered through entirely — this check only applies
  // going forward, to accounts created from this date on, which is what
  // actually matters for closing the invite-bypass gap (a newly-created
  // rogue account necessarily has a creation time after today).
  const profileRequiredCutoff = new Date("2026-07-25T00:00:00Z");
  const predatesProfileRequirement = createdAt < profileRequiredCutoff;

  if (!profile && !predatesProfileRequirement) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--teal)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 20px", fontFamily: "var(--font-body)", textAlign: "center",
      }}>
        <div style={{
          background: "#fff", borderRadius: 16, padding: "40px 36px",
          width: "100%", maxWidth: 440, boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 10, marginTop: 0 }}>
            Account setup incomplete
          </h2>
          <p style={{ fontSize: 15, color: "var(--charcoal)", lineHeight: 1.7, marginBottom: 24 }}>
            We couldn't find a profile for this account. If you just registered, contact{" "}
            <a href="mailto:info@arizonacoalition.net" style={{ color: "var(--teal)" }}>info@arizonacoalition.net</a>{" "}
            for help.
          </p>
          <button
            onClick={() => auth.signOut()}
            style={{
              background: "none", border: "2px solid var(--teal)", color: "var(--teal)",
              borderRadius: 8, padding: "11px 24px", fontSize: 14, fontWeight: 700,
              fontFamily: "var(--font-body)", cursor: "pointer", width: "100%",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Block access until email is verified.
  // Grace period: accounts created before June 14 2026 (existing members) are let through.
  // Google Sign-In users are always pre-verified by Google.
  const graceCutoff = new Date("2026-06-14T00:00:00Z");
  const isExistingUser = createdAt < graceCutoff;

  if (!user.emailVerified && !isExistingUser) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--teal)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 20px",
        fontFamily: "var(--font-body)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/azc-logo-teal.png" alt="Arizona Coalition" style={{ height: 64, marginBottom: 12 }} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#fff", letterSpacing: "-0.01em" }}>Arizona Coalition</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#F5C842", marginTop: 4 }}>
            Comms Hub · 2026
          </div>
        </div>

        <div style={{
          background: "#fff", borderRadius: 16, padding: "40px 36px",
          width: "100%", maxWidth: 440,
          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--teal)", marginBottom: 10, marginTop: 0 }}>
            Verify your email
          </h2>
          <p style={{ fontSize: 15, color: "var(--charcoal)", lineHeight: 1.7, marginBottom: 8 }}>
            A verification link was sent to <strong>{user.email}</strong>.
          </p>
          <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, marginBottom: 24 }}>
            Click the link in that email to activate your account. Check your spam folder if you don't see it.
          </p>

          {resendDone && (
            <div style={{ background: "#f0faf5", border: "1px solid #a8dfc0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1a6640", marginBottom: 16 }}>
              ✓ Verification email resent!
            </div>
          )}

          {resendError && (
            <div style={{ background: "#fdf2f2", border: "1px solid #f5c6c6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e", marginBottom: 16 }}>
              {resendError}
            </div>
          )}

          <button
            onClick={async () => {
              if (resending || resendCooldown > 0) return;
              setResending(true);
              setResendError("");
              try {
                await sendEmailVerification(auth.currentUser);
                setResendDone(true);
                setResendCooldown(60);
                const t = setInterval(() => {
                  setResendCooldown(c => {
                    if (c <= 1) { clearInterval(t); return 0; }
                    return c - 1;
                  });
                }, 1000);
              } catch (err) {
                // Firebase itself rate-limits this call server-side, separate
                // from our own 60s client-side cooldown — clicking resend
                // several times in a row can trip Firebase's own throttle.
                // That used to fail silently here, leaving the button reset
                // with no feedback and no way to tell whether anything was
                // actually sent. Surface it instead.
                setResendError(
                  err?.code === "auth/too-many-requests"
                    ? "Too many requests — please wait a few minutes before trying again, or check spam for an earlier email."
                    : "Couldn't resend the email right now. Please try again in a moment, or contact info@arizonacoalition.net for help."
                );
              }
              setResending(false);
            }}
            disabled={resending || resendCooldown > 0}
            style={{
              background: "none", border: "2px solid var(--teal)", color: "var(--teal)",
              borderRadius: 8, padding: "11px 24px", fontSize: 14, fontWeight: 700,
              fontFamily: "var(--font-body)",
              cursor: (resending || resendCooldown > 0) ? "not-allowed" : "pointer",
              opacity: (resending || resendCooldown > 0) ? 0.6 : 1,
              marginBottom: 20, width: "100%",
            }}
          >
            {resending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
          </button>

          <p style={{ fontSize: 13, color: "#aaa" }}>
            Once verified,{" "}
            <button
              onClick={() => window.location.reload()}
              style={{ background: "none", border: "none", color: "var(--teal)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
            >
              click here to continue
            </button>
            .
          </p>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eee" }}>
            <button
              onClick={() => { auth.signOut(); }}
              style={{ background: "none", border: "none", color: "#aaa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Blocks the whole app, not just AI-tool usage, until a real Stripe
  // purchase lands — deliberately placed AFTER email verification (confirm
  // who someone is before asking them to pay) and applies to both a
  // brand-new individual signup and an Admin-reactivated-without-an-org
  // account identically; see PurchaseRequiredScreen's header comment.
  if (profile?.requiresPurchase) {
    return <PurchaseRequiredScreen />;
  }

  return children;
}
