import "./init.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, addDoc,
  collection, getDocs, query, orderBy,
  serverTimestamp, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification, Notifs } from "./notify-helper.js";

const FORMSPREE_URL      = "https://formspree.io/f/xqewrwyz";
const WITHDRAW_FEE_RATE  = 0.03;  
const WITHDRAW_FEE_MIN   = 3;    
const WITHDRAW_MIN       = 10;
const WITHDRAW_MAX       = 10000; 
const MIN_BALANCE        = 50;
const COOLDOWN_DAYS      = 3;

let WDR_USER        = null;
let WDR_BALANCE     = 0;
let WDR_EMAIL_OK    = false;
let WDR_PHONE_OK    = false;
let WDR_ID_FILE     = null;
let WDR_ACCT_LOCKED = false;

function calcFee(amount) {
  return Math.max(WITHDRAW_FEE_MIN, parseFloat((amount * WITHDRAW_FEE_RATE).toFixed(2)));
}

async function getDailyWithdrawalTotal() {
  try {
    const q    = query(collection(db, "users", WDR_USER.uid, "transactions"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    const todayStr = new Date().toLocaleDateString("en-GB");
    let total = 0;

    snap.forEach(ds => {
      const tx = ds.data();
      if (tx.type !== "withdrawal") return;
      if (!tx.date?.seconds) return;
      const txDateStr = new Date(tx.date.seconds * 1000).toLocaleDateString("en-GB");
      if (txDateStr === todayStr) {
        total += tx.gross || tx.amount || 0;
      }
    });

    return total;
  } catch (err) {
    console.error("Daily withdrawal check error:", err);
    return 0;
  }
}

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  WDR_USER = user;

  await user.reload();
  WDR_EMAIL_OK = user.emailVerified;

  onSnapshot(doc(db, "users", user.uid), async (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    const name     = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;

    WDR_BALANCE  = typeof d.balance === "number" ? d.balance : 0;
    WDR_PHONE_OK = d.phoneVerified || false;

    document.getElementById("wdrAvailBal").textContent = fmtGHS(WDR_BALANCE);

    const nameEl  = document.getElementById("wdrName");
    const emailEl = document.getElementById("wdrEmail");
    const phoneEl = document.getElementById("wdrPhone");
    if (nameEl  && !nameEl.value)  nameEl.value  = d.name  || "";
    if (emailEl && !emailEl.value) emailEl.value = d.email || user.email || "";
    if (phoneEl && !phoneEl.value) phoneEl.value = d.phone || "";

    // checkVerification();
    // await checkDepositCooldown();
    checkMinBalance();

    WDR_ACCT_LOCKED = d.withdrawalAccountLocked || false;
    if (WDR_ACCT_LOCKED && d.savedWithdrawalAccount) {
      loadLockedAccount(d.savedWithdrawalAccount);
    } else {
      const warn = document.getElementById("wdrFirstTimeWarn");
      if (warn) warn.style.display = "block";
    }
  });

  await loadWithdrawalHistory();
});

document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(b => {
  if (b) b.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

function checkVerification() {
  const banner = document.getElementById("wdrVerifyBanner");
  const msgEl  = document.getElementById("wdrVerifyMsg");

  if (!WDR_EMAIL_OK && !WDR_PHONE_OK) {
    banner.style.display = "flex";
    msgEl.textContent = "You must verify both your email address and phone number before you can withdraw.";
    disableForm(); return;
  }
  if (!WDR_EMAIL_OK) {
    banner.style.display = "flex";
    msgEl.textContent = "You must verify your email address before you can withdraw. Go to Settings.";
    disableForm(); return;
  }
  if (!WDR_PHONE_OK) {
    banner.style.display = "flex";
    msgEl.textContent = "You must verify your phone number before you can withdraw. Go to Settings.";
    disableForm(); return;
  }
  banner.style.display = "none";
  enableForm();
}

async function checkDepositCooldown() {
  try {
    const q    = query(collection(db, "users", WDR_USER.uid, "transactions"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    let lastDepositDate = null;
    snap.forEach(ds => {
      const tx = ds.data();
      if (tx.type === "deposit" && !lastDepositDate) {
        lastDepositDate = tx.date?.seconds ? new Date(tx.date.seconds * 1000) : null;
      }
    });

    if (!lastDepositDate) return;

    const workingDaysPassed = countWorkingDays(lastDepositDate, new Date());
    const banner = document.getElementById("wdrCooldownBanner");

    if (workingDaysPassed < COOLDOWN_DAYS) {
      banner.style.display = "flex";
      disableForm();
    } else {
      banner.style.display = "none";
      if (WDR_EMAIL_OK && WDR_PHONE_OK) enableForm();
    }
  } catch (err) {
    console.error("Cooldown check error:", err);
  }
}

function countWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  current.setDate(current.getDate() + 1);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function disableForm() {
  const btn = document.getElementById("wdrSubmitBtn");
  if (btn) btn.disabled = true;
}

function enableForm() {
  const btn = document.getElementById("wdrSubmitBtn");
  if (btn) btn.disabled = false;
}

function checkMinBalance() {
  const banner = document.getElementById("wdrMinBalBanner");
  if (!banner) return;
  if (WDR_BALANCE <= MIN_BALANCE) {
    banner.style.display = "flex";
    disableForm();
  } else {
    banner.style.display = "none";
  }
}

function loadLockedAccount(saved) {
  const banner = document.getElementById("wdrLockedBanner");
  const tag    = document.getElementById("wdrAccountLockedTag");
  const warn   = document.getElementById("wdrFirstTimeWarn");
  if (banner) banner.style.display = "flex";
  if (tag)    tag.style.display    = "inline-flex";
  if (warn)   warn.style.display   = "none";

  const method = document.getElementById("wdrMethod");
  if (method) {
    method.value    = saved.method || "";
    method.disabled = true;
    showMethodFields(saved.method);
  }

  if (saved.momoNumber) {
    setAndLock("wdrMomoNumber", saved.momoNumber);
    setAndLock("wdrMomoName",   saved.momoName || "");
  }
  if (saved.bankName) {
    setAndLock("wdrBankName",        saved.bankName);
    setAndLock("wdrBankAccount",     saved.bankAccount || "");
    setAndLock("wdrBankAccountName", saved.bankAccountName || "");
  }
  if (saved.otherDetails) setAndLock("wdrOtherDetails", saved.otherDetails);
}

function setAndLock(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value             = val;
  el.disabled          = true;
  el.style.background  = "var(--hover-bg)";
  el.style.borderColor = "rgba(201,168,76,0.3)";
  el.style.color       = "var(--text-muted)";
}

function showMethodFields(method) {
  document.getElementById("wdrMomoFields").style.display  = method?.includes("Mobile Money") ? "block" : "none";
  document.getElementById("wdrBankFields").style.display  = method === "Bank Transfer"        ? "block" : "none";
  document.getElementById("wdrOtherFields").style.display = method === "Other"                ? "block" : "none";
}

document.getElementById("wdrMethod").addEventListener("change", () => {
  if (!WDR_ACCT_LOCKED) showMethodFields(document.getElementById("wdrMethod").value);
});

document.getElementById("wdrAmount").addEventListener("input", () => {
  const amount  = parseFloat(document.getElementById("wdrAmount").value);
  const summary = document.getElementById("wdrSummary");

  if (!amount || isNaN(amount) || amount <= 0) { summary.style.display = "none"; return; }

  const fee       = calcFee(amount);
  const net       = amount - fee;
  const remaining = WDR_BALANCE - amount;

  document.getElementById("wdrSumAmt").textContent = fmtGHS(amount);
  document.getElementById("wdrSumFee").textContent = `− ${fmtGHS(fee)}`;
  document.getElementById("wdrSumNet").textContent = fmtGHS(net > 0 ? net : 0);

  const remEl = document.getElementById("wdrSumRemaining");
  if (remEl) {
    remEl.textContent = fmtGHS(remaining);
    remEl.style.color = remaining < MIN_BALANCE ? "#dc2626" : "var(--text-main)";
  }

  summary.style.display = "block";
});

// ── ID FILE UPLOAD ─────────────────────────────
document.getElementById("wdrIdFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    document.getElementById("wdrError").textContent = "File too large. Maximum size is 5MB.";
    return;
  }
  WDR_ID_FILE = file;
  document.getElementById("wdrIdFileName").textContent    = file.name;
  document.getElementById("wdrIdUploadBox").style.display = "none";
  document.getElementById("wdrIdPreview").style.display   = "flex";
  document.getElementById("wdrError").textContent         = "";
});

document.getElementById("wdrIdRemove").addEventListener("click", () => {
  WDR_ID_FILE = null;
  document.getElementById("wdrIdFile").value              = "";
  document.getElementById("wdrIdUploadBox").style.display = "flex";
  document.getElementById("wdrIdPreview").style.display   = "none";
});

// ── SUBMIT → opens password modal ─────────────
document.getElementById("wdrSubmitBtn").addEventListener("click", async () => {
  const name   = document.getElementById("wdrName").value.trim();
  const email  = document.getElementById("wdrEmail").value.trim();
  const phone  = document.getElementById("wdrPhone").value.trim();
  const method = document.getElementById("wdrMethod").value;
  const amount = parseFloat(document.getElementById("wdrAmount").value);
  const errEl  = document.getElementById("wdrError");
  errEl.textContent = "";

  if (!name)   { errEl.textContent = "Please enter your full name."; return; }
  if (!email)  { errEl.textContent = "Please enter your email address."; return; }
  if (!phone)  { errEl.textContent = "Please enter your phone number."; return; }
  if (!method) { errEl.textContent = "Please select a withdrawal method."; return; }

  if (method.includes("Mobile Money")) {
    if (!document.getElementById("wdrMomoNumber").value.trim()) { errEl.textContent = "Please enter your Mobile Money number."; return; }
    if (!document.getElementById("wdrMomoName").value.trim())   { errEl.textContent = "Please enter your Mobile Money account name."; return; }
  }
  if (method === "Bank Transfer") {
    if (!document.getElementById("wdrBankName").value.trim())        { errEl.textContent = "Please enter your bank name."; return; }
    if (!document.getElementById("wdrBankAccount").value.trim())     { errEl.textContent = "Please enter your account number."; return; }
    if (!document.getElementById("wdrBankAccountName").value.trim()) { errEl.textContent = "Please enter your account name."; return; }
  }
  if (method === "Other") {
    if (!document.getElementById("wdrOtherDetails").value.trim()) { errEl.textContent = "Please provide your payment details."; return; }
  }

  if (!amount || isNaN(amount)) { errEl.textContent = "Please enter a withdrawal amount."; return; }
  if (amount < WITHDRAW_MIN)    { errEl.textContent = `Minimum withdrawal is GHS ${WITHDRAW_MIN}.`; return; }
  if (amount > WITHDRAW_MAX)    { errEl.textContent = `Single withdrawal cannot exceed GHS ${WITHDRAW_MAX.toLocaleString()}.`; return; }
  if (amount > WDR_BALANCE)     { errEl.textContent = "Insufficient balance."; return; }

  if ((WDR_BALANCE - amount) < MIN_BALANCE) {
    errEl.textContent = `You must maintain a minimum balance of GHS ${MIN_BALANCE}. Maximum you can withdraw is ${fmtGHS(WDR_BALANCE - MIN_BALANCE)}.`;
    return;
  }

  // ── Daily limit check (across all transactions today) ──
  const todayTotal = await getDailyWithdrawalTotal();
  if (todayTotal >= WITHDRAW_MAX) {
    errEl.textContent = `You have reached the daily withdrawal limit of GHS ${WITHDRAW_MAX.toLocaleString()}. You have already withdrawn ${fmtGHS(todayTotal)} today. Please try again tomorrow.`;
    return;
  }
  if (todayTotal + amount > WITHDRAW_MAX) {
    const remaining = WITHDRAW_MAX - todayTotal;
    errEl.textContent = `Daily limit of GHS ${WITHDRAW_MAX.toLocaleString()} would be exceeded. You have already withdrawn ${fmtGHS(todayTotal)} today. Maximum you can withdraw now is ${fmtGHS(remaining)}.`;
    return;
  }

  if (!WDR_ID_FILE) { errEl.textContent = "Please upload your Ghana Card or government-issued ID."; return; }

  openPwModal(amount);
});

// ── PASSWORD MODAL ─────────────────────────────
function openPwModal(amount) {
  const fee    = calcFee(amount);
  const net    = amount - fee;
  const method = document.getElementById("wdrMethod").value;

  let acctSummary = method;
  if (method.includes("Mobile Money")) acctSummary = `${method} — ${document.getElementById("wdrMomoNumber").value.trim()}`;
  else if (method === "Bank Transfer") acctSummary = `${document.getElementById("wdrBankName").value.trim()} — ${document.getElementById("wdrBankAccount").value.trim()}`;

  const sumAmt  = document.getElementById("wdrPwSumAmt");
  const sumFee  = document.getElementById("wdrPwSumFee");
  const sumNet  = document.getElementById("wdrPwSumNet");
  const sumAcct = document.getElementById("wdrPwSumAcct");
  if (sumAmt)  sumAmt.textContent  = fmtGHS(amount);
  if (sumFee)  sumFee.textContent  = `− ${fmtGHS(fee)}`;
  if (sumNet)  sumNet.textContent  = fmtGHS(net > 0 ? net : 0);
  if (sumAcct) sumAcct.textContent = acctSummary;

  document.getElementById("wdrPwInput").value     = "";
  document.getElementById("wdrPwErr").textContent = "";
  document.getElementById("wdrPwModal").classList.add("inv-modal-active");
  setTimeout(() => document.getElementById("wdrPwInput").focus(), 300);
}

document.getElementById("wdrPwModalClose")?.addEventListener("click", () => {
  document.getElementById("wdrPwModal").classList.remove("inv-modal-active");
});
document.getElementById("wdrPwModal")?.addEventListener("click", (e) => {
  if (e.target.id === "wdrPwModal") document.getElementById("wdrPwModal").classList.remove("inv-modal-active");
});
document.getElementById("wdrPwEye")?.addEventListener("click", () => {
  const inp    = document.getElementById("wdrPwInput");
  const ico    = document.getElementById("wdrPwEyeIco");
  const hidden = inp.type === "password";
  inp.type      = hidden ? "text" : "password";
  ico.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
});

// ── PASSWORD CONFIRM → process ─────────────────
document.getElementById("wdrPwConfirm")?.addEventListener("click", async () => {
  const pw    = document.getElementById("wdrPwInput").value;
  const errEl = document.getElementById("wdrPwErr");
  const btn   = document.getElementById("wdrPwConfirm");
  errEl.textContent = "";

  if (!pw) { errEl.textContent = "Please enter your password."; return; }

  btn.disabled = true;
  document.getElementById("wdrPwBtnTxt").textContent = "Verifying...";

  try {
    const credential = EmailAuthProvider.credential(WDR_USER.email, pw);
    await reauthenticateWithCredential(WDR_USER, credential);
    document.getElementById("wdrPwModal").classList.remove("inv-modal-active");
    await processWithdrawal();
  } catch (err) {
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      errEl.textContent = "Incorrect password. Please try again.";
    } else {
      errEl.textContent = "Verification failed. Please try again.";
    }
  }

  btn.disabled = false;
  document.getElementById("wdrPwBtnTxt").textContent = "Confirm & Submit Withdrawal";
});

// ── PROCESS WITHDRAWAL ─────────────────────────
async function processWithdrawal() {
  const name   = document.getElementById("wdrName").value.trim();
  const email  = document.getElementById("wdrEmail").value.trim();
  const phone  = document.getElementById("wdrPhone").value.trim();
  const method = document.getElementById("wdrMethod").value;
  const amount = parseFloat(document.getElementById("wdrAmount").value);
  const errEl  = document.getElementById("wdrError");

  const btn = document.getElementById("wdrSubmitBtn");
  btn.disabled = true;
  document.getElementById("wdrBtnTxt").textContent = "Submitting...";

  try {
    const fee       = calcFee(amount);
    const netAmount = parseFloat((amount - fee).toFixed(2));
    const reference = "WDR-" + Date.now();
    const now       = new Date();

    let paymentDetails = `Method: ${method}\n`;
    let savedAccount   = { method };

    if (method.includes("Mobile Money")) {
      const momoNum  = document.getElementById("wdrMomoNumber").value.trim();
      const momoName = document.getElementById("wdrMomoName").value.trim();
      paymentDetails += `MoMo Number: ${momoNum}\nMoMo Name: ${momoName}`;
      savedAccount    = { method, momoNumber: momoNum, momoName };
    } else if (method === "Bank Transfer") {
      const bankName    = document.getElementById("wdrBankName").value.trim();
      const bankAccount = document.getElementById("wdrBankAccount").value.trim();
      const bankAccName = document.getElementById("wdrBankAccountName").value.trim();
      paymentDetails   += `Bank: ${bankName}\nAccount Number: ${bankAccount}\nAccount Name: ${bankAccName}`;
      savedAccount      = { method, bankName, bankAccount, bankAccountName: bankAccName };
    } else if (method === "Other") {
      const other    = document.getElementById("wdrOtherDetails").value.trim();
      paymentDetails += other;
      savedAccount   = { method, otherDetails: other };
    }

    const idBase64 = await fileToBase64(WDR_ID_FILE);

    const uRef  = doc(db, "users", WDR_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();

    const updateObj = { balance: (uData.balance || 0) - amount };
    if (!WDR_ACCT_LOCKED) {
      updateObj.withdrawalAccountLocked = true;
      updateObj.savedWithdrawalAccount  = savedAccount;
    }
    await updateDoc(uRef, updateObj);

    await addDoc(collection(db, "users", WDR_USER.uid, "transactions"), {
      type: "withdrawal", amount: netAmount, gross: amount,
      fee, method, paymentDetails, reference,
      status: "pending", date: serverTimestamp()
    });

    await addDoc(collection(db, "withdrawalRequests"), {
      uid: WDR_USER.uid, name, email, phone,
      amount: netAmount, gross: amount, fee,
      method, paymentDetails, reference,
      status: "pending", requestDate: serverTimestamp()
    });

    const wN = Notifs.withdrawalSubmitted(amount);
    await createNotification(WDR_USER.uid, wN.type, wN.title, wN.message);

    await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        subject: `Withdrawal Request from ${name}`,
        message: `
Hello Admin,

A withdrawal has been requested on YMG Funds.

━━━━━━━━━━━━━━━━━━━━━━━━
USER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━
Full Name:     ${name}
Email:         ${email}
Phone:         ${phone}

━━━━━━━━━━━━━━━━━━━━━━━━
WITHDRAWAL DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━
Reference:     ${reference}
Amount:        ${fmtGHS(amount)}
Fee (3%):      ${fmtGHS(fee)}
To Be Sent:    ${fmtGHS(netAmount)}
Method:        ${method}
Payment Info:  ${paymentDetails}
Date:          ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
Account Locked: ${!WDR_ACCT_LOCKED ? "YES — First withdrawal, account now locked" : "Already locked"}

— YMG Funds System
        `,
        id_document: idBase64
      })
    });

    document.getElementById("wdrSuccess").style.display = "flex";
    document.getElementById("wdrSummary").style.display = "none";
    document.getElementById("wdrAmount").value = "";

    await loadWithdrawalHistory();

  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("wdrBtnTxt").textContent = "Continue to Password Verification";
}

// ── LOAD WITHDRAWAL HISTORY ────────────────────
async function loadWithdrawalHistory() {
  const tbody = document.getElementById("wdrHistoryBody");
  tbody.innerHTML = `<tr><td colspan="6" class="wdr-table-msg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const q    = query(collection(db, "users", WDR_USER.uid, "transactions"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    const withdrawals = [];
    snap.forEach(ds => {
      const tx = ds.data();
      if (tx.type === "withdrawal") withdrawals.push(tx);
    });

    if (withdrawals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="wdr-table-msg">No withdrawals yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    withdrawals.forEach(tx => {
      const date = tx.date?.seconds
        ? new Date(tx.date.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "—";

      const statusClass = tx.status === "completed" ? "success"
        : tx.status === "failed" ? "danger" : "pending";

      tbody.innerHTML += `
        <tr>
          <td><span class="wdr-ref-tag">${tx.reference || "—"}</span></td>
          <td class="wdr-amount-neg">−${fmtGHS(tx.gross || tx.amount || 0)}</td>
          <td class="wdr-fee-cell">−${fmtGHS(tx.fee || 0)}</td>
          <td>${tx.method || "—"}</td>
          <td>${date}</td>
          <td><span class="wdr-status ${statusClass}">${tx.status || "pending"}</span></td>
        </tr>`;
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="wdr-table-msg">Failed to load. Please refresh.</td></tr>`;
  }
}

// ── HELPERS ────────────────────────────────────
function fmtGHS(n) {
  return "GHS " + Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}