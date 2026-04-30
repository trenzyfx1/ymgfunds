// ── DELETE ACCOUNT MODULE ──────────────────────
// Save as: dashboard/js/delete-account.js

import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, deleteDoc, getDocs,
  collection
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let DEL_USER = null;

onAuthStateChanged(auth, (user) => {
  if (user) DEL_USER = user;
});

// ── HELPERS ────────────────────────────────────
function showStep(n) {
  [1, 2, 3, 4, 5].forEach(i => {
    const el = document.getElementById(`delStep${i}`);
    if (el) el.style.display = i === n ? "block" : "none";
  });
}

function openModal() {
  showStep(1);
  document.getElementById("delConfirmInput").value = "";
  document.getElementById("delPasswordInput").value = "";
  document.getElementById("delTypeErr").textContent = "";
  document.getElementById("delPwErr").textContent = "";
  document.getElementById("delFinalErr").textContent = "";
  document.getElementById("delStep2Btn").disabled = true;
  document.getElementById("deleteModal").classList.add("stt-modal-active");
}

function closeModal() {
  document.getElementById("deleteModal").classList.remove("stt-modal-active");
}

// ── OPEN ON BUTTON CLICK ───────────────────────
document.getElementById("deleteAccountBtn")?.addEventListener("click", openModal);

// ── CLOSE BUTTONS ──────────────────────────────
["delModalClose", "delStep1Cancel", "delStep2Cancel", "delStep3Cancel", "delStep4Cancel"]
  .forEach(id => {
    document.getElementById(id)?.addEventListener("click", closeModal);
  });

document.getElementById("deleteModal")?.addEventListener("click", (e) => {
  if (e.target.id === "deleteModal") closeModal();
});

document.getElementById("delStep1Btn")?.addEventListener("click", () => {
  showStep(2);
  setTimeout(() => document.getElementById("delConfirmInput").focus(), 200);
});

document.getElementById("delConfirmInput")?.addEventListener("input", () => {
  const val  = document.getElementById("delConfirmInput").value;
  const btn  = document.getElementById("delStep2Btn");
  const err  = document.getElementById("delTypeErr");

  if (val === "DELETE") {
    btn.disabled      = false;
    err.textContent   = "";
  } else {
    btn.disabled      = true;
    err.textContent   = val.length > 0 ? 'Must be exactly "DELETE" in capitals.' : "";
  }
});

document.getElementById("delStep2Btn")?.addEventListener("click", () => {
  showStep(3);
  setTimeout(() => document.getElementById("delPasswordInput").focus(), 200);
});

document.getElementById("delEyeBtn")?.addEventListener("click", () => {
  const inp = document.getElementById("delPasswordInput");
  const ico = document.getElementById("delEyeIco");
  const hidden = inp.type === "password";
  inp.type      = hidden ? "text" : "password";
  ico.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
});

document.getElementById("delStep3Btn")?.addEventListener("click", async () => {
  const pw    = document.getElementById("delPasswordInput").value;
  const errEl = document.getElementById("delPwErr");
  const btn   = document.getElementById("delStep3Btn");
  errEl.textContent = "";

  if (!pw) { errEl.textContent = "Please enter your password."; return; }
  if (!DEL_USER) { errEl.textContent = "Session error. Please refresh."; return; }

  btn.disabled = true;
  document.getElementById("delPwSpinner").style.display = "inline-block";
  document.getElementById("delPwArrow").style.display   = "none";

  try {
    const credential = EmailAuthProvider.credential(DEL_USER.email, pw);
    await reauthenticateWithCredential(DEL_USER, credential);

    showStep(4);
    startCountdown();

  } catch (err) {
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      errEl.textContent = "Incorrect password. Please try again.";
    } else {
      errEl.textContent = "Verification failed. Please try again.";
    }
  }

  btn.disabled = false;
  document.getElementById("delPwSpinner").style.display = "none";
  document.getElementById("delPwArrow").style.display   = "inline-block";
});

function startCountdown() {
  let secs = 5;
  const btn        = document.getElementById("delFinalBtn");
  const countdownEl = document.getElementById("delCountdown");
  btn.disabled     = true;

  const timer = setInterval(() => {
    secs--;
    if (countdownEl) countdownEl.textContent = secs;
    if (secs <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      document.getElementById("delFinalTxt").innerHTML =
        '<i class="fa-solid fa-trash"></i> Delete My Account Forever';
    }
  }, 1000);
}

document.getElementById("delFinalBtn")?.addEventListener("click", async () => {
  if (!DEL_USER) return;

  showStep(5);

  try {
    const uid = DEL_USER.uid;

    const subcollections = [
      "transactions", "investments", "referrals",
      "notifications", "loanRequests"
    ];

    for (const sub of subcollections) {
      const snap = await getDocs(collection(db, "users", uid, sub));
      for (const d of snap.docs) {
        await deleteDoc(doc(db, "users", uid, sub, d.id));
      }
    }

    await deleteDoc(doc(db, "users", uid));

    await deleteUser(DEL_USER);

    sessionStorage.clear();
    window.location.replace("../index.html");

  } catch (err) {
    console.error("Delete account error:", err);
    showStep(4);
    document.getElementById("delFinalErr").textContent =
      "Failed to delete account. Please try again or contact support.";
  }
});