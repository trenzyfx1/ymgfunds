import { db, auth } from "../../js/firebase.js";
import {
  doc, getDoc, setDoc, addDoc,
  collection, getDocs, query,
  orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  reauthenticateWithCredential,
  EmailAuthProvider, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const SETTINGS_DOC = "platformSettings";
const SETTINGS_COL = "config";

const DEFAULT_SETTINGS = {
  // deposit
  minDeposit:           50,
  depositFeeRate:       0,
  depositCooldownDays:  3,
  // withdrawal
  withdrawFeeRate:      3,
  withdrawFeeMin:       3,
  withdrawMin:          10,
  withdrawMax:          10000,
  minBalance:           50,
  // activation
  stdActivationFee:     500,
  premActivationFee:    1000,
  // referrals
  referralBonus:        10,
  premStdBonus:         50,
  premPremBonus:        100,
  // toggles
  depositsEnabled:      true,
  withdrawalsEnabled:   true,
  registrationsEnabled: true,
  maintenanceMode:      false,
  investmentsEnabled:   true,
  loansEnabled:         true,
  referralsEnabled:     true,
  kycRequired:          true
};

let currentSettings = { ...DEFAULT_SETTINGS };

function showToast(msg, type = "success") {
  const toast = document.getElementById("admToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `adm-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function fmtDateTime(seconds) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
    if (snap.exists()) {
      currentSettings = { ...DEFAULT_SETTINGS, ...snap.data() };
    } else {
      await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC), DEFAULT_SETTINGS);
    }
    populateFields();
  } catch (err) {
    console.error("Load settings error:", err);
    showToast("Failed to load settings.", "error");
  }
}

function populateFields() {
  const s = currentSettings;

  // Deposit
  setVal("stt_minDeposit",          s.minDeposit);
  setVal("stt_depositFeeRate",       s.depositFeeRate);
  setVal("stt_depositCooldownDays",  s.depositCooldownDays);

  // Withdrawal
  setVal("stt_withdrawFeeRate",      s.withdrawFeeRate);
  setVal("stt_withdrawFeeMin",       s.withdrawFeeMin);
  setVal("stt_withdrawMin",          s.withdrawMin);
  setVal("stt_withdrawMax",          s.withdrawMax);
  setVal("stt_minBalance",           s.minBalance);

  // Activation
  setVal("stt_stdActivationFee",     s.stdActivationFee);
  setVal("stt_premActivationFee",    s.premActivationFee);

  // Referral
  setVal("stt_referralBonus",        s.referralBonus);
  setVal("stt_premStdBonus",         s.premStdBonus);
  setVal("stt_premPremBonus",        s.premPremBonus);

  // Toggles
  const toggles = [
    "depositsEnabled","withdrawalsEnabled","registrationsEnabled",
    "maintenanceMode","investmentsEnabled","loansEnabled",
    "referralsEnabled","kycRequired"
  ];
  toggles.forEach(key => {
    const sw = document.getElementById(`sw_${key}`);
    if (sw) sw.checked = s[key] !== false;
  });
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

function getNum(id) {
  return parseFloat(document.getElementById(id)?.value) || 0;
}

async function saveSettings(partial) {
  currentSettings = { ...currentSettings, ...partial };
  await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC), currentSettings);
}

window.saveToggle = async function(key, value) {
  try {
    await saveSettings({ [key]: value });
    showToast(`${key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())} ${value ? "enabled" : "disabled"}.`, value ? "success" : "error");
  } catch (err) {
    console.error(err);
    showToast("Failed to update. Please try again.", "error");
  }
};

document.getElementById("sttSaveDeposit")?.addEventListener("click", async () => {
  setErr("sttDepErr", "");
  const minDeposit          = getNum("stt_minDeposit");
  const depositFeeRate      = getNum("stt_depositFeeRate");
  const depositCooldownDays = getNum("stt_depositCooldownDays");

  if (minDeposit < 1)         { setErr("sttDepErr", "Minimum deposit must be at least GHS 1."); return; }
  if (depositFeeRate < 0 || depositFeeRate > 100) { setErr("sttDepErr", "Fee must be between 0 and 100%."); return; }

  try {
    await saveSettings({ minDeposit, depositFeeRate, depositCooldownDays });
    showToast("Deposit settings saved.", "success");
  } catch (err) { console.error(err); showToast("Failed to save.", "error"); }
});

document.getElementById("sttSaveWithdraw")?.addEventListener("click", async () => {
  setErr("sttWdrErr", "");
  const withdrawFeeRate = getNum("stt_withdrawFeeRate");
  const withdrawFeeMin  = getNum("stt_withdrawFeeMin");
  const withdrawMin     = getNum("stt_withdrawMin");
  const withdrawMax     = getNum("stt_withdrawMax");
  const minBalance      = getNum("stt_minBalance");

  if (withdrawFeeRate < 0 || withdrawFeeRate > 100) { setErr("sttWdrErr", "Fee must be between 0 and 100%."); return; }
  if (withdrawMin < 1)    { setErr("sttWdrErr", "Minimum withdrawal must be at least GHS 1."); return; }
  if (withdrawMax < withdrawMin) { setErr("sttWdrErr", "Maximum must be greater than minimum."); return; }

  try {
    await saveSettings({ withdrawFeeRate, withdrawFeeMin, withdrawMin, withdrawMax, minBalance });
    showToast("Withdrawal settings saved.", "success");
  } catch (err) { console.error(err); showToast("Failed to save.", "error"); }
});

document.getElementById("sttSaveActivation")?.addEventListener("click", async () => {
  setErr("sttActErr", "");
  const stdActivationFee  = getNum("stt_stdActivationFee");
  const premActivationFee = getNum("stt_premActivationFee");

  if (stdActivationFee < 1)  { setErr("sttActErr", "Standard fee must be at least GHS 1."); return; }
  if (premActivationFee < 1) { setErr("sttActErr", "Premium fee must be at least GHS 1."); return; }

  try {
    await saveSettings({ stdActivationFee, premActivationFee });
    showToast("Activation fees saved.", "success");
  } catch (err) { console.error(err); showToast("Failed to save.", "error"); }
});

document.getElementById("sttSaveReferral")?.addEventListener("click", async () => {
  setErr("sttRefErr", "");
  const referralBonus = getNum("stt_referralBonus");
  const premStdBonus  = getNum("stt_premStdBonus");
  const premPremBonus = getNum("stt_premPremBonus");

  try {
    await saveSettings({ referralBonus, premStdBonus, premPremBonus });
    showToast("Referral rewards saved.", "success");
  } catch (err) { console.error(err); showToast("Failed to save.", "error"); }
});

document.getElementById("sttSaveProfile")?.addEventListener("click", async () => {
  setErr("sttProfileErr", "");
  const name = document.getElementById("sttAdminName")?.value.trim();
  if (!name) { setErr("sttProfileErr", "Please enter a display name."); return; }

  try {
    const user = auth.currentUser;
    await setDoc(doc(db, "users", user.uid), { name }, { merge: true });
    showToast("Profile updated.", "success");
  } catch (err) { console.error(err); showToast("Failed to update profile.", "error"); }
});

document.getElementById("sttChangePw")?.addEventListener("click", async () => {
  setErr("sttPwErr", "");
  const currentPw = document.getElementById("sttCurrentPw")?.value;
  const newPw     = document.getElementById("sttNewPw")?.value;
  const confirmPw = document.getElementById("sttConfirmPw")?.value;

  if (!currentPw) { setErr("sttPwErr", "Enter your current password."); return; }
  if (!newPw || newPw.length < 8) { setErr("sttPwErr", "New password must be at least 8 characters."); return; }
  if (newPw !== confirmPw) { setErr("sttPwErr", "Passwords do not match."); return; }

  const btn = document.getElementById("sttChangePw");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

  try {
    const user       = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, currentPw);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPw);

    document.getElementById("sttCurrentPw").value = "";
    document.getElementById("sttNewPw").value      = "";
    document.getElementById("sttConfirmPw").value  = "";

    await addDoc(collection(db, "users", user.uid, "notifications"), {
      type:      "security",
      title:     "Admin Password Changed",
      message:   `Your admin password was changed successfully.`,
      read:      false,
      createdAt: serverTimestamp()
    });

    showToast("Password updated successfully.", "success");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      setErr("sttPwErr", "Current password is incorrect.");
    } else {
      setErr("sttPwErr", "Failed to update password. Please try again.");
    }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
});

async function loadAdminProfile() {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    const d    = snap.data();
    const nameInput  = document.getElementById("sttAdminName");
    const emailInput = document.getElementById("sttAdminEmail");
    if (nameInput)  nameInput.value  = d?.name  || "";
    if (emailInput) emailInput.value = user.email || "";
  } catch (err) { console.error(err); }
}

async function loadSecurityLog() {
  const tbody = document.getElementById("sttSecurityLog");
  try {
    const user = auth.currentUser;
    if (!user) return;

    const q    = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    const logs = snap.docs
      .map(d => d.data())
      .filter(n => n.type === "login");

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">No login activity found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(n => `
      <tr>
        <td style="font-size:0.82rem;font-weight:600;">${n.title || "Login"}</td>
        <td style="font-size:0.78rem;color:var(--adm-muted);">${n.message?.split(" at ")[0]?.replace("You logged in from ","") || "—"}</td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${n.createdAt?.seconds ? fmtDateTime(n.createdAt.seconds) : "—"}</td>
        <td><span class="adm-badge ${n.title?.includes("New Device") ? "failed" : "completed"}">${n.title?.includes("New Device") ? "New Device" : "Normal"}</span></td>
      </tr>
    `).join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">Failed to load.</td></tr>`;
  }
}

loadSettings();
loadAdminProfile();
loadSecurityLog();