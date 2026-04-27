import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut,
  updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, sendEmailVerification,
  sendPasswordResetEmail, RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let STT_USER         = null;
let verifiedPhone    = null;
let confirmResult    = null;
let recaptchaVerifier = null;
let lastEmailSent    = 0;

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  STT_USER = user;

  await user.reload();

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) return;
  const d = snap.data();

  // Profile header
  const name     = d.name || "User";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  document.querySelectorAll(".stt-avatar, #profileAvatar").forEach(el => el.textContent = initials);
  setEl("userName",    name);
  setEl("userEmail",   d.email || user.email);
  setEl("accountId",   user.uid.slice(0, 8).toUpperCase());
  setEl("memberSince", d.createdAt?.seconds
    ? new Date(d.createdAt.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—"
  );

  // Fill form fields
  const nameEl = document.getElementById("settingsName");
  if (nameEl) nameEl.value = d.name || "";
  const emailEl = document.getElementById("settingsEmail");
  if (emailEl) emailEl.value = d.email || user.email || "";
  const phoneEl = document.getElementById("settingsPhone");
  if (phoneEl) phoneEl.value = d.phone || "";
  const countryEl = document.getElementById("settingsCountry");
  if (countryEl && d.country) countryEl.value = d.country;

  verifiedPhone = d.phoneVerified ? (d.phone || null) : null;

  // Update status UI
  updateEmailStatus(user.emailVerified);
  updatePhoneStatus(d.phoneVerified || false);
  updateSecurityOverview(user.emailVerified, d.phoneVerified || false);

  // Setup reCAPTCHA
  setupRecaptcha();
});

// ── LOGOUT ─────────────────────────────────────
document.querySelectorAll("#logoutBtn, #logoutBtn2, #logoutAllBtn").forEach(btn => {
  if (btn) btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

// ── EXPORT DATA ────────────────────────────────
document.getElementById("exportDataBtn")?.addEventListener("click", async () => {
  if (!STT_USER) return;
  const snap = await getDoc(doc(db, "users", STT_USER.uid));
  if (!snap.exists()) return;
  const data = snap.data();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `ymg-funds-data-${STT_USER.uid.slice(0,6)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Data exported successfully.", "success");
});

// ── STATUS UI ──────────────────────────────────
function updateEmailStatus(verified) {
  const statusEl = document.getElementById("emailStatus");
  const btnEl    = document.getElementById("verifyEmailBtn");
  const badgeEl  = document.getElementById("emailBadge");

  if (verified) {
    if (statusEl) { statusEl.className = "stt-verify-tag verified"; statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Verified'; }
    if (btnEl)    { btnEl.textContent = "✓ Verified"; btnEl.disabled = true; btnEl.classList.add("stt-verified-btn"); }
    if (badgeEl)  { badgeEl.className = "stt-badge verified"; badgeEl.innerHTML = '<i class="fa-solid fa-envelope"></i> Email Verified'; }
  } else {
    if (statusEl) { statusEl.className = "stt-verify-tag unverified"; statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Not Verified'; }
    if (btnEl)    { btnEl.textContent = "Send Verification Email"; btnEl.disabled = false; btnEl.classList.remove("stt-verified-btn"); }
    if (badgeEl)  { badgeEl.className = "stt-badge unverified"; badgeEl.innerHTML = '<i class="fa-solid fa-envelope"></i> Email Unverified'; }
  }
}

function updatePhoneStatus(verified) {
  const statusEl = document.getElementById("phoneStatus");
  const btnEl    = document.getElementById("verifyPhoneBtn");
  const badgeEl  = document.getElementById("phoneBadge");

  if (verified) {
    if (statusEl) { statusEl.className = "stt-verify-tag verified"; statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Verified'; }
    if (btnEl)    { btnEl.textContent = "✓ Verified"; btnEl.disabled = true; btnEl.classList.add("stt-verified-btn"); }
    if (badgeEl)  { badgeEl.className = "stt-badge verified"; badgeEl.innerHTML = '<i class="fa-solid fa-phone"></i> Phone Verified'; }
  } else {
    if (statusEl) { statusEl.className = "stt-verify-tag unverified"; statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Not Verified'; }
    if (btnEl)    { btnEl.textContent = "Verify Phone"; btnEl.disabled = false; btnEl.classList.remove("stt-verified-btn"); }
    if (badgeEl)  { badgeEl.className = "stt-badge unverified"; badgeEl.innerHTML = '<i class="fa-solid fa-phone"></i> Phone Unverified'; }
  }
}

function updateSecurityOverview(emailOk, phoneOk) {
  const secEmailIcon = document.getElementById("secEmailIcon");
  const secEmailText = document.getElementById("secEmailText");
  const secPhoneIcon = document.getElementById("secPhoneIcon");
  const secPhoneText = document.getElementById("secPhoneText");

  if (secEmailIcon) secEmailIcon.className = "stt-sec-icon" + (emailOk ? " green" : " red");
  if (secEmailIcon) secEmailIcon.innerHTML = emailOk ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>';
  if (secEmailText) secEmailText.textContent = emailOk ? "Email verified" : "Email not verified yet";

  if (secPhoneIcon) secPhoneIcon.className = "stt-sec-icon" + (phoneOk ? " green" : " red");
  if (secPhoneIcon) secPhoneIcon.innerHTML = phoneOk ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>';
  if (secPhoneText) secPhoneText.textContent = phoneOk ? "Phone verified" : "Phone not verified yet";
}

// ── PHONE INPUT — reset if number changed ──────
document.getElementById("settingsPhone")?.addEventListener("input", () => {
  const val = document.getElementById("settingsPhone").value.trim();
  if (verifiedPhone && val !== verifiedPhone) {
    updatePhoneStatus(false);
    updateSecurityOverview(STT_USER?.emailVerified || false, false);
  } else if (verifiedPhone && val === verifiedPhone) {
    updatePhoneStatus(true);
  }
});

// ── SAVE PROFILE ───────────────────────────────
document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
  const name    = document.getElementById("settingsName").value.trim();
  const phone   = document.getElementById("settingsPhone").value.trim();
  const country = document.getElementById("settingsCountry").value;
  const errEl   = document.getElementById("profileErr");
  const btn     = document.getElementById("saveProfileBtn");
  errEl.textContent = "";

  if (!name) { errEl.textContent = "Please enter your full name."; return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const snap = await getDoc(doc(db, "users", STT_USER.uid));
    const d    = snap.data();
    const phoneChanged = d.phone !== phone;

    await updateDoc(doc(db, "users", STT_USER.uid), {
      name,
      phone,
      country,
      ...(phoneChanged ? { phoneVerified: false } : {})
    });

    if (phoneChanged) {
      verifiedPhone = null;
      updatePhoneStatus(false);
    }

    setEl("userName", name);
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    document.querySelectorAll(".stt-avatar, #profileAvatar").forEach(el => el.textContent = initials);

    showSuccess("profileSuccess");
    showToast("Profile saved successfully.", "success");
  } catch (err) {
    console.error(err);
    errEl.textContent = "Failed to save. Please try again.";
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Profile';
});

// ── EMAIL VERIFICATION ─────────────────────────
document.getElementById("verifyEmailBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("verifyEmailBtn");
  const now = Date.now();

  if (now - lastEmailSent < 60000) {
    showToast("Please wait 60 seconds before sending again.", "error");
    return;
  }

  if (!STT_USER || STT_USER.emailVerified) return;

  lastEmailSent = now;
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendEmailVerification(STT_USER);
    showToast("Verification email sent! Check your inbox.", "success");
    btn.textContent = "Email Sent ✓";

    // Poll for verification
    const poll = setInterval(async () => {
      await STT_USER.reload();
      if (STT_USER.emailVerified) {
        clearInterval(poll);
        updateEmailStatus(true);
        updateSecurityOverview(true, document.getElementById("phoneStatus")?.classList.contains("verified") || false);
        showToast("Email verified successfully!", "success");
      }
    }, 5000);

    setTimeout(() => {
      if (!STT_USER.emailVerified) {
        btn.textContent = "Resend Email";
        btn.disabled    = false;
      }
    }, 30000);

  } catch (err) {
    console.error(err);
    showToast(err.message || "Failed to send verification email.", "error");
    btn.disabled  = false;
    btn.textContent = "Send Verification Email";
  }
});

// ── EYE TOGGLES — password fields ─────────────
[
  ["currentPw", "eyeBtn1", "eyeIco1"],
  ["newPw",     "eyeBtn2", "eyeIco2"],
  ["confirmPw", "eyeBtn3", "eyeIco3"]
].forEach(([inputId, btnId, icoId]) => {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const ico = document.getElementById(icoId);
  if (!inp || !btn || !ico) return;
  btn.addEventListener("click", () => {
    const hidden = inp.type === "password";
    inp.type     = hidden ? "text" : "password";
    ico.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  });
});

// ── CHANGE PASSWORD ────────────────────────────
document.getElementById("changePwBtn")?.addEventListener("click", async () => {
  const currentPw = document.getElementById("currentPw").value;
  const newPw     = document.getElementById("newPw").value;
  const confirmPw = document.getElementById("confirmPw").value;
  const errEl     = document.getElementById("pwErr");
  const btn       = document.getElementById("changePwBtn");
  errEl.textContent = "";

  if (!currentPw)        { errEl.textContent = "Please enter your current password."; return; }
  if (newPw.length < 8)  { errEl.textContent = "New password must be at least 8 characters."; return; }
  if (newPw !== confirmPw) { errEl.textContent = "Passwords do not match."; return; }
  if (newPw === currentPw) { errEl.textContent = "New password must be different from current password."; return; }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

  try {
    const credential = EmailAuthProvider.credential(STT_USER.email, currentPw);
    await reauthenticateWithCredential(STT_USER, credential);
    await updatePassword(STT_USER, newPw);

    // Clear fields
    document.getElementById("currentPw").value  = "";
    document.getElementById("newPw").value       = "";
    document.getElementById("confirmPw").value   = "";

    showSuccess("pwSuccess");
    showToast("Password updated successfully.", "success");

  } catch (err) {
    console.error(err);
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      errEl.textContent = "Current password is incorrect.";
    } else if (err.code === "auth/weak-password") {
      errEl.textContent = "Password too weak. Use at least 8 characters.";
    } else {
      errEl.textContent = "Failed to update password. Please try again.";
    }
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
});

// ── FORGOT PASSWORD ────────────────────────────
document.getElementById("forgotPwBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("forgotPwBtn");
  if (!STT_USER?.email) return;

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendPasswordResetEmail(auth, STT_USER.email);
    showToast(`Password reset email sent to ${STT_USER.email}. Check your inbox.`, "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to send reset email. Please try again.", "error");
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-envelope"></i> Forgot Password? Send Reset Email';
});

// ── PHONE VERIFICATION ─────────────────────────
function setupRecaptcha() {
  if (recaptchaVerifier) return;
  try {
    recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    recaptchaVerifier.render();
  } catch (err) {
    console.error("reCAPTCHA setup error:", err);
  }
}

document.getElementById("verifyPhoneBtn")?.addEventListener("click", async () => {
  const phone = document.getElementById("settingsPhone").value.trim();
  const btn   = document.getElementById("verifyPhoneBtn");

  if (!phone.startsWith("+")) {
    showToast("Use international format e.g. +233241234567", "error");
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending OTP...';

  try {
    if (!recaptchaVerifier) setupRecaptcha();
    confirmResult = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
    openOtpModal(phone);
    showToast("OTP sent to " + phone, "success");
  } catch (err) {
    console.error(err);
    if (recaptchaVerifier) { recaptchaVerifier.clear(); recaptchaVerifier = null; }
    setupRecaptcha();
    if (err.code === "auth/invalid-phone-number") {
      showToast("Invalid phone number format.", "error");
    } else if (err.code === "auth/too-many-requests") {
      showToast("Too many attempts. Please try again later.", "error");
    } else {
      showToast("Failed to send OTP. Try again.", "error");
    }
  }

  btn.disabled  = false;
  btn.innerHTML = "Verify Phone";
});

// ── OTP MODAL ──────────────────────────────────
function openOtpModal(phone) {
  setEl("otpPhoneDisplay", phone);
  document.getElementById("otpModal").classList.add("stt-modal-active");
  document.querySelectorAll(".stt-otp-box").forEach(b => b.value = "");
  setEl("otpError", "");
  document.querySelectorAll(".stt-otp-box")[0]?.focus();
  startResendTimer();
}

function closeOtpModal() {
  document.getElementById("otpModal").classList.remove("stt-modal-active");
}

document.getElementById("otpModalClose")?.addEventListener("click", closeOtpModal);
document.getElementById("otpModal")?.addEventListener("click", e => {
  if (e.target.id === "otpModal") closeOtpModal();
});

// OTP boxes auto-advance
document.querySelectorAll(".stt-otp-box").forEach((box, i, boxes) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(0, 1);
    if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
  });
  box.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
  });
});

// Resend timer
let resendInterval;
function startResendTimer() {
  let seconds = 90;
  const resendBtn = document.getElementById("resendOtpBtn");
  const timerEl   = document.getElementById("resendTimer");
  if (resendBtn) resendBtn.disabled = true;
  if (timerEl)   timerEl.textContent = `Resend in ${seconds}s`;

  resendInterval = setInterval(() => {
    seconds--;
    if (timerEl) timerEl.textContent = `Resend in ${seconds}s`;
    if (seconds <= 0) {
      clearInterval(resendInterval);
      if (resendBtn) resendBtn.disabled = false;
      if (timerEl)   timerEl.textContent = "";
    }
  }, 1000);
}

document.getElementById("resendOtpBtn")?.addEventListener("click", async () => {
  const phone = document.getElementById("settingsPhone").value.trim();
  try {
    if (recaptchaVerifier) recaptchaVerifier.clear();
    recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    await recaptchaVerifier.render();
    confirmResult = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
    showToast("New OTP sent.", "success");
    startResendTimer();
  } catch (err) {
    console.error(err);
    showToast("Failed to resend OTP.", "error");
  }
});

// Confirm OTP
document.getElementById("confirmOtpBtn")?.addEventListener("click", async () => {
  const otp   = Array.from(document.querySelectorAll(".stt-otp-box")).map(b => b.value).join("");
  const phone = document.getElementById("settingsPhone").value.trim();
  const btn   = document.getElementById("confirmOtpBtn");

  if (otp.length < 6) { setEl("otpError", "Enter the full 6-digit code."); return; }
  if (!confirmResult)  { setEl("otpError", "Session expired. Request a new OTP."); return; }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

  try {
    await confirmResult.confirm(otp);
    await updateDoc(doc(db, "users", STT_USER.uid), { phone, phoneVerified: true });
    verifiedPhone = phone;
    closeOtpModal();
    updatePhoneStatus(true);
    updateSecurityOverview(STT_USER.emailVerified, true);
    showToast("Phone verified successfully!", "success");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/invalid-verification-code") {
      setEl("otpError", "Incorrect code. Please try again.");
    } else if (err.code === "auth/code-expired") {
      setEl("otpError", "Code expired. Request a new one.");
    } else if (err.code === "auth/provider-already-linked") {
      await updateDoc(doc(db, "users", STT_USER.uid), { phone, phoneVerified: true });
      verifiedPhone = phone;
      closeOtpModal();
      updatePhoneStatus(true);
      updateSecurityOverview(STT_USER.emailVerified, true);
      showToast("Phone verified successfully!", "success");
    } else {
      setEl("otpError", "Verification failed. Please try again.");
    }
    document.querySelectorAll(".stt-otp-box").forEach(b => b.value = "");
    document.querySelectorAll(".stt-otp-box")[0]?.focus();
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Code';
});

// ── HELPERS ────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showSuccess(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "flex";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

function showToast(message, type = "success") {
  const toast = document.getElementById("sttToast");
  if (!toast) return;
  toast.textContent = message;
  toast.className   = `stt-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}