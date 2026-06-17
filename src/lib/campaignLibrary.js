import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

const COL = "saved_campaigns";

// Save any campaign — pass tool name + whatever data you want stored
export async function saveCampaign(tool, data) {
  const u = auth.currentUser;
  const savedBy = u ? { uid: u.uid, displayName: u.displayName || null, email: u.email || null } : null;
  const docRef = await addDoc(collection(db, COL), {
    tool,
    ...data,
    savedBy,
    savedAt: serverTimestamp(),
  });
  return docRef.id;
}

// Load all campaigns, newest first
export async function loadAllCampaigns() {
  const q = query(collection(db, COL), orderBy("savedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Delete one campaign by Firestore doc ID
export async function deleteCampaign(id) {
  await deleteDoc(doc(db, COL, id));
}
