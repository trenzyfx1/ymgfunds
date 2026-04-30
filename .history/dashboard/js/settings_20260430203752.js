// DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG IQ. ALL RIGHTS RESERVED.
import "./init.js";
import { createNotification } from "./notify-helper.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut,
  updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, sendEmailVerification,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let STT_USER     = null;
let verifiedPhone = null;
let lastEmailSent = 0;
let otpToken      = null; // stores the token returned by /api/send-otp

// ── AUTH STATE ────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  STT_USER = user;
  await user.reload();

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) return;
  const d = snap.data();

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

  await loadNotifPrefs(user.uid);
  await loadPrivacySettings(user.uid);
  await loadDisplaySettings(user.uid);
  await loadTxPrefs(user.uid);

  const nameEl    = document.getElementById("settingsName");
  const emailEl   = document.getElementById("settingsEmail");
  const phoneEl   = document.getElementById("settingsPhone");
  const countryEl = document.getElementById("settingsCountry");
  if (nameEl)    nameEl.value    = d.name    || "";
  if (emailEl)   emailEl.value   = d.email   || user.email || "";
  if (phoneEl)   phoneEl.value   = d.phone   || "";
  if (countryEl && d.country) countryEl.value = d.country;

  verifiedPhone = d.phoneVerified ? (d.phone || null) : null;

  updateEmailStatus(user.emailVerified);
  updatePhoneStatus(d.phoneVerified || false);
  updateSecurityOverview(user.emailVerified, d.phoneVerified || false);
});

// ── LOGOUT ────────────────────────────────────
document.querySelectorAll("#logoutBtn, #logoutBtn2, #logoutAllBtn").forEach(btn => {
  if (btn) btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

// ── EXPORT DATA ───────────────────────────────
document.getElementById("exportDataBtn")?.addEventListener("click", async () => {
  if (!STT_USER) return;
  const snap = await getDoc(doc(db, "users", STT_USER.uid));
  if (!snap.exists()) return;
  const data = snap.data();
  const blob  = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href     = url;
  a.download = `ymg-iq-data-${STT_USER.uid.slice(0, 6)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Data exported successfully.", "success");
});

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

  if (secEmailIcon) { secEmailIcon.className = "stt-sec-icon" + (emailOk ? " green" : " red"); secEmailIcon.innerHTML = emailOk ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>'; }
  if (secEmailText) secEmailText.textContent = emailOk ? "Email verified" : "Email not verified yet";
  if (secPhoneIcon) { secPhoneIcon.className = "stt-sec-icon" + (phoneOk ? " green" : " red"); secPhoneIcon.innerHTML = phoneOk ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>'; }
  if (secPhoneText) secPhoneText.textContent = phoneOk ? "Phone verified" : "Phone not verified yet";
}

document.getElementById("settingsPhone")?.addEventListener("input", () => {
  const val = document.getElementById("settingsPhone").value.trim();
  if (verifiedPhone && val !== verifiedPhone) {
    updatePhoneStatus(false);
    updateSecurityOverview(STT_USER?.emailVerified || false, false);
  } else if (verifiedPhone && val === verifiedPhone) {
    updatePhoneStatus(true);
  }
});

document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
  const name    = document.getElementById("settingsName").value.trim();
  const phone   = document.getElementById("settingsPhone").value.trim();
  const country = document.getElementById("settingsCountry").value;
  const errEl   = document.getElementById("profileErr");
  const btn     = document.getElementById("saveProfileBtn");
  errEl.textContent = "";

  if (!name) { errEl.textContent = "Please enter your full name."; return; }

  btn.disabled    = true;
  btn.innerHTML   = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const snap        = await getDoc(doc(db, "users", STT_USER.uid));
    const d           = snap.data();
    const phoneChanged = d.phone !== phone;

    await updateDoc(doc(db, "users", STT_USER.uid), {
      name, phone, country,
      ...(phoneChanged ? { phoneVerified: false } : {})
    });

    if (phoneChanged) { verifiedPhone = null; updatePhoneStatus(false); }

    setEl("userName", name);
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    document.querySelectorAll(".stt-avatar, #profileAvatar").forEach(el => el.textContent = initials);

    showSuccess("profileSuccess");
    showToast("Profile saved successfully.", "success");
  } catch (err) {
    console.error(err);
    errEl.textContent = "Failed to save. Please try again.";
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Profile';
});

document.getElementById("verifyEmailBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("verifyEmailBtn");
  const now = Date.now();

  if (now - lastEmailSent < 60000) { showToast("Please wait 60 seconds before sending again.", "error"); return; }
  if (!STT_USER || STT_USER.emailVerified) return;

  lastEmailSent   = now;
  btn.disabled    = true;
  btn.innerHTML   = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendEmailVerification(STT_USER);
    showToast("Verification email sent! Check your inbox.", "success");
    btn.textContent = "Email Sent ✓";

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
      if (!STT_USER.emailVerified) { btn.textContent = "Resend Email"; btn.disabled = false; }
    }, 30000);

  } catch (err) {
    console.error(err);
    showToast(err.message || "Failed to send verification email.", "error");
    btn.disabled    = false;
    btn.textContent = "Send Verification Email";
  }
});

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
    const hidden  = inp.type === "password";
    inp.type      = hidden ? "text" : "password";
    ico.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  });
});

document.getElementById("changePwBtn")?.addEventListener("click", async () => {
  const currentPw = document.getElementById("currentPw").value;
  const newPw     = document.getElementById("newPw").value;
  const confirmPw = document.getElementById("confirmPw").value;
  const errEl     = document.getElementById("pwErr");
  const btn       = document.getElementById("changePwBtn");
  errEl.textContent = "";

  if (!currentPw)              { errEl.textContent = "Please enter your current password."; return; }
  if (newPw.length < 8)        { errEl.textContent = "New password must be at least 8 characters."; return; }
  if (newPw !== confirmPw)     { errEl.textContent = "Passwords do not match."; return; }
  if (newPw === currentPw)     { errEl.textContent = "New password must be different from current password."; return; }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

  try {
    const credential = EmailAuthProvider.credential(STT_USER.email, currentPw);
    await reauthenticateWithCredential(STT_USER, credential);
    await updatePassword(STT_USER, newPw);

    document.getElementById("currentPw").value = "";
    document.getElementById("newPw").value     = "";
    document.getElementById("confirmPw").value = "";

    showSuccess("pwSuccess");
    showToast("Password updated successfully.", "success");
    await createNotification(STT_USER.uid, "activation", "Password Changed", "Your account password was updated successfully.");

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
    const res  = await fetch("/api/send-otp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phone })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to send OTP. Try again.", "error");
      btn.disabled  = false;
      btn.innerHTML = "Verify Phone";
      return;
    }

    otpToken = data.token;
    openOtpModal(phone);
    showToast("OTP sent to " + phone, "success");

  } catch (err) {
    console.error(err);
    showToast("Failed to send OTP. Check your connection and try again.", "error");
  }

  btn.disabled  = false;
  btn.innerHTML = "Verify Phone";
});

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

document.querySelectorAll(".stt-otp-box").forEach((box, i, boxes) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(0, 1);
    if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
  });
  box.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
  });
});

let resendInterval;
function startResendTimer() {
  let seconds     = 90;
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
    const res  = await fetch("/api/send-otp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phone })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || "Failed to resend OTP.", "error");
      return;
    }

    otpToken = data.token;
    showToast("New OTP sent.", "success");
    startResendTimer();

  } catch (err) {
    console.error(err);
    showToast("Failed to resend OTP.", "error");
  }
});

document.getElementById("confirmOtpBtn")?.addEventListener("click", async () => {
  const otp   = Array.from(document.querySelectorAll(".stt-otp-box")).map(b => b.value).join("");
  const phone = document.getElementById("settingsPhone").value.trim();
  const btn   = document.getElementById("confirmOtpBtn");

  if (otp.length < 6)  { setEl("otpError", "Enter the full 6-digit code."); return; }
  if (!otpToken)        { setEl("otpError", "Session expired. Request a new OTP."); return; }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

  try {
    const res  = await fetch("/api/verify-otp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: otpToken, code: otp, phone })
    });
    const data = await res.json();

    if (!res.ok || !data.verified) {
      setEl("otpError", data.error || "Incorrect code. Please try again.");
      document.querySelectorAll(".stt-otp-box").forEach(b => b.value = "");
      document.querySelectorAll(".stt-otp-box")[0]?.focus();
      btn.disabled  = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Code';
      return;
    }

    await updateDoc(doc(db, "users", STT_USER.uid), { phone, phoneVerified: true });
    verifiedPhone = phone;
    otpToken      = null;

    closeOtpModal();
    updatePhoneStatus(true);
    updateSecurityOverview(STT_USER.emailVerified, true);
    showToast("Phone verified successfully!", "success");
    await createNotification(STT_USER.uid, "activation", "Phone Verified", "Your phone number has been verified successfully.");

  } catch (err) {
    console.error(err);
    setEl("otpError", "Verification failed. Please try again.");
    document.querySelectorAll(".stt-otp-box").forEach(b => b.value = "");
    document.querySelectorAll(".stt-otp-box")[0]?.focus();
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Code';
});

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

const NOTIF_KEYS = [
  "notifDeposit", "notifWithdraw", "notifProfit",
  "notifReferral", "notifPremReferral", "notifMaturity",
  "notifActivation", "notifLogin", "notifLoan",
  "notifSecurity", "notifPromo"
];

async function loadNotifPrefs(uid) {
  try {
    const snap  = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const prefs = snap.data().notifPrefs || {};
    NOTIF_KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (!el) return;
      el.checked = key in prefs ? prefs[key] : key !== "notifPromo";
    });
  } catch (err) { console.error("Load notif prefs error:", err); }
}

document.getElementById("saveNotifBtn")?.addEventListener("click", async () => {
  if (!STT_USER) return;
  const btn = document.getElementById("saveNotifBtn");
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  const prefs = {};
  NOTIF_KEYS.forEach(key => {
    const el = document.getElementById(key);
    if (el) prefs[key] = el.checked;
  });

  try {
    await updateDoc(doc(db, "users", STT_USER.uid), { notifPrefs: prefs });
    const s = document.getElementById("notifSuccess");
    if (s) { s.style.display = "flex"; setTimeout(() => s.style.display = "none", 3000); }
    showToast("Notification preferences saved.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to save preferences.", "error");
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Preferences';
});

document.getElementById("notifAllOffBtn")?.addEventListener("click", () => {
  NOTIF_KEYS.forEach(key => {
    const el = document.getElementById(key);
    if (el) el.checked = false;
  });
  showToast("All notifications turned off. Click Save to apply.", "success");
});

const PRIVACY_KEYS = ["privProfile", "privInsights", "privTracking", "privMarketing"];

async function loadPrivacySettings(uid) {
  try {
    const snap  = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const prefs = snap.data().privacySettings || {};
    PRIVACY_KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (!el) return;
      el.checked = key in prefs ? prefs[key] : key !== "privMarketing";
    });
  } catch (err) { console.error("Load privacy error:", err); }
}

document.getElementById("savePrivacyBtn")?.addEventListener("click", async () => {
  if (!STT_USER) return;
  const btn = document.getElementById("savePrivacyBtn");
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  const prefs = {};
  PRIVACY_KEYS.forEach(key => {
    const el = document.getElementById(key);
    if (el) prefs[key] = el.checked;
  });

  try {
    await updateDoc(doc(db, "users", STT_USER.uid), { privacySettings: prefs });
    showSuccess("privacySuccess");
    showToast("Privacy settings saved.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to save. Try again.", "error");
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Privacy Settings';
});

async function loadDisplaySettings(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const d = snap.data().displaySettings || {};

    const currency = document.getElementById("dispCurrency");
    const date     = document.getElementById("dispDate");
    const defPage  = document.getElementById("dispDefaultPage");
    const hidebal  = document.getElementById("dispHideBalance");
    const compact  = document.getElementById("dispCompact");

    if (currency && d.currency)    currency.value = d.currency;
    if (date && d.dateFormat)      date.value     = d.dateFormat;
    if (defPage && d.defaultPage)  defPage.value  = d.defaultPage;
    if (hidebal) hidebal.checked = d.hideBalance || false;
    if (compact) compact.checked = d.compact     || false;

    if (d.hideBalance) applyHideBalance(true);
    if (d.compact)     applyCompactMode(true);
  } catch (err) { console.error("Load display error:", err); }
}

function applyHideBalance(hide) {
  const ids = ["totalBalance", "invAvailBal", "currentBalance", "availableBalance"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.filter = hide ? "blur(6px)" : "";
  });
}

function applyCompactMode(on) {
  document.body.classList.toggle("stt-compact", on);
}

document.getElementById("dispHideBalance")?.addEventListener("change", e => applyHideBalance(e.target.checked));
document.getElementById("dispCompact")?.addEventListener("change",     e => applyCompactMode(e.target.checked));

document.getElementById("saveDisplayBtn")?.addEventListener("click", async () => {
  if (!STT_USER) return;
  const btn = document.getElementById("saveDisplayBtn");
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  const settings = {
    currency:    document.getElementById("dispCurrency")?.value    || "symbol",
    dateFormat:  document.getElementById("dispDate")?.value        || "dd/mm/yyyy",
    defaultPage: document.getElementById("dispDefaultPage")?.value || "dashboard.html",
    hideBalance: document.getElementById("dispHideBalance")?.checked || false,
    compact:     document.getElementById("dispCompact")?.checked   || false,
  };

  try {
    await updateDoc(doc(db, "users", STT_USER.uid), { displaySettings: settings });
    showSuccess("displaySuccess");
    showToast("Display settings saved.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to save. Try again.", "error");
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Display Settings';
});

async function loadTxPrefs(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const d = snap.data().txPrefs || {};

    const pwW   = document.getElementById("txPwWithdraw");
    const pwI   = document.getElementById("txPwInvest");
    const fees  = document.getElementById("txShowFees");
    const lowBal = document.getElementById("txLowBalAlert");
    const prefW = document.getElementById("txPrefWithdraw");

    if (pwW)    pwW.checked   = "pwWithdraw" in d ? d.pwWithdraw : true;
    if (pwI)    pwI.checked   = "pwInvest"   in d ? d.pwInvest   : true;
    if (fees)   fees.checked  = "showFees"   in d ? d.showFees   : true;
    if (lowBal && d.lowBalAlert !== undefined) lowBal.value = d.lowBalAlert;
    if (prefW && d.prefWithdraw) prefW.value = d.prefWithdraw;
  } catch (err) { console.error("Load tx prefs error:", err); }
}

document.getElementById("saveTxBtn")?.addEventListener("click", async () => {
  if (!STT_USER) return;
  const btn = document.getElementById("saveTxBtn");
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  const prefs = {
    pwWithdraw: document.getElementById("txPwWithdraw")?.checked || false,
    pwInvest:   document.getElementById("txPwInvest")?.checked   || false,
    showFees:   document.getElementById("txShowFees")?.checked   || false,
    lowBalAlert: document.getElementById("txLowBalAlert")?.value || "0",
    prefWithdraw: document.getElementById("txPrefWithdraw")?.value || "",
  };

  try {
    await updateDoc(doc(db, "users", STT_USER.uid), { txPrefs: prefs });
    showSuccess("txSuccess");
    showToast("Transaction preferences saved.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to save. Try again.", "error");
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Transaction Settings';
});