// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDoCaH9dQ3o3eQyWRR_VZgo_YlQzxyjfqg",
  authDomain: "ymgfunds-1030d.firebaseapp.com",
  projectId: "ymgfunds-1030d",
  storageBucket: "ymgfunds-1030d.firebasestorage.app",
  messagingSenderId: "619265881884",
  appId: "1:619265881884:web:ef163c4e65b564e3b82cd9",
  measurementId: "G-RBDLWRTK8L"
};

const app = initializeApp(firebaseConfig);

// Services
export const auth = getAuth(app);
export const db = getFirestore(app);