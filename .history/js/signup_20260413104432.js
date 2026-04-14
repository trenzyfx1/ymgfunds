import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const bars = [document.getElementById('bar1'), document.getElementById('bar2'), document.getElementById('bar3'), document.getElementById('bar4')];
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

  const levels = ['weak', 'fair', 'good', 'strong'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['weak', 'fair', 'good', 'strong'];

  bars.forEach((bar, i) => {
    bar.className = 'bar' + (i < score ? ` ${colors[score - 1]}` : '');
  });

  strengthLabel.textContent = val.length === 0 ? 'Enter a password' : labels[score - 1] || 'Weak';
  strengthLabel.style.color = score === 1 ? '#d0504a' : score === 2 ? '#e0943a' : score === 3 ? '#c9a84c' : '#3a8f52';
}

passwordInput.addEventListener('input', () => {
  if (passwordInput.value.length > 0) {
    strengthWrap.classList.add('visible');
  } else {
    strengthWrap.classList.remove('visible');
  }
  checkStrength(passwordInput.value);
});

// ── Inline Validation ─────────────────────────
function showError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) field.classList.add('error');
  if (error) error.textContent = message;
}

function clearError(fieldId, errorId) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) { field.classList.remove('error'); field.classList.add('valid'); }
  if (error) error.textContent = '';
}

function clearAll() {
  ['fullName', 'email', 'phone', 'password', 'confirmPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('error', 'valid'); }
  });
  ['nameError', 'emailError', 'phoneError', 'passwordError', 'confirmError', 'termsError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

// Live validation
document.getElementById('fullName').addEventListener('blur', () => {
  const val = document.getElementById('fullName').value.trim();
  val.length < 2 ? showError('fullName', 'nameError', 'Please enter your full name.') : clearError('fullName', 'nameError');
});

document.getElementById('email').addEventListener('blur', () => {
  const val = document.getElementById('email').value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  !valid ? showError('email', 'emailError', 'Please enter a valid email address.') : clearError('email', 'emailError');
});

document.getElementById('confirmPassword').addEventListener('blur', () => {
  const pw = document.getElementById('password').value;
  const cpw = document.getElementById('confirmPassword').value;
  pw !== cpw ? showError('confirmPassword', 'confirmError', 'Passwords do not match.') : clearError('confirmPassword', 'confirmError');
});

// ── Form Submission ───────────────────────────
document.getElementById('createBtn').addEventListener('click', () => {
  clearAll();

  const name = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const pw = document.getElementById('password').value;
  const cpw = document.getElementById('confirmPassword').value;
  const terms = document.getElementById('agreeTerms').checked;

  let valid = true;

  if (name.length < 2) { showError('fullName', 'nameError', 'Please enter your full name.'); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('email', 'emailError', 'Please enter a valid email address.'); valid = false; }
  if (phone.length < 7) { showError('phone', 'phoneError', 'Please enter a valid phone number.'); valid = false; }
  if (pw.length < 8) { showError('password', 'passwordError', 'Password must be at least 8 characters.'); valid = false; }
  if (pw !== cpw) { showError('confirmPassword', 'confirmError', 'Passwords do not match.'); valid = false; }
  if (!terms) { document.getElementById('termsError').textContent = 'You must agree to the terms before continuing.'; valid = false; }

  if (!valid) return;

  const btn = document.getElementById('createBtn');
  const text = document.getElementById('btnText');
  const icon = document.getElementById('btnIcon');

  btn.disabled = true;
  text.textContent = 'Creating Account...';
  icon.className = 'fa-solid fa-spinner fa-spin';

  createUserWithEmailAndPassword(auth, email, pw)
    .then(async (userCredential) => {
      const user = userCredential.user;

      document.getElementById('formSuccess').classList.add('visible');

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);

      // Save extra user data
      setDoc(doc(db, "users", user.uid), {
        name,
        email,
        phone,
        balance: 0,
        createdAt: new Date()
      });

      btn.style.display = 'none';
      document.getElementById('formSuccess').classList.add('visible');

    })
    .catch((error) => {
      btn.disabled = false;
      text.textContent = "Create Account";
      icon.className = "fa-solid fa-arrow-right";

      alert(error.message);
    });
});