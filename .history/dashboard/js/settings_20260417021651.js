import { auth, db } from "../js/firebase.js";
import {
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;

// ── Auth State ─────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }

  currentUser = user;

  // Load Firestore user data
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (userDoc.exists()) {
    const data = userDoc.data();

    document.getElementById("userName").textContent = data.name || "User";
    document.getElementById("userEmail").textContent = data.email || user.email;
    document.getElementById("settingsEmail").value = data.email || user.email;
    document.getElementById("settingsPhone").value = data.phone || "";

    if (data.country) {
      document.getElementById("settingsCountry").value = data.country;
    }

    // Avatar initials
    const avatars = document.querySelectorAll(".profile-avatar");
    const initials = (data.name || "U").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    avatars.forEach(a => a.textContent = initials);

    // Phone verification status
    updatePhoneStatus(data.phoneVerified || false);
  }

  // Email verification status
  updateEmailStatus(user.emailVerified);
});

// ── Verification Status UI ─────────────────────
function updatePhoneStatus(verified) {
  const status = document.getElementById("phoneStatus");
  const btn = document.getElementById("verifyPhoneBtn");
  if (verified) {
    status.textContent = "✓ Verified";
    status.className = "verify-status verified";
    btn.textContent = "Verified";
    btn.disabled = true;
    btn.classList.add("btn-verified");
  } else {
    status.textContent = "✗ Not Verified";
    status.className = "verify-status unverified";
    btn.textContent = "Verify Now";
    btn.disabled = false;
    btn.classList.remove("btn-verified");
  }
}

function updateEmailStatus(verified) {
  const status = document.getElementById("emailStatus");
  const btn = document.getElementById("verifyEmailBtn");
  if (verified) {
    status.textContent = "✓ Verified";
    status.className = "verify-status verified";
    btn.textContent = "Verified";
    btn.disabled = true;
    btn.classList.add("btn-verified");
  } else {
    status.textContent = "✗ Not Verified";
    status.className = "verify-status unverified";
    btn.textContent = "Send Verification Email";
    btn.disabled = false;
    btn.classList.remove("btn-verified");
  }
}

// ── Save Profile ───────────────────────────────
document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  const phone = document.getElementById("settingsPhone").value.trim();
  const country = document.getElementById("settingsCountry").value;
  const btn = document.getElementById("saveProfileBtn");
  const success = document.getElementById("profileSuccess");

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    await updateDoc(doc(db, "users", currentUser.uid), { phone, country });
    success.classList.add("visible");
    setTimeout(() => success.classList.remove("visible"), 3000);
  } catch (err) {
    console.error(err);
    alert("Failed to save. Try again.");
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
});

// ── Email Verification ─────────────────────────
document.getElementById("verifyEmailBtn").addEventListener("click", async () => {
  const btn = document.getElementById("verifyEmailBtn");

  if (currentUser.emailVerified) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendEmailVerification(currentUser);
    showToast("Verification email sent! Check your inbox.", "success");
    btn.innerHTML = "Email Sent ✓";
    setTimeout(() => {
      btn.innerHTML = "Resend Email";
      btn.disabled = false;
    }, 30000);
  } catch (err) {
    console.error(err);
    showToast("Failed to send email. Try again.", "error");
    btn.disabled = false;
    btn.innerHTML = "Send Verification Email";
  }
});

// ── Phone Verification (OTP Modal) ────────────
document.getElementById("verifyPhoneBtn").addEventListener("click", () => {
  const phone = document.getElementById("settingsPhone").value.trim();
  if (!phone || phone.length < 7) {
    showToast("Please enter your phone number first.", "error");
    document.getElementById("settingsPhone").focus();
    return;
  }
  openOtpModal(phone);
});

function openOtpModal(phone) {
  document.getElementById("otpPhoneDisplay").textContent = phone;
  document.getElementById("otpModal").classList.add("active");
  document.getElementById("otpInput").value = "";
  document.getElementById("otpError").textContent = "";
  startResendTimer();
}

document.getElementById("otpModalClose").addEventListener("click", closeOtpModal);
document.getElementById("otpModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("otpModal")) closeOtpModal();
});

function closeOtpModal() {
  document.getElementById("otpModal").classList.remove("active");
  clearInterval(resendInterval);
}

// OTP input — auto-advance between boxes
const otpBoxes = document.querySelectorAll(".otp-box");
otpBoxes.forEach((box, i) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(0, 1);
    if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !box.value && i > 0) otpBoxes[i - 1].focus();
  });
});

// Resend timer
let resendInterval;
let resendSeconds = 60;

function startResendTimer() {
  resendSeconds = 60;
  const resendBtn = document.getElementById("resendOtpBtn");
  const timerEl = document.getElementById("resendTimer");
  resendBtn.disabled = true;
  timerEl.textContent = `Resend in ${resendSeconds}s`;

  resendInterval = setInterval(() => {
    resendSeconds--;
    timerEl.textContent = `Resend in ${resendSeconds}s`;
    if (resendSeconds <= 0) {
      clearInterval(resendInterval);
      resendBtn.disabled = false;
      timerEl.textContent = "";
    }
  }, 1000);
}

document.getElementById("resendOtpBtn").addEventListener("click", () => {
  showToast("New OTP sent to your phone.", "success");
  startResendTimer();
});

// Confirm OTP
document.getElementById("confirmOtpBtn").addEventListener("click", async () => {
  const otp = Array.from(otpBoxes).map(b => b.value).join("");

  if (otp.length < 6) {
    document.getElementById("otpError").textContent = "Enter the full 6-digit code.";
    return;
  }

  const btn = document.getElementById("confirmOtpBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

  // Simulate OTP check (replace with real SMS API later)
  await new Promise(r => setTimeout(r, 1500));

  // For now: accept "123456" as test OTP
  if (otp === "123456") {
    await updateDoc(doc(db, "users", currentUser.uid), { phoneVerified: true });
    closeOtpModal();
    updatePhoneStatus(true);
    showToast("Phone number verified successfully!", "success");
  } else {
    document.getElementById("otpError").textContent = "Incorrect code. Please try again.";
    otpBoxes.forEach(b => b.value = "");
    otpBoxes[0].focus();
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm';
});

// ── Change Password ────────────────────────────
document.getElementById("changePwBtn").addEventListener("click", async () => {
  const currentPw = document.getElementById("currentPw").value;
  const newPw = document.getElementById("newPw").value;
  const confirmPw = document.getElementById("confirmPw").value;
  const errorEl = document.getElementById("pwError");
  const successEl = document.getElementById("pwSuccess");
  const btn = document.getElementById("changePwBtn");

  errorEl.textContent = "";
  successEl.classList.remove("visible");

  if (!currentPw) { errorEl.textContent = "Enter your current password."; return; }
  if (newPw.length < 8) { errorEl.textContent = "New password must be at least 8 characters."; return; }
  if (newPw !== confirmPw) { errorEl.textContent = "Passwords do not match."; return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPw);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPw);

    document.getElementById("currentPw").value = "";
    document.getElementById("newPw").value = "";
    document.getElementById("confirmPw").value = "";

    successEl.classList.add("visible");
    setTimeout(() => successEl.classList.remove("visible"), 3000);
  } catch (err) {
    if (err.code === "auth/wrong-password") {
      errorEl.textContent = "Current password is incorrect.";
    } else {
      errorEl.textContent = "Failed to update password. Try again.";
    }
    console.error(err);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
});

// ── Toast Notification ─────────────────────────
function showToast(message, type = "success") {
  const toast = document.getElementById("settingsToast");
  toast.textContent = message;
  toast.className = `settings-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}