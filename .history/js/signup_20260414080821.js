import { auth, db } from "./dashboard/js/firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Show / Hide Password ──────────────────────
function togglePasswordVisibility(inputId, iconId, btnId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  const btn = document.getElementById(btnId);

  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });
}

togglePasswordVisibility('password', 'eyeIcon', 'togglePassword');
togglePasswordVisibility('confirmPassword', 'eyeIconConfirm', 'toggleConfirm');

// ── Password Strength ─────────────────────────
const passwordInput = document.getElementById('password');
const strengthWrap = document.getElementById('passwordStrength');
const strengthLabel = document.getElementById('strengthLabel');
const bars = [
  document.getElementById('bar1'),
  document.getElementById('bar2'),
  document.getElementById('bar3'),
  document.getElementById('bar4')
];

const hintLength = document.getElementById('hintLength');
const hintLetter = document.getElementById('hintLetter');
const hintNumber = document.getElementById('hintNumber');

function checkStrength(val) {
  const hasLength = val.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(val);
  const hasNumber = /[0-9]/.test(val);
  const hasSpecial = /[^a-zA-Z0-9]/.test(val);

  hintLength.className = 'hint' + (hasLength ? ' met' : '');
  hintLetter.className = 'hint' + (hasLetter ? ' met' : '');
  hintNumber.className = 'hint' + (hasNumber ? ' met' : '');

  let score = 0;
  if (hasLength) score++;
  if (hasLetter) score++;
  if (hasNumber) score++;
  if (hasSpecial) score++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['weak', 'fair', 'good', 'strong'];

  bars.forEach((bar, i) => {
    bar.className = 'bar' + (i < score ? ` ${colors[score - 1]}` : '');
  });

  strengthLabel.textContent = val.length === 0 ? 'Enter a password' : labels[score - 1] || 'Weak';
}

passwordInput.addEventListener('input', () => {
  if (passwordInput.value.length > 0) {
    strengthWrap.classList.add('visible');
  } else {
    strengthWrap.classList.remove('visible');
  }
  checkStrength(passwordInput.value);
});

// ── Validation Helpers ─────────────────────────
function showError(fieldId, errorId, message) {
  document.getElementById(fieldId).classList.add('error');
  document.getElementById(errorId).textContent = message;
}

function clearAll() {
  ['fullName', 'email', 'phone', 'password', 'confirmPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('error', 'valid');
  });

  ['nameError', 'emailError', 'phoneError', 'passwordError', 'confirmError', 'termsError']
    .forEach(id => document.getElementById(id).textContent = '');
}

// ── Submit ────────────────────────────────────
document.getElementById('createBtn').addEventListener('click', () => {
  clearAll();

  const name = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const pw = document.getElementById('password').value;
  const cpw = document.getElementById('confirmPassword').value;
  const terms = document.getElementById('agreeTerms').checked;

  let valid = true;

  if (name.length < 2) { showError('fullName', 'nameError', 'Enter your full name'); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('email', 'emailError', 'Enter valid email'); valid = false; }
  if (phone.length < 7) { showError('phone', 'phoneError', 'Enter valid phone'); valid = false; }
  if (pw.length < 8) { showError('password', 'passwordError', 'Min 8 characters'); valid = false; }
  if (pw !== cpw) { showError('confirmPassword', 'confirmError', 'Passwords don’t match'); valid = false; }
  if (!terms) { document.getElementById('termsError').textContent = 'Agree to continue'; valid = false; }

  if (!valid) return;

  const btn = document.getElementById('createBtn');
  const text = document.getElementById('btnText');
  const icon = document.getElementById('btnIcon');

  btn.disabled = true;
  text.textContent = 'Securing your account...';
  icon.className = 'fa-solid fa-spinner fa-spin';

  // UX fallback (if slow network)
  setTimeout(() => {
    if (btn.disabled) text.textContent = 'Almost done...';
  }, 3000);

  createUserWithEmailAndPassword(auth, email, pw)
    .then((userCredential) => {

      const user = userCredential.user;

      // 🔥 Show success IMMEDIATELY
      btn.style.display = 'none';
      document.getElementById('formSuccess').classList.add('visible');

      // 🔥 Save user data (DON'T block UI)
      setDoc(doc(db, "users", user.uid), {
        name,
        email,
        phone,
        balance: 0,
        createdAt: new Date()
      });

      // 🔥 Redirect smoothly
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);

    })
    .catch((error) => {
      btn.disabled = false;
      text.textContent = "Create Account";
      icon.className = "fa-solid fa-arrow-right";

      if (error.code === "auth/email-already-in-use") {
        showError('email', 'emailError', 'Email already exists');
      } else {
        alert(error.message);
      }
    });
});