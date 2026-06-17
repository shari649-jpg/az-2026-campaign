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

const COL = "saved_articles";

// Save a Rapid Response article
export async function saveArticle(data) {
  const u = auth.currentUser;
  const savedBy = u ? { uid: u.uid, displayName: u.displayName || null, email: u.email || null } : null;
  const docRef = await addDoc(collection(db, COL), {
    ...data,
    savedBy,
    savedAt: serverTimestamp(),
  });
  return docRef.id;
}

// Load all articles, newest first
export async function loadArticles() {
  const q = query(collection(db, COL), orderBy("savedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Delete one article by Firestore doc ID
export async function deleteArticle(id) {
  await deleteDoc(doc(db, COL, id));
}
