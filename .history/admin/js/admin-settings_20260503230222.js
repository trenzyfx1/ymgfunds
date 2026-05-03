import { db, auth } from "../../js/firebase.js";
import {
  doc, getDoc, setDoc, addDoc,
  collection, getDocs, query,
  orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  reauthenticateWithCredential,
  EmailAuthProvider, updatePassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const DEFAULT_TOGGLES = {
  depositsEnabled:      true,
  withdrawalsEnabled:   true,
  registrationsEnabled: true,
  investmentsEnabled:   true,
  loansEnabled:         true,
  referralsEnabled:     true,
  kycRequired:          true,
  maintenanceMode:      false
};

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

async function loadToggles() {
  try {
    const snap = await getDoc(doc(db, "config", "platformSettings"));

    let data;
    if (snap.exists()) {
      data = { ...DEFAULT_TOGGLES, ...snap.data() };
    } else {
      data = { ...DEFAULT_TOGGLES };
      await setDoc(doc(db, "config", "platformSettings"), DEFAULT_TOGGLES);
    }

    Object.keys(DEFAULT_TOGGLES).forEach(key => {
      const sw = document.getElementById(`sw_${key}`);
      if (!sw) return;
      sw.checked = data[key] === true || (data[key] === undefined && DEFAULT_TOGGLES[key] === true);
    });

  } catch (err) {
    console.error("Load toggles error:", err);
    showToast("Failed to load platform status. Check Firestore rules.", "error");
    Object.keys(DEFAULT_TOGGLES).forEach(key => {
      const sw = document.getElementById(`sw_${key}`);
      if (sw) sw.checked = DEFAULT_TOGGLES[key];
    });
  }
}

window.saveToggle = async function(key, value) {
  const sw = document.getElementById(`sw_${key}`);
  try {
    await setDoc(doc(db, "config", "platformSettings"), { [key]: value }, { merge: true });
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, s => s.toUpperCase())
      .replace(" Enabled", "")
      .trim();
    showToast(`${label} ${value ? "enabled ✓" : "disabled ✗"}`, value ? "success" : "error");
  } catch (err) {
    console.error(err);
    showToast("Failed to update. Please check your Firestore rules.", "error");
    if (sw) sw.checked = !value;
  }
};

document.getElementById("sttSaveProfile")?.addEventListener("click", async () => {
  setErr("sttProfileErr", "");
  const name = document.getElementById("sttAdminName")?.value.trim();
  if (!name) { setErr("sttProfileErr", "Please enter a display name."); return; }

  const btn = document.getElementById("sttSaveProfile");
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const user = auth.currentUser;
    await setDoc(doc(db, "users", user.uid), { name }, { merge: true });
    document.getElementById("admName").textContent = name;
    showToast("Profile updated successfully.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to update profile.", "error");
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Profile';
});

document.getElementById("sttChangePw")?.addEventListener("click", async () => {
  setErr("sttPwErr", "");
  const currentPw = document.getElementById("sttCurrentPw")?.value;
  const newPw     = document.getElementById("sttNewPw")?.value;
  const confirmPw = document.getElementById("sttConfirmPw")?.value;

  if (!currentPw)             { setErr("sttPwErr", "Enter your current password."); return; }
  if (!newPw || newPw.length < 8) { setErr("sttPwErr", "New password must be at least 8 characters."); return; }
  if (newPw !== confirmPw)    { setErr("sttPwErr", "Passwords do not match."); return; }
  if (newPw === currentPw)    { setErr("sttPwErr", "New password must be different from current password."); return; }

  const btn = document.getElementById("sttChangePw");
  btn.disabled  = true;
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
      message:   "Your admin account password was changed successfully.",
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

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
});

async function loadAdminProfile() {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const snap       = await getDoc(doc(db, "users", user.uid));
    const d          = snap.data();
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
      limit(15)
    );
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => d.data()).filter(n => n.type === "login");

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">No login activity found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(n => {
      const isNewDevice = n.title?.includes("New Device");
      const device      = n.message?.split(" at ")[0]
        ?.replace("Your account was accessed from a new device: ", "")
        ?.replace("You logged in from ", "") || "—";
      const timeStr = n.message?.split(" at ")[1]?.replace(". If this wasn't you, change your password immediately.", "") || "—";

      return `
        <tr>
          <td style="font-size:0.82rem;font-weight:600;color:${isNewDevice ? "var(--adm-orange)" : "var(--adm-text)"};">
            ${isNewDevice ? '<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;color:var(--adm-orange);"></i>' : '<i class="fa-solid fa-circle-check" style="margin-right:6px;color:var(--adm-green);"></i>'}
            ${n.title || "Login"}
          </td>
          <td style="font-size:0.78rem;color:var(--adm-muted);">${device}</td>
          <td style="font-size:0.75rem;color:var(--adm-muted);">${n.createdAt?.seconds ? fmtDateTime(n.createdAt.seconds) : timeStr}</td>
          <td><span class="adm-badge ${isNewDevice ? "failed" : "completed"}">${isNewDevice ? "⚠ New Device" : "Normal"}</span></td>
        </tr>`;
    }).join("");

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">Failed to load security log.</td></tr>`;
  }
}

loadToggles();

function waitForAuth(callback, maxWait = 5000) {
  const start = Date.now();
  const check = () => {
    const user = auth.currentUser;
    if (user) { callback(user); return; }
    if (Date.now() - start > maxWait) {
      const tbody = document.getElementById("sttSecurityLog");
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">Could not load. Please refresh the page.</td></tr>`;
      return;
    }
    setTimeout(check, 200);
  };
  check();
}

waitForAuth(() => {
  loadAdminProfile();
  loadSecurityLog();
});