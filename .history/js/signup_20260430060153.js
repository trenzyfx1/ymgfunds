import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, collection, query, where,
  getDocs, updateDoc, addDoc, increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function generateReferralCode(uid) {
  return "YMG-" + uid.slice(0, 6).toUpperCase();
}

function getReferralCode() {
  const params  = new URLSearchParams(window.location.search);
  const fromURL = params.get("ref");
  if (fromURL) return fromURL.trim();
  const inputEl = document.getElementById("referral");
  if (inputEl && inputEl.value.trim() && !inputEl.value.trim().startsWith("YMGP-"))
    return inputEl.value.trim();
  return null;
}

function getPremiumReferralCode() {
  const params  = new URLSearchParams(window.location.search);
  const fromURL = params.get("pref");
  if (fromURL) return fromURL.trim();
  const inputEl = document.getElementById("referral");
  if (inputEl && inputEl.value.trim().startsWith("YMGP-"))
    return inputEl.value.trim();
  return null;
}

function togglePasswordVisibility(inputId, iconId, btnId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  const btn   = document.getElementById(btnId);
  if (!input || !icon || !btn) return;
  btn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type     = isHidden ? "text" : "password";
    icon.className = isHidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  });
}

togglePasswordVisibility("password",       "eyeIcon",        "togglePassword");
togglePasswordVisibility("confirmPassword", "eyeIconConfirm", "toggleConfirm");

const passwordInput = document.getElementById("password");
const strengthWrap  = document.getElementById("passwordStrength");
const strengthLabel = document.getElementById("strengthLabel");
const bars = [
  document.getElementById("bar1"),
  document.getElementById("bar2"),
  document.getElementById("bar3"),
  document.getElementById("bar4")
];
const hintLength = document.getElementById("hintLength");
const hintLetter = document.getElementById("hintLetter");
const hintNumber = document.getElementById("hintNumber");

function checkStrength(val) {
  const hasLength  = val.length >= 8;
  const hasLetter  = /[a-zA-Z]/.test(val);
  const hasNumber  = /[0-9]/.test(val);
  const hasSpecial = /[^a-zA-Z0-9]/.test(val);

  if (hintLength) hintLength.className = "hint" + (hasLength  ? " met" : "");
  if (hintLetter) hintLetter.className = "hint" + (hasLetter  ? " met" : "");
  if (hintNumber) hintNumber.className = "hint" + (hasNumber  ? " met" : "");

  let score = 0;
  if (hasLength)  score++;
  if (hasLetter)  score++;
  if (hasNumber)  score++;
  if (hasSpecial) score++;

  const labels = ["Weak", "Fair", "Good", "Strong"];
  const colors = ["weak", "fair", "good", "strong"];

  bars.forEach((bar, i) => {
    if (bar) bar.className = "bar" + (i < score ? ` ${colors[score - 1]}` : "");
  });

  if (strengthLabel) {
    strengthLabel.textContent = val.length === 0 ? "Enter a password" : (labels[score - 1] || "Weak");
  }
}

if (passwordInput) {
  passwordInput.addEventListener("input", () => {
    if (passwordInput.value.length > 0) strengthWrap?.classList.add("visible");
    else strengthWrap?.classList.remove("visible");
    checkStrength(passwordInput.value);
  });
}

function showError(fieldId, errorId, message) {
  document.getElementById(fieldId)?.classList.add("error");
  const el = document.getElementById(errorId);
  if (el) el.textContent = message;
}

function clearAll() {
  ["fullName", "email", "phone", "password", "confirmPassword"].forEach(id => {
    document.getElementById(id)?.classList.remove("error", "valid");
  });
  ["nameError", "emailError", "phoneError", "passwordError", "confirmError", "termsError"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  const refErrEl = document.getElementById("referralError");
  if (refErrEl) refErrEl.textContent = "";
  const refInp = document.getElementById("referral");
  if (refInp) { refInp.style.borderColor = ""; refInp.style.boxShadow = ""; }
}

// ── REFERRAL CODE FORMAT VALIDATION ───────────
// Only checks format — NO Firestore query (user not logged in yet)
// Wrong codes are caught at deposit time instead
function validateReferralFormat(refVal) {
  if (!refVal) return true; // empty is fine
  const isNormal  = /^YMG-[A-Z0-9]{6}$/.test(refVal);
  const isPremium = /^YMGP-[A-Z0-9]{6}$/.test(refVal);
  return isNormal || isPremium;
}

// ── REFERRAL HANDLER ──────────────────────────
// Runs AFTER user is created and logged in — safe to query Firestore
async function handleReferral(referredBy, newUser, userName) {
  if (!referredBy) return;
  try {
    const q    = query(collection(db, "users"), where("referralCode", "==", referredBy));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const referrerDoc = snap.docs[0];
    const referrerId  = referrerDoc.id;
    if (referrerId === newUser.uid) return;

    await updateDoc(doc(db, "users", referrerId), {
      referralCount: increment(1)
    });

    await addDoc(collection(db, "users", referrerId, "referrals"), {
      name:         userName || "User",
      userId:       newUser.uid,
      status:       "pending",
      amountEarned: 0,
      createdAt:    serverTimestamp()
    });
  } catch (err) {
    console.error("Referral handler error:", err);
  }

  // After handleReferral call in the main signup flow:
if (premRefBy) {
  try {
    const pq   = query(collection(db, "users"), where("premiumReferralCode", "==", premRefBy));
    const psnap = await getDocs(pq);
    if (!psnap.empty) {
      await updateDoc(doc(db, "users", psnap.docs[0].id), {
        premiumReferralCount: increment(1)
      });
    }
  } catch (err) {
    console.error("Premium referral count error:", err);
  }
}
}

// ── MAIN SIGNUP ───────────────────────────────
document.getElementById("createBtn").addEventListener("click", async () => {
  clearAll();

  const name  = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const pw    = document.getElementById("password").value;
  const cpw   = document.getElementById("confirmPassword").value;
  const terms = document.getElementById("agreeTerms").checked;

  // ── Basic field validation ─────────────────
  let valid = true;
  if (name.length < 2)                             { showError("fullName",        "nameError",     "Enter your full name");   valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))  { showError("email",           "emailError",    "Enter valid email");      valid = false; }
  if (phone.length < 7)                            { showError("phone",           "phoneError",    "Enter valid phone");      valid = false; }
  if (pw.length < 8)                               { showError("password",        "passwordError", "Min 8 characters");       valid = false; }
  if (pw !== cpw)                                  { showError("confirmPassword", "confirmError",  "Passwords don't match");  valid = false; }
  if (!terms)                                      { document.getElementById("termsError").textContent = "Agree to continue"; valid = false; }
  if (!valid) return;

  // ── Referral code format check only ────────
  const refInput = document.getElementById("referral");
  const refVal   = refInput ? refInput.value.trim() : "";

  if (refVal && !validateReferralFormat(refVal)) {
    const refErrEl = document.getElementById("referralError");
    if (refErrEl) refErrEl.textContent = "Invalid referral code format. Should be YMG-XXXXXX or YMGP-XXXXXX.";
    if (refInput) {
      refInput.style.borderColor = "#dc2626";
      refInput.style.boxShadow   = "0 0 0 3px rgba(220,38,38,0.1)";
    }
    return;
  }

  // ── Proceed with signup ────────────────────
  const btn  = document.getElementById("createBtn");
  const text = document.getElementById("btnText");
  const icon = document.getElementById("btnIcon");

  btn.disabled     = true;
  text.textContent = "Creating account...";
  icon.className   = "fa-solid fa-spinner fa-spin";

  try {
    // 1. Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, pw);
    const user           = userCredential.user;

    const refCode  = generateReferralCode(user.uid);
    const refBy    = getReferralCode();
    const premRefBy = getPremiumReferralCode();

    // 2. Save user document to Firestore
    await setDoc(doc(db, "users", user.uid), {
      name,
      email,
      phone,
      balance:                 0,
      invested:                0,
      profit:                  0,
      activePlans:             0,
      referralCode:            refCode,
      referralCount:           0,
      referralEarnings:        0,
      referredBy:              refBy     || null,
      referralRewarded:        false,
      premiumReferredBy:       premRefBy || null,
      premiumRefRewarded:      false,
      phoneVerified:           false,
      createdAt:               serverTimestamp()
    });

    // 3. Handle referral AFTER user is saved (now authenticated)
    await handleReferral(refBy, user, name);

    // 4. Show success
    btn.style.display = "none";
    document.getElementById("formSuccess").classList.add("visible");

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);

  } catch (err) {
    console.error("Signup error:", err);

    if (err.code === "auth/email-already-in-use") {
      showError("email", "emailError", "An account with this email already exists.");
    } else if (err.code === "auth/weak-password") {
      showError("password", "passwordError", "Password is too weak. Use at least 8 characters.");
    } else {
      showError("email", "emailError", "Signup failed. Please try again.");
    }

    btn.disabled     = false;
    text.textContent = "Create Account";
    icon.className   = "fa-solid fa-arrow-right";
  }
});

// ── GOOGLE SIGNUP ─────────────────────────────
const googleBtn = document.getElementById("googleBtn");
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result    = await signInWithPopup(auth, provider);
      const user      = result.user;
      const refCode   = generateReferralCode(user.uid);
      const refBy     = getReferralCode();
      const premRefBy = getPremiumReferralCode();

      await setDoc(doc(db, "users", user.uid), {
        name:               user.displayName,
        email:              user.email,
        balance:            0,
        invested:           0,
        profit:             0,
        activePlans:        0,
        referralCode:       refCode,
        referralCount:      0,
        referralEarnings:   0,
        referredBy:         refBy     || null,
        referralRewarded:   false,
        premiumReferredBy:  premRefBy || null,
        premiumRefRewarded: false,
        phoneVerified:      false,
        createdAt:          serverTimestamp()
      }, { merge: true });

      await handleReferral(refBy, user, user.displayName);

      window.location.href = "../dashboard/dashboard.html";

    } catch (error) {
      console.error("Google error:", error);
      alert(error.message);
    }
  });
}