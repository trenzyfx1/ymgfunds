import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ── HELPERS ──────────────────────────────────
function generateReferralCode(uid) {
  return "YMG-" + uid.slice(0, 6).toUpperCase();
}

function getReferralFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || null;
}


// ── PASSWORD TOGGLE ──────────────────────────
function togglePasswordVisibility(inputId, iconId, btnId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  const btn = document.getElementById(btnId);

  if (!input || !icon || !btn) return;

  btn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.className = isHidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  });
}

togglePasswordVisibility("password", "eyeIcon", "togglePassword");
togglePasswordVisibility("confirmPassword", "eyeIconConfirm", "toggleConfirm");


// ── VALIDATION ───────────────────────────────
function showError(fieldId, errorId, message) {
  document.getElementById(fieldId)?.classList.add("error");
  document.getElementById(errorId).textContent = message;
}

function clearAll() {
  ["fullName", "email", "phone", "password", "confirmPassword"].forEach(id => {
    document.getElementById(id)?.classList.remove("error");
  });

  ["nameError", "emailError", "phoneError", "passwordError", "confirmError", "termsError"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "";
    });
}


// ── REFERRAL HANDLER (CENTRALIZED) ───────────
async function handleReferral(referredBy, newUser) {
  if (!referredBy) return;

  try {
    const q = query(
      collection(db, "users"),
      where("referralCode", "==", referredBy)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      console.warn("❌ Invalid referral code");
      return;
    }

    const referrerDoc = snap.docs[0];
    const referrerId = referrerDoc.id;

    // 🚫 Prevent self-referral
    if (referrerId === newUser.uid) {
      console.warn("❌ User cannot refer themselves");
      return;
    }

    // ✅ Increment referral count
    await updateDoc(doc(db, "users", referrerId), {
      referralCount: increment(1)
    });

    // ✅ Add referral record
    await addDoc(collection(db, "users", referrerId, "referrals"), {
      name: newUser.displayName || "User",
      userId: newUser.uid,
      status: "pending",
      amountEarned: 0,
      createdAt: serverTimestamp()
    });

    console.log("✅ Referral successfully recorded");

  } catch (err) {
    console.error("❌ Referral error:", err);
  }
}


// ── MAIN SIGNUP ──────────────────────────────
document.getElementById("createBtn").addEventListener("click", async () => {
  clearAll();

  const name = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const pw = document.getElementById("password").value;
  const cpw = document.getElementById("confirmPassword").value;
  const terms = document.getElementById("agreeTerms").checked;

  let valid = true;

  if (name.length < 2) { showError("fullName", "nameError", "Enter your full name"); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError("email", "emailError", "Enter valid email"); valid = false; }
  if (phone.length < 7) { showError("phone", "phoneError", "Enter valid phone"); valid = false; }
  if (pw.length < 8) { showError("password", "passwordError", "Min 8 characters"); valid = false; }
  if (pw !== cpw) { showError("confirmPassword", "confirmError", "Passwords don’t match"); valid = false; }
  if (!terms) { document.getElementById("termsError").textContent = "Agree to continue"; valid = false; }

  if (!valid) return;

  const btn = document.getElementById("createBtn");
  const text = document.getElementById("btnText");
  const icon = document.getElementById("btnIcon");

  btn.disabled = true;
  text.textContent = "Creating account...";
  icon.className = "fa-solid fa-spinner fa-spin";

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pw);
    const user = userCredential.user;

    const refCode = generateReferralCode(user.uid);
    const referredBy = getReferralFromURL();

    // ✅ Save user
    await setDoc(doc(db, "users", user.uid), {
      name,
      email,
      phone,
      balance: 0,

      referralCode: refCode,
      referralCount: 0,
      referralEarnings: 0,
      referredBy: referredBy || null,

      phoneVerified: false,
      createdAt: serverTimestamp()
    });

    console.log("✅ User saved");

    // 🔥 Handle referral (CLEAN)
    await handleReferral(referredBy, user);

    // SUCCESS UI
    btn.style.display = "none";
    document.getElementById("formSuccess").classList.add("visible");

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);

  } catch (err) {
    console.error("❌ Signup error:", err);
    alert(err.message);

    btn.disabled = false;
    text.textContent = "Create Account";
    icon.className = "fa-solid fa-arrow-right";
  }
});


// ── GOOGLE SIGNUP ────────────────────────────
const googleBtn = document.getElementById("googleBtn");

googleBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const refCode = generateReferralCode(user.uid);
    const referredBy = getReferralFromURL();

    await setDoc(doc(db, "users", user.uid), {
      name: user.displayName,
      email: user.email,
      balance: 0,

      referralCode: refCode,
      referralCount: 0,
      referralEarnings: 0,
      referredBy: referredBy || null,

      phoneVerified: false,
      createdAt: serverTimestamp()
    }, { merge: true });

    // 🔥 SAME CLEAN HANDLER
    await handleReferral(referredBy, user);

    window.location.href = "../dashboard/dashboard.html";

  } catch (error) {
    console.error("❌ Google error:", error);
    alert(error.message);
  }
});