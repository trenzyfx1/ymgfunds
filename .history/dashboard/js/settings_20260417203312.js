import { auth, db } from "../js/firebase.js";
import {
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  PhoneAuthProvider,
  RecaptchaVerifier
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
let verifiedPhone = null;
let confirmationResult = null;
let recaptchaVerifier = null;

// ── Block browser autocomplete on password fields ──
window.addEventListener("load", () => {
  ["currentPw", "newPw", "confirmPw"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.setAttribute("autocomplete", "off");
      // Extra trick: briefly set readonly then remove it
      el.setAttribute("readonly", true);
      setTimeout(() => el.removeAttribute("readonly"), 100);
    }
  });
});

// ── Auth State ─────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }

  currentUser = user;

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

    const initials = (data.name || "U").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    document.querySelectorAll(".profile-avatar").forEach(a => a.textContent = initials);

    verifiedPhone = data.phoneVerified ? (data.phone || null) : null;
    updatePhoneStatus(data.phoneVerified || false);
  }

  await currentUser.reload();
  updateEmailStatus(currentUser.emailVerified);

  // Setup reCAPTCHA after user is confirmed
  setupRecaptcha();
});

// ── Setup invisible reCAPTCHA ──────────────────
function setupRecaptcha() {
  if (recaptchaVerifier) return;

  recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible"
  });

  recaptchaVerifier.render(); // ✅ THIS LINE FIXES YOUR LIFE
}

// ── Phone input — reset status if number changed
document.getElementById("settingsPhone").addEventListener("input", () => {
  const currentVal = document.getElementById("settingsPhone").value.trim();
  if (verifiedPhone && currentVal !== verifiedPhone) {
    updatePhoneStatus(false);
  } else if (verifiedPhone && currentVal === verifiedPhone) {
    updatePhoneStatus(true);
  }
});

// ── Verification Status UI ─────────────────────
function updatePhoneStatus(verified) {
  const status = document.getElementById("phoneStatus");
  const btn = document.getElementById("verifyPhoneBtn");
  const note = document.getElementById("phoneVerifyNote");

  if (verified) {
    status.textContent = "✓ Verified";
    status.className = "verify-status verified";
    btn.textContent = "Verified";
    btn.disabled = true;
    btn.classList.add("btn-verified");
    if (note) note.style.display = "none";
  } else {
    status.textContent = "✗ Not Verified";
    status.className = "verify-status unverified";
    btn.textContent = "Verify Now";
    btn.disabled = false;
    btn.classList.remove("btn-verified");
    if (note) note.style.display = "flex";
  }
}

function updateEmailStatus(verified) {
  const status = document.getElementById("emailStatus");
  const btn = document.getElementById("verifyEmailBtn");
  const note = document.getElementById("emailVerifyNote");

  if (verified) {
    status.textContent = "✓ Verified";
    status.className = "verify-status verified";
    btn.textContent = "Verified";
    btn.disabled = true;
    btn.classList.add("btn-verified");
    if (note) note.style.display = "none";
  } else {
    status.textContent = "✗ Not Verified";
    status.className = "verify-status unverified";
    btn.textContent = "Send Verification Email";
    btn.disabled = false;
    btn.classList.remove("btn-verified");
    if (note) note.style.display = "flex";
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
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const data = userDoc.data();
    const phoneChanged = data.phone !== phone;

    await updateDoc(doc(db, "users", currentUser.uid), {
      phone,
      country,
      ...(phoneChanged ? { phoneVerified: false } : {})
    });

    if (phoneChanged) {
      verifiedPhone = null;
      updatePhoneStatus(false);
    }

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
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: false
    };

    await sendEmailVerification(currentUser, actionCodeSettings);
    showToast("Verification email sent! Check your inbox.", "success");
    btn.innerHTML = "Email Sent ✓";

    const pollVerification = setInterval(async () => {
      await currentUser.reload();
      if (currentUser.emailVerified) {
        clearInterval(pollVerification);
        updateEmailStatus(true);
        showToast("Email verified successfully! ✓", "success");
      }
    }, 5000);

    setTimeout(() => {
      if (!currentUser.emailVerified) {
        btn.innerHTML = "Resend Email";
        btn.disabled = false;
      }
    }, 30000);

  } catch (err) {
    console.error(err);
    showToast("Failed to send email. Try again.", "error");
    btn.disabled = false;
    btn.innerHTML = "Send Verification Email";
  }
});

// ── Phone Verification — Firebase Phone Auth ───
document.getElementById("verifyPhoneBtn").addEventListener("click", async () => {
  const phone = document.getElementById("settingsPhone").value.trim();

   {
    showToast("Please enter your phone number first.", "error");
    document.getElementById("settingsPhone").focus();
    return;
  }

  const btn = document.getElementById("verifyPhoneBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    const provider = new PhoneAuthProvider(auth);
    confirmationResult = await provider.verifyPhoneNumber(phone, recaptchaVerifier);
    openOtpModal(phone);
    showToast("OTP sent to " + phone, "success");
  } catch (err) {
    console.error(err);
    // Reset reCAPTCHA so it can be used again
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
    setupRecaptcha();

    if (err.code === "auth/invalid-phone-number") {
      showToast("Invalid phone number. Use international format e.g. +233...", "error");
    } else if (err.code === "auth/too-many-requests") {
      showToast("Too many attempts. Please try again later.", "error");
    } else {
      showToast("Failed to send OTP. Try again.", "error");
    }
  }

  btn.disabled = false;
  btn.innerHTML = "Verify Now";
});

// ── OTP Modal ──────────────────────────────────
function openOtpModal(phone) {
  document.getElementById("otpPhoneDisplay").textContent = phone;
  document.getElementById("otpModal").classList.add("active");
  document.querySelectorAll(".otp-box").forEach(b => b.value = "");
  document.getElementById("otpError").textContent = "";
  document.querySelectorAll(".otp-box")[0].focus();
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

// OTP boxes — auto-advance
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

document.getElementById("resendOtpBtn").addEventListener("click", async () => {
  const phone = document.getElementById("settingsPhone").value.trim();
  try {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
    setupRecaptcha();
    const provider = new PhoneAuthProvider(auth);
    confirmationResult = await provider.verifyPhoneNumber(phone, recaptchaVerifier);
    showToast("New OTP sent to your phone.", "success");
    startResendTimer();
  } catch (err) {
    console.error(err);
    showToast("Failed to resend OTP. Try again.", "error");
  }
});

// ── Confirm OTP — Real Firebase verification ───
document.getElementById("confirmOtpBtn").addEventListener("click", async () => {
  const otp = Array.from(otpBoxes).map(b => b.value).join("");
  const phone = document.getElementById("settingsPhone").value.trim();

  if (otp.length < 6) {
    document.getElementById("otpError").textContent = "Enter the full 6-digit code.";
    return;
  }

  if (!confirmationResult) {
    document.getElementById("otpError").textContent = "Session expired. Please request a new OTP.";
    return;
  }

  const btn = document.getElementById("confirmOtpBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

  try {
    const credential = PhoneAuthProvider.credential(confirmationResult, otp);
    // Link phone to the current user's Firebase account
    await currentUser.linkWithCredential(credential);

    await updateDoc(doc(db, "users", currentUser.uid), {
      phone,
      phoneVerified: true
    });

    verifiedPhone = phone;
    closeOtpModal();
    updatePhoneStatus(true);
    showToast("Phone number verified successfully!", "success");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/invalid-verification-code") {
      document.getElementById("otpError").textContent = "Incorrect code. Please try again.";
    } else if (err.code === "auth/code-expired") {
      document.getElementById("otpError").textContent = "Code expired. Request a new one.";
    } else if (err.code === "auth/provider-already-linked") {
      // Phone already linked — just mark as verified in Firestore
      await updateDoc(doc(db, "users", currentUser.uid), {
        phone,
        phoneVerified: true
      });
      verifiedPhone = phone;
      closeOtpModal();
      updatePhoneStatus(true);
      showToast("Phone number verified successfully!", "success");
    } else {
      document.getElementById("otpError").textContent = "Verification failed. Try again.";
    }
    otpBoxes.forEach(b => b.value = "");
    otpBoxes[0].focus();
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm';
});

// ── Show / Hide Password Toggles ───────────────
function setupToggle(inputId, btnId, iconId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const icon = document.getElementById(iconId);
  if (!input || !btn || !icon) return;

  btn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.className = isHidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  });
}

setupToggle("currentPw", "toggleCurrentPw", "eyeCurrentPw");
setupToggle("newPw", "toggleNewPw", "eyeNewPw");
setupToggle("confirmPw", "toggleConfirmPw", "eyeConfirmPw");

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
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      errorEl.textContent = "Current password is incorrect.";
    } else {
      errorEl.textContent = "Failed to update password. Try again.";
    }
    console.error(err);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
});

// ── Forgot Password ────────────────────────────
document.getElementById("forgotPwBtn").addEventListener("click", async () => {
  const btn = document.getElementById("forgotPwBtn");
  if (!currentUser?.email) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendPasswordResetEmail(auth, currentUser.email);
    showToast(`Password reset email sent to ${currentUser.email}`, "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to send reset email. Try again.", "error");
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Forgot Password?';
});

// ── Toast ──────────────────────────────────────
function showToast(message, type = "success") {
  const toast = document.getElementById("settingsToast");
  toast.textContent = message;
  toast.className = `settings-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}