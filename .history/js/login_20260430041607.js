import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc,
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── SHOW / HIDE PASSWORD ──────────────────────
const passwordInput = document.getElementById('password');
const eyeIcon       = document.getElementById('eyeIcon');
const toggleBtn     = document.getElementById('togglePassword');

toggleBtn.addEventListener('click', () => {
  const isHidden    = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  eyeIcon.className  = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

// ── HELPERS ───────────────────────────────────
function showError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.classList.add('error');
  if (error) error.textContent = message;
}

function clearErrors() {
  ['email', 'password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('error');
  });
  ['emailError', 'passwordError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

// ── DETECT IF INPUT IS AN ACCOUNT ID ──────────
// Account ID is 8 alphanumeric characters e.g. O6JNRYEP
function isAccountId(val) {
  return /^[A-Z0-9]{8}$/i.test(val.trim());
}

// ── LOOK UP EMAIL FROM ACCOUNT ID ─────────────
async function getEmailByAccountId(accountId) {
  const upper = accountId.toUpperCase();

  // Try accountId field first
  const q1    = query(collection(db, "users"), where("accountId", "==", upper));
  const snap1 = await getDocs(q1);
  if (!snap1.empty) return snap1.docs[0].data().email || null;

  // Fallback: try referralCode field (some accounts may store it there)
  const q2    = query(collection(db, "users"), where("referralCode", "==", upper));
  const snap2 = await getDocs(q2);
  if (!snap2.empty) return snap2.docs[0].data().email || null;

  return null;
}

// ── LIVE BLUR VALIDATION ──────────────────────
document.getElementById('email').addEventListener('blur', () => {
  const val = document.getElementById('email').value.trim();
  if (!val) return;

  // Skip email format validation if it looks like an Account ID
  if (isAccountId(val)) {
    document.getElementById('email').classList.remove('error');
    document.getElementById('emailError').textContent = '';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    showError('email', 'emailError', 'Please enter a valid email address or Account ID.');
  } else {
    document.getElementById('email').classList.remove('error');
    document.getElementById('emailError').textContent = '';
  }
});

// ── LOGIN SUBMIT ──────────────────────────────
document.getElementById('loginBtn').addEventListener('click', async () => {
  clearErrors();

  const rawInput = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  let valid = true;

  if (!rawInput) {
    showError('email', 'emailError', 'Please enter your email address or Account ID.');
    valid = false;
  }

  if (!password || password.length < 6) {
    showError('password', 'passwordError', 'Please enter your password.');
    valid = false;
  }

  if (!valid) return;

  const btn  = document.getElementById('loginBtn');
  const text = document.getElementById('btnText');
  const icon = document.getElementById('btnIcon');

  btn.disabled     = true;
  text.textContent = 'Logging in...';
  icon.className   = 'fa-solid fa-spinner fa-spin';

  try {
    let emailToUse = rawInput;

    // If input is an Account ID, resolve it to an email first
    if (isAccountId(rawInput)) {
      text.textContent = 'Looking up account...';
      const found = await getEmailByAccountId(rawInput);
      if (!found) {
        showError('email', 'emailError', 'No account found with that Account ID.');
        btn.disabled     = false;
        text.textContent = 'Login to Account';
        icon.className   = 'fa-solid fa-arrow-right';
        return;
      }
      emailToUse = found;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawInput)) {
      showError('email', 'emailError', 'Please enter a valid email address or Account ID.');
      btn.disabled     = false;
      text.textContent = 'Login to Account';
      icon.className   = 'fa-solid fa-arrow-right';
      return;
    }

    text.textContent = 'Logging in...';
    const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
    const user = userCredential.user;

    sessionStorage.setItem("ymg_session", user.uid);

    document.getElementById('loginSuccess').classList.add('visible');
    setTimeout(() => {
      window.location.href = "../dashboard/dashboard.html";
    }, 1200);

  } catch (error) {
    btn.disabled     = false;
    text.textContent = 'Login to Account';
    icon.className   = 'fa-solid fa-arrow-right';

    if (
      error.code === "auth/user-not-found"    ||
      error.code === "auth/wrong-password"    ||
      error.code === "auth/invalid-credential"
    ) {
      showError('email',    'emailError',    'Incorrect Account ID/email or password.');
      showError('password', 'passwordError', '');
    } else if (error.code === "auth/too-many-requests") {
      showError('email', 'emailError', 'Too many failed attempts. Please try again later.');
    } else {
      showError('email', 'emailError', 'Login failed. Please try again.');
    }
  }
});

// ── GOOGLE LOGIN ──────────────────────────────
const googleBtn = document.getElementById("googleBtn");

googleBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();

  try {
    const result = await signInWithPopup(auth, provider);
    const user   = result.user;

    const userRef = doc(db, "users", user.uid);
    const snap    = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        name:      user.displayName,
        email:     user.email,
        balance:   0,
        createdAt: new Date()
      });
    }

    sessionStorage.setItem("ymg_session", user.uid);
    window.location.href = "../dashboard/dashboard.html";

  } catch (error) {
    console.error("Google login error:", error);
    alert(error.message);
  }
});

// ── FORGOT PASSWORD ────────────────────────────
document.getElementById("forgotPwBtn")?.addEventListener("click", async () => {
  const rawInput = document.getElementById("email").value.trim();
  const btn      = document.getElementById("forgotPwBtn");

  if (!rawInput) {
    showError("email", "emailError", "Enter your email address above first.");
    return;
  }

  // Account ID can't be used for password reset — need the actual email
  if (isAccountId(rawInput)) {
    showError("email", "emailError", "Please enter your email address to reset your password.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawInput)) {
    showError("email", "emailError", "Enter a valid email address to reset your password.");
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendPasswordResetEmail(auth, rawInput);
    const msg = document.getElementById("forgotMsg");
    if (msg) {
      msg.textContent   = `Reset link sent to ${rawInput}. Check your inbox.`;
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 5000);
    } else {
      alert(`Reset link sent to ${rawInput}. Check your inbox.`);
    }
  } catch (err) {
    console.error(err);
    if (err.code === "auth/user-not-found") {
      showError("email", "emailError", "No account found with this email.");
    } else {
      showError("email", "emailError", "Failed to send reset email. Try again.");
    }
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Forgot Password?';
});