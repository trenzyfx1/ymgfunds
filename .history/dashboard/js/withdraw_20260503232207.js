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
import { getPlatformSettings } from "./platform-settings.js";

const EMAILJS_PUBLIC_KEY  = "ZqK6LPwWsNPZ6uALM";
const EMAILJS_SERVICE_ID  = "service_xzw2n4j";
const EMAILJS_TEMPLATE_ID = "template_pk592nd";
const FORMSPREE_URL       = "https://formspree.io/f/xqewrwyz";
const WITHDRAW_FEE_RATE   = 0.03;
const WITHDRAW_FEE_MIN    = 3;
const WITHDRAW_MIN        = 10;
const WITHDRAW_MAX        = 10000;
const MIN_BALANCE         = 50;
const COOLDOWN_DAYS       = 3;

const MOMO_NETWORK_CODES = {
  "MTN Mobile Money": "MTN",
  "Vodafone Cash":    "VOD",
  "AirtelTigo Money": "ATL"
};

let WDR_USER        = null;
let WDR_BALANCE     = 0;
let WDR_EMAIL_OK    = false;
let WDR_PHONE_OK    = false;
let WDR_ID_FILE     = null;
let WDR_ACCT_LOCKED = false;
let WDR_SETTINGS    = null;
let changeOtpCode   = null;
let changeOtpExpiry = null;
let changeResendInterval = null;

emailjs.init(EMAILJS_PUBLIC_KEY);

function calcFee(amount) {
  return Math.max(WITHDRAW_FEE_MIN, parseFloat((amount * WITHDRAW_FEE_RATE).toFixed(2)));
}

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

function showPlatformBanner(message) {
  const banner = document.getElementById("wdrPlatformBanner");
  const msgEl  = document.getElementById("wdrPlatformMsg");
  if (banner) banner.style.display = "flex";
  if (msgEl)  msgEl.textContent    = message;
  disableForm();
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
      if (new Date(tx.date.seconds * 1000).toLocaleDateString("en-GB") === todayStr) {
        total += tx.gross || tx.amount || 0;
      }
    });
    return total;
  } catch (err) {
    console.error("Daily withdrawal check error:", err);
    return 0;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  WDR_USER = user;

  await user.reload();
  WDR_EMAIL_OK = user.emailVerified;

  WDR_SETTINGS = await getPlatformSettings();

  if (WDR_SETTINGS.maintenanceMode) {
    showPlatformBanner("The platform is currently under maintenance. Withdrawals are temporarily unavailable.");
    return;
  }

  if (!WDR_SETTINGS.withdrawalsEnabled) {
    showPlatformBanner("Withdrawals are temporarily disabled by the administrator. Please try again later.");
    return;
  }

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

    if (WDR_SETTINGS?.kycRequired) {
      checkVerification();
    } else {
      document.getElementById("wdrVerifyBanner").style.display = "none";
      enableForm();
    }

    await checkDepositCooldown();
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
    banner.style.display = "flex"; msgEl.textContent = "You must verify both your email address and phone number before you can withdraw."; disableForm(); return;
  }
  if (!WDR_EMAIL_OK) {
    banner.style.display = "flex"; msgEl.textContent = "You must verify your email address before you can withdraw. Go to Settings."; disableForm(); return;
  }
  if (!WDR_PHONE_OK) {
    banner.style.display = "flex"; msgEl.textContent = "You must verify your phone number before you can withdraw. Go to Settings."; disableForm(); return;
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
      banner.style.display = "flex"; disableForm();
    } else {
      banner.style.display = "none";
      if (WDR_EMAIL_OK && WDR_PHONE_OK) enableForm();
    }
  } catch (err) { console.error("Cooldown check error:", err); }
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
  if (WDR_BALANCE <= MIN_BALANCE) { banner.style.display = "flex"; disableForm(); }
  else banner.style.display = "none";
}

function loadLockedAccount(saved) {
  const banner = document.getElementById("wdrLockedBanner");
  const tag    = document.getElementById("wdrAccountLockedTag");
  const warn   = document.getElementById("wdrFirstTimeWarn");
  if (banner) banner.style.display = "flex";
  if (tag)    tag.style.display    = "inline-flex";
  if (warn)   warn.style.display   = "none";

  const method = document.getElementById("wdrMethod");
  if (method) { method.value = saved.method || ""; method.disabled = true; showMethodFields(saved.method); }

  if (saved.momoNumber) {
    setAndLock("wdrMomoNumber", saved.momoNumber);
    setAndLock("wdrMomoName",   saved.momoName || "");
  }
  if (saved.bankName) {
    const bankSel = document.getElementById("wdrBankName");
    if (bankSel) { bankSel.value = saved.bankName; bankSel.disabled = true; }
    setAndLock("wdrBankAccount",     saved.bankAccount || "");
    setAndLock("wdrBankAccountName", saved.bankAccountName || "");
  }
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

function unlockAllFields() {
  const method = document.getElementById("wdrMethod");
  if (method) method.disabled = false;

  ["wdrMomoNumber", "wdrMomoName", "wdrBankAccount", "wdrBankAccountName"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = false; el.value = ""; el.style.background = ""; el.style.borderColor = ""; el.style.color = "";
  });

  const bankSel = document.getElementById("wdrBankName");
  if (bankSel) { bankSel.disabled = false; bankSel.value = ""; }

  const tag    = document.getElementById("wdrAccountLockedTag");
  const banner = document.getElementById("wdrLockedBanner");
  const warn   = document.getElementById("wdrFirstTimeWarn");
  if (tag)    tag.style.display    = "none";
  if (banner) banner.style.display = "none";
  if (warn)   warn.style.display   = "block";

  WDR_ACCT_LOCKED = false;
  if (method) { method.value = ""; showMethodFields(""); }
}

function showMethodFields(method) {
  const isMomo = method === "MTN Mobile Money" || method === "Vodafone Cash" || method === "AirtelTigo Money";
  document.getElementById("wdrMomoFields").style.display = isMomo                    ? "block" : "none";
  document.getElementById("wdrBankFields").style.display = method === "Bank Transfer" ? "block" : "none";
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
  if (remEl) { remEl.textContent = fmtGHS(remaining); remEl.style.color = remaining < MIN_BALANCE ? "#dc2626" : "var(--text-main)"; }
  summary.style.display = "block";
});

document.getElementById("wdrIdFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { document.getElementById("wdrError").textContent = "File too large. Maximum size is 5MB."; return; }
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

document.getElementById("wdrSubmitBtn").addEventListener("click", async () => {
  const name   = document.getElementById("wdrName").value.trim();
  const email  = document.getElementById("wdrEmail").value.trim();
  const phone  = document.getElementById("wdrPhone").value.trim();
  const method = document.getElementById("wdrMethod").value;
  const amount = parseFloat(document.getElementById("wdrAmount").value);
  const errEl  = document.getElementById("wdrError");
  errEl.textContent = "";

  if (!WDR_SETTINGS) WDR_SETTINGS = await getPlatformSettings();

  if (WDR_SETTINGS.maintenanceMode || !WDR_SETTINGS.withdrawalsEnabled) {
    errEl.textContent = "Withdrawals are currently unavailable. Please try again later.";
    return;
  }

  if (!name)   { errEl.textContent = "Please enter your full name."; return; }
  if (!email)  { errEl.textContent = "Please enter your email address."; return; }
  if (!phone)  { errEl.textContent = "Please enter your phone number."; return; }
  if (!method) { errEl.textContent = "Please select a withdrawal method."; return; }

  const isMomo = method === "MTN Mobile Money" || method === "Vodafone Cash" || method === "AirtelTigo Money";
  if (isMomo) {
    const momoNum = document.getElementById("wdrMomoNumber").value.trim();
    if (!momoNum)                      { errEl.textContent = "Please enter your Mobile Money number."; return; }
    if (!/^0[0-9]{9}$/.test(momoNum)) { errEl.textContent = "Enter a valid 10-digit MoMo number starting with 0 (e.g. 0241234567)."; return; }
    if (!document.getElementById("wdrMomoName").value.trim()) { errEl.textContent = "Please enter the name on your MoMo account."; return; }
  }
  if (method === "Bank Transfer") {
    if (!document.getElementById("wdrBankName").value) { errEl.textContent = "Please select your bank."; return; }
    const acctNum = document.getElementById("wdrBankAccount").value.trim();
    if (!acctNum)                        { errEl.textContent = "Please enter your account number."; return; }
    if (!/^[0-9]{8,16}$/.test(acctNum)) { errEl.textContent = "Account number must be 8–16 digits only."; return; }
    if (!document.getElementById("wdrBankAccountName").value.trim()) { errEl.textContent = "Please enter the name on your bank account."; return; }
  }

  if (!amount || isNaN(amount)) { errEl.textContent = "Please enter a withdrawal amount."; return; }
  if (amount < WITHDRAW_MIN)    { errEl.textContent = `Minimum withdrawal is GHS ${WITHDRAW_MIN}.`; return; }
  if (amount > WITHDRAW_MAX)    { errEl.textContent = `Single withdrawal cannot exceed GHS ${WITHDRAW_MAX.toLocaleString()}.`; return; }
  if (amount > WDR_BALANCE)     { errEl.textContent = "Insufficient balance."; return; }
  if ((WDR_BALANCE - amount) < MIN_BALANCE) { errEl.textContent = `You must maintain a minimum balance of GHS ${MIN_BALANCE}. Maximum you can withdraw is ${fmtGHS(WDR_BALANCE - MIN_BALANCE)}.`; return; }

  const todayTotal = await getDailyWithdrawalTotal();
  if (todayTotal >= WITHDRAW_MAX) { errEl.textContent = `Daily limit of GHS ${WITHDRAW_MAX.toLocaleString()} reached.`; return; }
  if (todayTotal + amount > WITHDRAW_MAX) { errEl.textContent = `This would exceed your daily limit. Maximum you can withdraw now is ${fmtGHS(WITHDRAW_MAX - todayTotal)}.`; return; }
  if (!WDR_ID_FILE) { errEl.textContent = "Please upload your Ghana Card or government-issued ID."; return; }

  openPwModal(amount);
});

function openPwModal(amount) {
  const fee    = calcFee(amount);
  const net    = amount - fee;
  const method = document.getElementById("wdrMethod").value;
  const isMomo = method === "MTN Mobile Money" || method === "Vodafone Cash" || method === "AirtelTigo Money";
  let acctSummary = method;
  if (isMomo) acctSummary = `${method} — ${document.getElementById("wdrMomoNumber").value.trim()}`;
  else if (method === "Bank Transfer") acctSummary = `${document.getElementById("wdrBankName").value} — ${document.getElementById("wdrBankAccount").value.trim()}`;

  const sumAmt  = document.getElementById("wdrPwSumAmt");  if (sumAmt)  sumAmt.textContent  = fmtGHS(amount);
  const sumFee  = document.getElementById("wdrPwSumFee");  if (sumFee)  sumFee.textContent  = `− ${fmtGHS(fee)}`;
  const sumNet  = document.getElementById("wdrPwSumNet");  if (sumNet)  sumNet.textContent  = fmtGHS(net > 0 ? net : 0);
  const sumAcct = document.getElementById("wdrPwSumAcct"); if (sumAcct) sumAcct.textContent = acctSummary;

  document.getElementById("wdrPwInput").value     = "";
  document.getElementById("wdrPwErr").textContent = "";
  document.getElementById("wdrPwModal").classList.add("inv-modal-active");
  setTimeout(() => document.getElementById("wdrPwInput").focus(), 300);
}

document.getElementById("wdrPwModalClose")?.addEventListener("click", () => { document.getElementById("wdrPwModal").classList.remove("inv-modal-active"); });
document.getElementById("wdrPwModal")?.addEventListener("click", (e) => { if (e.target.id === "wdrPwModal") document.getElementById("wdrPwModal").classList.remove("inv-modal-active"); });
document.getElementById("wdrPwEye")?.addEventListener("click", () => {
  const inp = document.getElementById("wdrPwInput"); const ico = document.getElementById("wdrPwEyeIco");
  const hidden = inp.type === "password"; inp.type = hidden ? "text" : "password"; ico.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
});

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
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") { errEl.textContent = "Incorrect password. Please try again."; }
    else { errEl.textContent = "Verification failed. Please try again."; }
  }
  btn.disabled = false;
  document.getElementById("wdrPwBtnTxt").textContent = "Confirm & Submit Withdrawal";
});

async function processWithdrawal() {
  const name   = document.getElementById("wdrName").value.trim();
  const email  = document.getElementById("wdrEmail").value.trim();
  const phone  = document.getElementById("wdrPhone").value.trim();
  const method = document.getElementById("wdrMethod").value;
  const amount = parseFloat(document.getElementById("wdrAmount").value);
  const errEl  = document.getElementById("wdrError");
  const btn    = document.getElementById("wdrSubmitBtn");
  btn.disabled = true;
  document.getElementById("wdrBtnTxt").textContent = "Submitting...";

  try {
    const fee       = calcFee(amount);
    const netAmount = parseFloat((amount - fee).toFixed(2));
    const reference = "WDR-" + Date.now();
    const now       = new Date();
    const isMomo    = method === "MTN Mobile Money" || method === "Vodafone Cash" || method === "AirtelTigo Money";

    let paymentDetails = `Method: ${method}\n`;
    let savedAccount   = { method };
    let paystackData   = {};

    if (isMomo) {
      const momoNum     = document.getElementById("wdrMomoNumber").value.trim();
      const momoName    = document.getElementById("wdrMomoName").value.trim();
      const networkCode = MOMO_NETWORK_CODES[method] || "MTN";
      paymentDetails   += `MoMo Number: ${momoNum}\nMoMo Name: ${momoName}\nNetwork: ${method}`;
      savedAccount      = { method, momoNumber: momoNum, momoName };
      paystackData      = { type: "mobile_money", accountNumber: momoNum, accountName: momoName, bankCode: networkCode, currency: "GHS" };
    } else if (method === "Bank Transfer") {
      const bankName    = document.getElementById("wdrBankName").value;
      const bankAccount = document.getElementById("wdrBankAccount").value.trim();
      const bankAccName = document.getElementById("wdrBankAccountName").value.trim();
      paymentDetails   += `Bank: ${bankName}\nAccount Number: ${bankAccount}\nAccount Name: ${bankAccName}`;
      savedAccount      = { method, bankName, bankAccount, bankAccountName: bankAccName };
      paystackData      = { type: "ghipss", accountNumber: bankAccount, accountName: bankAccName, bankName, currency: "GHS" };
    }

    const idBase64 = await fileToBase64(WDR_ID_FILE);
    const uRef     = doc(db, "users", WDR_USER.uid);
    const uSnap    = await getDoc(uRef);
    const uData    = uSnap.data();

    const updateObj = { balance: (uData.balance || 0) - amount };
    if (!WDR_ACCT_LOCKED) { updateObj.withdrawalAccountLocked = true; updateObj.savedWithdrawalAccount = savedAccount; }
    await updateDoc(uRef, updateObj);

    await addDoc(collection(db, "users", WDR_USER.uid, "transactions"), {
      type: "withdrawal", amount: netAmount, gross: amount, fee, method, paymentDetails, reference, status: "pending", date: serverTimestamp()
    });

    await addDoc(collection(db, "withdrawalRequests"), {
      uid: WDR_USER.uid, name, email, phone, amount: netAmount, gross: amount, fee, method, paymentDetails, paystackData, reference, status: "pending", requestDate: serverTimestamp()
    });

    const wN = Notifs.withdrawalSubmitted(amount);
    await createNotification(WDR_USER.uid, wN.type, wN.title, wN.message);

    await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        subject: `Withdrawal Request — ${name} — ${reference}`,
        message: `YMG IQ Withdrawal Request\n\nReference: ${reference}\nUser: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nAmount: ${fmtGHS(amount)}\nFee (3%): ${fmtGHS(fee)}\nTo Be Sent: ${fmtGHS(netAmount)}\nMethod: ${method}\nPayment Info: ${paymentDetails}\nDate: ${now.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}\nAccount Locked: ${!WDR_ACCT_LOCKED ? "YES — First withdrawal, account now locked" : "Already locked"}`,
        id_document: idBase64
      })
    });

    document.getElementById("wdrSuccess").style.display = "flex";
    document.getElementById("wdrSummary").style.display = "none";
    document.getElementById("wdrAmount").value          = "";
    await loadWithdrawalHistory();

  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("wdrBtnTxt").textContent = "Continue to Password Verification";
}

document.getElementById("wdrChangeAcctBtn")?.addEventListener("click", () => {
  const snap = document.getElementById("wdrChangeEmailDisplay");
  if (snap) snap.textContent = WDR_USER?.email || "";
  document.getElementById("wdrOtpStep").style.display       = "block";
  document.getElementById("wdrOtpVerifyStep").style.display = "none";
  document.getElementById("wdrOtpSendErr").textContent      = "";
  changeOtpCode = null;
  document.getElementById("wdrChangeAcctModal").classList.add("inv-modal-active");
});

document.getElementById("wdrChangeAcctClose")?.addEventListener("click", () => { document.getElementById("wdrChangeAcctModal").classList.remove("inv-modal-active"); });
document.getElementById("wdrChangeAcctModal")?.addEventListener("click", (e) => { if (e.target.id === "wdrChangeAcctModal") document.getElementById("wdrChangeAcctModal").classList.remove("inv-modal-active"); });

document.getElementById("wdrSendChangeOtpBtn")?.addEventListener("click", async () => {
  const btn   = document.getElementById("wdrSendChangeOtpBtn");
  const errEl = document.getElementById("wdrOtpSendErr");
  errEl.textContent = "";
  btn.disabled = true;
  document.getElementById("wdrSendOtpTxt").textContent = "Sending...";

  try {
    const snap  = await getDoc(doc(db, "users", WDR_USER.uid));
    const d     = snap.data();
    const email = d?.email || WDR_USER.email;
    const name  = d?.name  || "User";

    changeOtpCode   = Math.floor(100000 + Math.random() * 900000).toString();
    changeOtpExpiry = Date.now() + 5 * 60 * 1000;

    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_name: name, to_email: email, otp_code: changeOtpCode });

    document.getElementById("wdrOtpStep").style.display       = "none";
    document.getElementById("wdrOtpVerifyStep").style.display = "block";
    document.querySelectorAll(".stt-otp-box").forEach(b => { b.value = ""; });
    document.getElementById("wdrOtpVerifyErr").textContent = "";
    document.querySelectorAll(".stt-otp-box")[0]?.focus();
    startChangeResendTimer();

  } catch (err) {
    console.error(err);
    errEl.textContent = "Failed to send code. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("wdrSendOtpTxt").textContent = "Send Verification Code";
});

function startChangeResendTimer() {
  let seconds = 90;
  const resendBtn = document.getElementById("wdrResendChangeOtp");
  const timerEl   = document.getElementById("wdrOtpResendTimer");
  if (resendBtn) resendBtn.disabled = true;
  if (timerEl)   timerEl.textContent = ` (${seconds}s)`;
  clearInterval(changeResendInterval);
  changeResendInterval = setInterval(() => {
    seconds--;
    if (timerEl) timerEl.textContent = ` (${seconds}s)`;
    if (seconds <= 0) { clearInterval(changeResendInterval); if (resendBtn) resendBtn.disabled = false; if (timerEl) timerEl.textContent = ""; }
  }, 1000);
}

document.getElementById("wdrResendChangeOtp")?.addEventListener("click", () => {
  document.getElementById("wdrOtpStep").style.display       = "block";
  document.getElementById("wdrOtpVerifyStep").style.display = "none";
  document.getElementById("wdrSendChangeOtpBtn")?.click();
});

document.querySelectorAll(".stt-otp-box").forEach((box, i, boxes) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(0, 1);
    if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
  });
  box.addEventListener("keydown", e => { if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus(); });
});

document.getElementById("wdrVerifyChangeOtpBtn")?.addEventListener("click", async () => {
  const otp   = Array.from(document.querySelectorAll(".stt-otp-box")).map(b => b.value).join("");
  const errEl = document.getElementById("wdrOtpVerifyErr");
  const btn   = document.getElementById("wdrVerifyChangeOtpBtn");
  errEl.textContent = "";

  if (otp.length < 6) { errEl.textContent = "Please enter the full 6-digit code."; return; }
  if (!changeOtpCode) { errEl.textContent = "Session expired. Please request a new code."; return; }
  if (Date.now() > changeOtpExpiry) { errEl.textContent = "Code has expired. Please request a new one."; changeOtpCode = null; return; }
  if (otp !== changeOtpCode) { errEl.textContent = "Incorrect code. Please try again."; document.querySelectorAll(".stt-otp-box").forEach(b => b.value = ""); document.querySelectorAll(".stt-otp-box")[0]?.focus(); return; }

  btn.disabled = true;
  document.getElementById("wdrVerifyOtpTxt").textContent = "Verifying...";

  try {
    await updateDoc(doc(db, "users", WDR_USER.uid), { withdrawalAccountLocked: false, savedWithdrawalAccount: null });
    changeOtpCode = null;
    document.getElementById("wdrChangeAcctModal").classList.remove("inv-modal-active");
    unlockAllFields();
    await createNotification(WDR_USER.uid, "security", "Withdrawal Account Unlocked 🔓", "Your withdrawal account has been unlocked. Please enter your new payment details and submit a withdrawal to lock a new account.");
  } catch (err) {
    console.error(err);
    errEl.textContent = "Failed to unlock account. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("wdrVerifyOtpTxt").textContent = "Verify Code";
});

async function loadWithdrawalHistory() {
  const tbody = document.getElementById("wdrHistoryBody");
  tbody.innerHTML = `<tr><td colspan="6" class="wdr-table-msg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
  try {
    const q    = query(collection(db, "users", WDR_USER.uid, "transactions"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    const withdrawals = [];
    snap.forEach(ds => { const tx = ds.data(); if (tx.type === "withdrawal") withdrawals.push(tx); });
    if (withdrawals.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="wdr-table-msg">No withdrawals yet.</td></tr>`; return; }
    tbody.innerHTML = "";
    withdrawals.forEach(tx => {
      const date        = tx.date?.seconds ? new Date(tx.date.seconds * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";
      const statusClass = tx.status === "completed" ? "success" : tx.status === "failed" ? "danger" : "pending";
      tbody.innerHTML  += `<tr><td><span class="wdr-ref-tag">${tx.reference || "—"}</span></td><td class="wdr-amount-neg">−${fmtGHS(tx.gross || tx.amount || 0)}</td><td class="wdr-fee-cell">−${fmtGHS(tx.fee || 0)}</td><td>${tx.method || "—"}</td><td>${date}</td><td><span class="wdr-status ${statusClass}">${tx.status || "pending"}</span></td></tr>`;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="wdr-table-msg">Failed to load. Please refresh.</td></tr>`;
  }
}