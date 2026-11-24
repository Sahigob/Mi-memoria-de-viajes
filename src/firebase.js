import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC4s-GNcFg1Zk2wDKAioR7XbK7HljfIo5Q",
  authDomain: "memoria-de-viaje.firebaseapp.com",
  projectId: "memoria-de-viaje",
  storageBucket: "memoria-de-viaje.firebasestorage.app",
  messagingSenderId: "751356712380",
  appId: "1:751356712380:web:4d035eb19eca7e0e53c7b9",
  measurementId: "G-7QSVC3ZQ81"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
auth.useDeviceLanguage();

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  collection,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
};
