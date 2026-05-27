import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA5dpbMc_xwpa9YPUjZV0Fvq1L8zm-k1mA",
  authDomain: "az-coalition-socials.firebaseapp.com",
  projectId: "az-coalition-socials",
  storageBucket: "az-coalition-socials.firebasestorage.app",
  messagingSenderId: "508190384448",
  appId: "1:508190384448:web:731e1da4f6de0e0ac6daa5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
