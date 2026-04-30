//DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG FUNDS. ALL RIGHTS RESERVED.
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const passwordInput = document.getElementById('password');
const eyeIcon       = document.getElementById('eyeIcon');
const toggleBtn     = document.getElementById('togglePassword');

toggleBtn.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  eyeIcon.className  = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

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

document.getElementById('email').addEventListener('blur', () => {
  const val = document.getElementById('email').value.trim();
  if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    showError('email', 'emailError', 'Please enter a valid email address.');
  } else {
    document.getElementById('email').classList.remove('error');
    document.getElementById('emailError').textContent = '';
  }
});

document.getElementById('loginBtn').addEventListener('click', () => {
  clearErrors();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  let valid = true;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('email', 'emailError', 'Please enter a valid email address.');
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

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;

      sessionStorage.setItem("ymg_session", user.uid);

      document.getElementById('loginSuccess').classList.add('visible');

      setTimeout(() => {
        window.location.href = "../dashboard/dashboard.html";
      }, 1200);
    })
    .catch((error) => {
      btn.disabled     = false;
      text.textContent = 'Login to Account';
      icon.className   = 'fa-solid fa-arrow-right';

      showError('email',    'emailError',    'Invalid email or password.');
      showError('password', 'passwordError', '');
    });
});

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

document.getElementById("forgotPwBtn")?.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const btn   = document.getElementById("forgotPwBtn");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("email", "emailError", "Enter your email address above first.");
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendPasswordResetEmail(auth, email);
    const msg = document.getElementById("forgotMsg");
    if (msg) {
      msg.textContent = `Reset link sent to ${email}. Check your inbox.`;
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 5000);
    } else {
      alert(`Reset link sent to ${email}. Check your inbox.`);
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