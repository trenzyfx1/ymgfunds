
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, addDoc,
  collection, getDocs, query, orderBy,
  serverTimestamp, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification, Notifs } from "./notify-helper.js";

// ── CONFIG ─────────────────────────────────────
const FORMSPREE_URL = "https://formspree.io/f/mnjlrbgn";
const WITHDRAW_FEE  = 5;
const WITHDRAW_MIN  = 10;
const WITHDRAW_MAX  = 10000;

let WDR_USER    = null;
let WDR_BALANCE = 0;
let WDR_EMAIL_OK = false;
let WDR_PHONE_OK = false;
let WDR_ID_FILE  = null;

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
  });

  await loadWithdrawalHistory();
});

// ── LOGOUT ─────────────────────────────────────
document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(b => {
  if (b) b.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

// ── CHECK VERIFICATION ─────────────────────────
function checkVerification() {
  const banner  = document.getElementById("wdrVerifyBanner");
  const msgEl   = document.getElementById("wdrVerifyMsg");

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

// ── CHECK DEPOSIT COOLDOWN ─────────────────────
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

    if (workingDaysPassed < 3) {
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

// ── WITHDRAWAL METHOD ──────────────────────────
document.getElementById("wdrMethod").addEventListener("change", () => {
  const method = document.getElementById("wdrMethod").value;
  document.getElementById("wdrMomoFields").style.display  = method.includes("Mobile Money") ? "block" : "none";
  document.getElementById("wdrBankFields").style.display  = method === "Bank Transfer"      ? "block" : "none";
  document.getElementById("wdrOtherFields").style.display = method === "Other"              ? "block" : "none";
});

// ── AMOUNT INPUT ───────────────────────────────
document.getElementById("wdrAmount").addEventListener("input", () => {
  const amount  = parseFloat(document.getElementById("wdrAmount").value);
  const summary = document.getElementById("wdrSummary");

  if (!amount || isNaN(amount) || amount <= 0) { summary.style.display = "none"; return; }

  const net = amount - WITHDRAW_FEE;
  document.getElementById("wdrSumAmt").textContent = fmtGHS(amount);
  document.getElementById("wdrSumNet").textContent = fmtGHS(net > 0 ? net : 0);
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

// ── SUBMIT WITHDRAWAL ──────────────────────────
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
    const momoNum  = document.getElementById("wdrMomoNumber").value.trim();
    const momoName = document.getElementById("wdrMomoName").value.trim();
    if (!momoNum)  { errEl.textContent = "Please enter your Mobile Money number."; return; }
    if (!momoName) { errEl.textContent = "Please enter your Mobile Money account name."; return; }
  }

  if (method === "Bank Transfer") {
    const bankName    = document.getElementById("wdrBankName").value.trim();
    const bankAccount = document.getElementById("wdrBankAccount").value.trim();
    const bankAccName = document.getElementById("wdrBankAccountName").value.trim();
    if (!bankName)    { errEl.textContent = "Please enter your bank name."; return; }
    if (!bankAccount) { errEl.textContent = "Please enter your account number."; return; }
    if (!bankAccName) { errEl.textContent = "Please enter your account name."; return; }
  }

  if (method === "Other") {
    const otherDetails = document.getElementById("wdrOtherDetails").value.trim();
    if (!otherDetails) { errEl.textContent = "Please provide your payment details."; return; }
  }

  if (!amount || isNaN(amount)) { errEl.textContent = "Please enter a withdrawal amount."; return; }
  if (amount < WITHDRAW_MIN)    { errEl.textContent = `Minimum withdrawal is GHS ${WITHDRAW_MIN}.`; return; }
  if (amount > WITHDRAW_MAX)    { errEl.textContent = `Maximum withdrawal per day is GHS ${WITHDRAW_MAX.toLocaleString()}.`; return; }
  if (amount > WDR_BALANCE)     { errEl.textContent = "Insufficient balance."; return; }
  if (!WDR_ID_FILE)             { errEl.textContent = "Please upload your Ghana Card or government-issued ID."; return; }

  const btn = document.getElementById("wdrSubmitBtn");
  btn.disabled = true;
  document.getElementById("wdrBtnTxt").textContent = "Submitting...";

  try {
    const reference  = "WDR-" + Date.now();
    const netAmount  = amount - WITHDRAW_FEE;
    const now        = new Date();

    let paymentDetails = `Method: ${method}\n`;
    if (method.includes("Mobile Money")) {
      paymentDetails += `MoMo Number: ${document.getElementById("wdrMomoNumber").value.trim()}\n`;
      paymentDetails += `MoMo Name: ${document.getElementById("wdrMomoName").value.trim()}`;
    } else if (method === "Bank Transfer") {
      paymentDetails += `Bank: ${document.getElementById("wdrBankName").value.trim()}\n`;
      paymentDetails += `Account Number: ${document.getElementById("wdrBankAccount").value.trim()}\n`;
      paymentDetails += `Account Name: ${document.getElementById("wdrBankAccountName").value.trim()}`;
    } else if (method === "Other") {
      paymentDetails += document.getElementById("wdrOtherDetails").value.trim();
    }

    const idBase64 = await fileToBase64(WDR_ID_FILE);

    const uRef  = doc(db, "users", WDR_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();

    await updateDoc(uRef, { balance: (uData.balance || 0) - amount });

    await addDoc(collection(db, "users", WDR_USER.uid, "transactions"), {
      type: "withdrawal", amount: netAmount, gross: amount,
      fee: WITHDRAW_FEE, method, paymentDetails, reference,
      status: "pending", date: serverTimestamp()
    });

    await addDoc(collection(db, "withdrawalRequests"), {
      uid: WDR_USER.uid, name, email, phone,
      amount: netAmount, gross: amount, fee: WITHDRAW_FEE,
      method, paymentDetails, reference, status: "pending",
      requestDate: serverTimestamp()
    });

    // ── WITHDRAWAL NOTIFICATION ────────────────
    const wN = Notifs.withdrawalSubmitted(amount);
    await createNotification(WDR_USER.uid, wN.type, wN.title, wN.message);

    await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        subject: `Withdrawal Request from ${name}`,
        message: `
Hello Admin,

A user has requested a withdrawal on YMG Funds. Please review and process it within 2–3 working days.

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
Fee Deducted:  ${fmtGHS(WITHDRAW_FEE)}
To Be Sent:    ${fmtGHS(netAmount)}
Method:        ${method}
Payment Info:  ${paymentDetails}
Date:          ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}

━━━━━━━━━━━━━━━━━━━━━━━━
Please log in to the admin panel to approve or reject this request.

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
  document.getElementById("wdrBtnTxt").textContent = "Submit Withdrawal Request";
});

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