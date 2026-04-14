import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Show / Hide Password ──────────────────────
const passwordInput = document.getElementById('password');
const eyeIcon       = document.getElementById('eyeIcon');
const toggleBtn     = document.getElementById('togglePassword');

toggleBtn.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  eyeIcon.className  = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

// ── Helpers ───────────────────────────────────
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

// ── Live Blur Validation ──────────────────────
document.getElementById('email').addEventListener('blur', () => {
  const val = document.getElementById('email').value.trim();
  if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    showError('email', 'emailError', 'Please enter a valid email address.');
  } else {
    document.getElementById('email').classList.remove('error');
    document.getElementById('emailError').textContent = '';
  }
});

// ── Login Submit ──────────────────────────────
document.getElementById('loginBtn').addEventListener('click', () => {
  clearErrors();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  let valid      = true;

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

  btn.disabled = true;
  text.textContent = 'Logging in...';
  icon.className = 'fa-solid fa-spinner fa-spin';

  signInWithEmailAndPassword(auth, email, password)
.then((userCredential) => {
  document.getElementById('loginSuccess').classList.add('visible');

  setTimeout(() => {
    window.location.href = "../dashboard.html";
  }, 1200);
})
  .catch((error) => {
    alert("Invalid login details");
  });
});