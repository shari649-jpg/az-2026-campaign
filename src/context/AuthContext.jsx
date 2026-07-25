import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Firebase Auth user
  const [profile, setProfile] = useState(null); // Firestore user doc (includes role)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch role + profile from Firestore
        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          const profileData = snap.exists() ? snap.data() : null;
          setProfile(profileData);

          // The welcome email used to be sent at account-registration time,
          // before the person had clicked Firebase's own verification link —
          // so it invited them in ("Open the Comms Hub") while AuthGuard was
          // simultaneously blocking every route until verification actually
          // succeeded. It now fires here instead, the first time we observe
          // Firebase reporting emailVerified: true for an account whose
          // Firestore doc hasn't already recorded that. The Firestore flag
          // is updated in the same step so this can only ever fire once per
          // account, regardless of how many times they load the app or which
          // device they verify from.
          if (
            firebaseUser.emailVerified &&
            profileData &&
            profileData.emailVerified === false
          ) {
            try {
              await updateDoc(doc(db, "users", firebaseUser.uid), { emailVerified: true });
              setProfile(p => p ? { ...p, emailVerified: true } : p);
            } catch {}
            try {
              const idToken = await firebaseUser.getIdToken();
              await fetch("/.netlify/functions/send-welcome", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  fullName: profileData.fullName || firebaseUser.displayName || "",
                }),
              });
            } catch {}
          }
        } catch {
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = () => signOut(auth);

  // Re-pulls the Firestore user doc for whoever is currently signed in.
  // Added for the Profile page (Handoff #16 punch list): editing your own
  // name/handles/org there writes straight to Firestore, but this context's
  // `profile` was otherwise only ever populated once, at sign-in, via
  // onAuthStateChanged above — without this, a saved edit wouldn't show up
  // in the nav bar's avatar/initials/display name until the next full
  // sign-in. Exposed so any component can call it after a Firestore write
  // to its own user doc.
  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
      setProfile(snap.exists() ? snap.data() : null);
    } catch {}
  }, []);

  const role = profile?.role ?? "user";
  const isManager = role === "manager" || role === "administrator";
  const isAdmin = role === "administrator";

  return (
    <AuthContext.Provider value={{ user, profile, role, isManager, isAdmin, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
