
import "./init.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, addDoc, updateDoc,
  collection, query, orderBy,
  serverTimestamp, Timestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification, Notifs } from "./notify-helper.js";

// ── PLAN CONFIG ────────────────────────────────
const INV_PLANS = {
  "Starter Savings":       { rate: 0.005, rateType: "weekly",  minDep: 50,    duration: null, tier: "standard" },
  "Fixed Deposit":         { rate: 0.095, rateType: "fixed",   minDep: 500,   duration: 90,   tier: "standard" },
  "Growth Plus":           { rate: 0.125, rateType: "fixed",   minDep: 1000,  duration: 182,  tier: "standard" },
  "182-Day Growth Tool":   { rate: 0.15,  rateType: "fixed",   minDep: 1000,  duration: 182,  tier: "premium"  },
  "365-Day Premium Tool":  { rate: 0.25,  rateType: "fixed",   minDep: 2000,  duration: 365,  tier: "premium"  },
  "3-Year Wealth Builder": { rate: 0.35,  rateType: "annual",  minDep: 500,   duration: 1095, tier: "premium"  }
};

// ── LOAN CONFIG ────────────────────────────────
const LOAN_PLANS = {
  "Standard Loan": { rate: 0.06, minAmt: 500,  maxAmt: 5000,  duration: 182, tier: "standard" },
  "Premium Loan":  { rate: 0.04, minAmt: 500,  maxAmt: 30000, duration: 365, tier: "premium"  }
};

const FORMSPREE_URL = "https://formspree.io/f/mnjlrbgn";

let INV_USER      = null;
let INV_PLAN      = null;
let INV_BALANCE   = 0;
let INV_STD_ON    = false;
let INV_PREM_ON   = false;
let INV_ACT_TIER  = null;
let INV_PW_ACTION = null;
let INV_PW_PLAN   = null;
let INV_LOAN_PLAN = null;

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  INV_USER = user;

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    const name = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;

    INV_BALANCE = typeof d.balance === "number" ? d.balance : 0;
    INV_STD_ON  = d.standardActivated || false;
    INV_PREM_ON = d.premiumActivated   || false;

    invSetEl("invAvailBal",    fmtGHS(d.balance  || 0));
    invSetEl("invTotalInv",    fmtGHS(d.invested || 0));
    invSetEl("invTotalProfit", fmtGHS(d.profit   || 0));

    const code = d.referralCode || user.uid.slice(0, 8).toUpperCase();
    invSetEl("invRefCode", code);
    loadPremRefStats(d, user.uid);

    const lnEl = document.getElementById("loanModalName");
    const lpEl = document.getElementById("loanModalPhone");
    if (lnEl && !lnEl.value) lnEl.value = d.name  || "";
    if (lpEl && !lpEl.value) lpEl.value = d.phone || "";

    invRefreshUI();
  });

  await invLoadHistory();
  await invRunProfitEngine();
});

// ── LOGOUT ─────────────────────────────────────
document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(b => {
  if (b) b.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

// ── REFRESH LOCK/UNLOCK UI ─────────────────────
function invRefreshUI() {
  const stdStrips  = ["istrip-starter", "istrip-fixed", "istrip-growth", "istrip-std-loan"];
  const premStrips = ["istrip-p182", "istrip-p365", "istrip-p3yr", "istrip-prem-loan", "istrip-prem-ref"];

  if (INV_STD_ON) {
    stdStrips.forEach(id => invHide(id));
    invHide("stdActBanner");
    invShow("stdDisclaimer");
    const t = document.getElementById("stdTierTag");
    if (t) { t.innerHTML = '<i class="fa-solid fa-check"></i> Activated'; t.classList.replace("inv-tier-locked", "inv-tier-active"); }
  } else {
    stdStrips.forEach(id => invShow(id));
    invShow("stdActBanner");
    invHide("stdDisclaimer");
  }

  if (INV_PREM_ON) {
    premStrips.forEach(id => invHide(id));
    invHide("premActBanner");
    invShow("premDisclaimer");
    const t = document.getElementById("premTierTag");
    if (t) { t.innerHTML = '<i class="fa-solid fa-check"></i> Activated'; t.classList.replace("inv-tier-locked", "inv-tier-active"); }
  } else {
    premStrips.forEach(id => invShow(id));
    invShow("premActBanner");
    invHide("premDisclaimer");
  }
}

// ══════════════════════════════════════════════
// PASSWORD MODAL
// ══════════════════════════════════════════════
function pwModalOpen() {
  document.getElementById("pwModalInput").value = "";
  document.getElementById("pwModalErr").textContent = "";
  document.getElementById("pwModal").classList.add("inv-modal-active");
  setTimeout(() => document.getElementById("pwModalInput").focus(), 300);
}

function pwModalClose() {
  document.getElementById("pwModal").classList.remove("inv-modal-active");
}

document.getElementById("pwModalClose").addEventListener("click", pwModalClose);
document.getElementById("pwModal").addEventListener("click", e => {
  if (e.target.id === "pwModal") pwModalClose();
});

document.getElementById("pwModalEye").addEventListener("click", () => {
  const inp = document.getElementById("pwModalInput");
  const ico = document.getElementById("pwModalEyeIco");
  const isHidden = inp.type === "password";
  inp.type = isHidden ? "text" : "password";
  ico.className = isHidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
});

document.getElementById("pwModalConfirm").addEventListener("click", async () => {
  const pw    = document.getElementById("pwModalInput").value;
  const errEl = document.getElementById("pwModalErr");
  const btn   = document.getElementById("pwModalConfirm");
  errEl.textContent = "";

  if (!pw) { errEl.textContent = "Please enter your password."; return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

  try {
    const credential = EmailAuthProvider.credential(INV_USER.email, pw);
    await reauthenticateWithCredential(INV_USER, credential);
    pwModalClose();

    if (INV_PW_ACTION === "activate") {
      const fee = INV_ACT_TIER === "standard" ? 500 : 1000;
      invSetEl("actModalTitle", INV_ACT_TIER === "standard" ? "Activate Standard Plans" : "Activate Premium Plans");
      invSetEl("actModalDesc",  `Pay a one-time GHS ${fee} fee to unlock all ${INV_ACT_TIER} plans.`);
      invSetEl("actModalFee",   `GHS ${fee.toLocaleString()}`);
      invSetEl("actModalBal",   fmtGHS(INV_BALANCE));
      invSetEl("actModalErr",   "");
      document.getElementById("actModalOk").style.display = "none";
      const ico = document.getElementById("actModalIco");
      if (ico) ico.innerHTML = INV_ACT_TIER === "premium"
        ? '<i class="fa-solid fa-crown"></i>'
        : '<i class="fa-solid fa-lock-open"></i>';
      document.getElementById("actModal").classList.add("inv-modal-active");

    } else if (INV_PW_ACTION === "invest") {
      INV_PLAN = INV_PW_PLAN;
      const cfg = INV_PLANS[INV_PLAN];
      invSetEl("invModalTitle",    `Invest in ${INV_PLAN}`);
      invSetEl("invModalPlanChip", INV_PLAN);
      invSetEl("invModalBalNote",  fmtGHS(INV_BALANCE));
      invSetEl("invModalNote",     `Minimum: GHS ${cfg.minDep.toLocaleString()}`);
      invSetEl("invModalErr",      "");
      document.getElementById("invAmount").value = "";
      document.getElementById("invModalPreview").style.display = "none";
      document.getElementById("invModalOk").style.display = "none";
      document.getElementById("invModal").classList.add("inv-modal-active");

    } else if (INV_PW_ACTION === "loan") {
      openLoanModal(INV_LOAN_PLAN);
    }

  } catch (err) {
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      errEl.textContent = "Incorrect password. Please try again.";
    } else {
      errEl.textContent = "Verification failed. Please try again.";
    }
    console.error(err);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm & Continue';
});

// ══════════════════════════════════════════════
// INVEST + LOAN BUTTONS
// ══════════════════════════════════════════════
document.querySelectorAll(".inv-cta-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const plan = btn.dataset.plan;
    const tier = btn.dataset.tier;
    const type = btn.dataset.type;

    if (tier === "standard" && !INV_STD_ON) {
      INV_ACT_TIER  = "standard";
      INV_PW_ACTION = "activate";
      pwModalOpen();
      return;
    }
    if (tier === "premium" && !INV_PREM_ON) {
      INV_ACT_TIER  = "premium";
      INV_PW_ACTION = "activate";
      pwModalOpen();
      return;
    }

    if (type === "loan") {
      INV_PW_ACTION = "loan";
      INV_LOAN_PLAN = plan;
      pwModalOpen();
      return;
    }

    INV_PW_ACTION = "invest";
    INV_PW_PLAN   = plan;
    pwModalOpen();
  });
});

// ── Activation banner buttons ──────────────────
document.getElementById("stdActBtn").addEventListener("click", () => {
  INV_ACT_TIER  = "standard";
  INV_PW_ACTION = "activate";
  pwModalOpen();
});

document.getElementById("premActBtn").addEventListener("click", () => {
  INV_ACT_TIER  = "premium";
  INV_PW_ACTION = "activate";
  pwModalOpen();
});

// ── Activation modal close ─────────────────────
document.getElementById("actModalClose").addEventListener("click", () => {
  document.getElementById("actModal").classList.remove("inv-modal-active");
});
document.getElementById("actModal").addEventListener("click", e => {
  if (e.target.id === "actModal")
    document.getElementById("actModal").classList.remove("inv-modal-active");
});

// ── Activation confirm ─────────────────────────
document.getElementById("actModalConfirm").addEventListener("click", async () => {
  const fee   = INV_ACT_TIER === "standard" ? 500 : 1000;
  const errEl = document.getElementById("actModalErr");
  const btn   = document.getElementById("actModalConfirm");
  errEl.textContent = "";

  if (INV_BALANCE < fee) {
    errEl.textContent = `Insufficient balance. You need GHS ${fee.toLocaleString()} to activate.`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

  try {
    const uRef  = doc(db, "users", INV_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();
    const upd   = { balance: (uData.balance || 0) - fee };
    if (INV_ACT_TIER === "standard") upd.standardActivated = true;
    if (INV_ACT_TIER === "premium")  upd.premiumActivated  = true;
    await updateDoc(uRef, upd);

    await addDoc(collection(db, "users", INV_USER.uid, "transactions"), {
      type:   "activation",
      plan:   INV_ACT_TIER === "standard" ? "Standard Plan Activation" : "Premium Plan Activation",
      amount: fee,
      status: "completed",
      date:   serverTimestamp()
    });

    // ── ACTIVATION NOTIFICATION ────────────────
    const aN = Notifs.planActivated(INV_ACT_TIER);
    await createNotification(INV_USER.uid, aN.type, aN.title, aN.message);

    document.getElementById("actModalOk").style.display = "flex";
    setTimeout(() => {
      document.getElementById("actModal").classList.remove("inv-modal-active");
    }, 2000);
  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Try again.";
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-unlock"></i> Pay & Activate';
});

// ── Invest modal close ─────────────────────────
document.getElementById("invModalClose").addEventListener("click", () => {
  document.getElementById("invModal").classList.remove("inv-modal-active");
});
document.getElementById("invModal").addEventListener("click", e => {
  if (e.target.id === "invModal")
    document.getElementById("invModal").classList.remove("inv-modal-active");
});

// ── Live preview ───────────────────────────────
document.getElementById("invAmount").addEventListener("input", () => {
  const amt  = parseFloat(document.getElementById("invAmount").value);
  const cfg  = INV_PLANS[INV_PLAN];
  const prev = document.getElementById("invModalPreview");
  if (!cfg || !amt || isNaN(amt) || amt <= 0) { prev.style.display = "none"; return; }

  if (cfg.rateType === "weekly") {
    invSetEl("invPrevLbl1", "Weekly Profit");
    invSetEl("invPrevVal1", `+${fmtGHS(amt * cfg.rate)}`);
    invSetEl("invPrevLbl2", "Monthly Profit (est.)");
    invSetEl("invPrevVal2", `+${fmtGHS(amt * cfg.rate * 4)}`);
  } else if (cfg.rateType === "annual") {
    invSetEl("invPrevLbl1", "Yearly Return");
    invSetEl("invPrevVal1", `+${fmtGHS(amt * cfg.rate)}`);
    invSetEl("invPrevLbl2", "Total after 3 Years");
    invSetEl("invPrevVal2", fmtGHS(amt + (amt * cfg.rate * 3)));
  } else {
    const profit = amt * cfg.rate;
    invSetEl("invPrevLbl1", "Expected Return");
    invSetEl("invPrevVal1", `+${fmtGHS(profit)}`);
    invSetEl("invPrevLbl2", "Total at Maturity");
    invSetEl("invPrevVal2", fmtGHS(amt + profit));
  }
  prev.style.display = "block";
});

// ── Confirm investment ─────────────────────────
document.getElementById("invModalConfirm").addEventListener("click", async () => {
  const amt   = parseFloat(document.getElementById("invAmount").value);
  const cfg   = INV_PLANS[INV_PLAN];
  const errEl = document.getElementById("invModalErr");
  const btn   = document.getElementById("invModalConfirm");
  const ico   = document.getElementById("invModalBtnIco");
  errEl.textContent = "";

  if (!amt || isNaN(amt)) { errEl.textContent = "Please enter an amount."; return; }
  if (amt < cfg.minDep)   { errEl.textContent = `Minimum is GHS ${cfg.minDep.toLocaleString()}.`; return; }
  if (amt > INV_BALANCE)  { errEl.textContent = "Insufficient balance. Please deposit first."; return; }

  btn.disabled = true;
  invSetEl("invModalBtnTxt", "Processing...");
  if (ico) ico.className = "fa-solid fa-spinner fa-spin";

  try {
    const now = new Date();
    const maturityDate = cfg.duration
      ? new Date(now.getTime() + cfg.duration * 864e5)
      : null;

    await addDoc(collection(db, "users", INV_USER.uid, "investments"), {
      plan:           INV_PLAN,
      amount:         amt,
      rate:           cfg.rate,
      rateType:       cfg.rateType,
      duration:       cfg.duration,
      tier:           cfg.tier,
      startDate:      serverTimestamp(),
      maturityDate:   maturityDate ? Timestamp.fromDate(maturityDate) : null,
      profitEarned:   0,
      lastProfitDate: Timestamp.fromDate(now),
      status:         "active",
      locked:         cfg.duration !== null
    });

    const uRef  = doc(db, "users", INV_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();
    await updateDoc(uRef, {
      balance:     (uData.balance     || 0) - amt,
      invested:    (uData.invested    || 0) + amt,
      activePlans: (uData.activePlans || 0) + 1
    });

    await addDoc(collection(db, "users", INV_USER.uid, "transactions"), {
      type:   "investment",
      plan:   INV_PLAN,
      amount: amt,
      status: "active",
      date:   serverTimestamp()
    });

    // ── INVESTMENT NOTIFICATION ────────────────
    const iN = Notifs.investmentActive(INV_PLAN, amt);
    await createNotification(INV_USER.uid, iN.type, iN.title, iN.message);

    document.getElementById("invModalOk").style.display = "flex";
    setTimeout(async () => {
      document.getElementById("invModal").classList.remove("inv-modal-active");
      await invLoadHistory();
    }, 1800);

  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  invSetEl("invModalBtnTxt", "Confirm Investment");
  if (ico) ico.className = "fa-solid fa-arrow-right";
});

// ── Referral copy button ───────────────────────
const refCopyBtn = document.getElementById("invRefCopyBtn");
if (refCopyBtn) {
  refCopyBtn.addEventListener("click", () => {
    const code = document.getElementById("invRefCode").textContent;
    if (!code || code === "—") return;
    navigator.clipboard.writeText(code).then(() => {
      refCopyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => {
        refCopyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy Code';
      }, 2000);
    });
  });
}

// ══════════════════════════════════════════════
// LOAN MODAL
// ══════════════════════════════════════════════
function openLoanModal(plan) {
  INV_LOAN_PLAN = plan;
  const cfg = LOAN_PLANS[plan];

  invSetEl("loanModalTitle", `Apply for ${plan}`);
  invSetEl("loanModalChip",  plan);
  invSetEl("loanModalNote",  `Min: GHS ${cfg.minAmt.toLocaleString()} · Max: GHS ${cfg.maxAmt.toLocaleString()} · ${(cfg.rate * 100)}% interest`);
  invSetEl("loanModalErr",   "");
  document.getElementById("loanModalAmount").value  = "";
  document.getElementById("loanModalPurpose").value = "";
  document.getElementById("loanModalPreview").style.display = "none";
  document.getElementById("loanModalOk").style.display     = "none";
  document.getElementById("loanModal").classList.add("inv-modal-active");
}

document.getElementById("loanModalClose").addEventListener("click", () => {
  document.getElementById("loanModal").classList.remove("inv-modal-active");
});
document.getElementById("loanModal").addEventListener("click", e => {
  if (e.target.id === "loanModal")
    document.getElementById("loanModal").classList.remove("inv-modal-active");
});

document.getElementById("loanModalAmount").addEventListener("input", () => {
  const amt  = parseFloat(document.getElementById("loanModalAmount").value);
  const cfg  = LOAN_PLANS[INV_LOAN_PLAN];
  const prev = document.getElementById("loanModalPreview");
  if (!cfg || !amt || isNaN(amt) || amt <= 0) { prev.style.display = "none"; return; }

  const interest = amt * cfg.rate;
  const total    = amt + interest;
  invSetEl("loanPrevAmt",      fmtGHS(amt));
  invSetEl("loanPrevInterest", `+${fmtGHS(interest)}`);
  invSetEl("loanPrevTotal",    fmtGHS(total));
  prev.style.display = "block";
});

document.getElementById("loanModalConfirm").addEventListener("click", async () => {
  const name    = document.getElementById("loanModalName").value.trim();
  const phone   = document.getElementById("loanModalPhone").value.trim();
  const amount  = parseFloat(document.getElementById("loanModalAmount").value);
  const purpose = document.getElementById("loanModalPurpose").value.trim();
  const errEl   = document.getElementById("loanModalErr");
  const btn     = document.getElementById("loanModalConfirm");
  const cfg     = LOAN_PLANS[INV_LOAN_PLAN];
  errEl.textContent = "";

  if (!name)                    { errEl.textContent = "Please enter your full name."; return; }
  if (!phone)                   { errEl.textContent = "Please enter your phone number."; return; }
  if (!amount || isNaN(amount)) { errEl.textContent = "Please enter a loan amount."; return; }
  if (amount < cfg.minAmt)      { errEl.textContent = `Minimum loan amount is GHS ${cfg.minAmt.toLocaleString()}.`; return; }
  if (amount > cfg.maxAmt)      { errEl.textContent = `Maximum loan amount is GHS ${cfg.maxAmt.toLocaleString()}.`; return; }
  if (!purpose)                 { errEl.textContent = "Please explain the purpose of the loan."; return; }

  btn.disabled = true;
  invSetEl("loanModalBtnTxt", "Submitting...");

  try {
    const interest = amount * cfg.rate;
    const total    = amount + interest;

    await addDoc(collection(db, "loanRequests"), {
      uid: INV_USER.uid, name, email: INV_USER.email, phone,
      plan: INV_LOAN_PLAN, amount, interest, total, purpose,
      status: "under_review", createdAt: serverTimestamp()
    });

    await addDoc(collection(db, "users", INV_USER.uid, "loanRequests"), {
      plan: INV_LOAN_PLAN, amount, interest, total, purpose,
      status: "under_review", createdAt: serverTimestamp()
    });

    await fetch(FORMSPREE_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        subject: `Loan Application — ${name} — ${INV_LOAN_PLAN}`,
        message: `
Hello Admin,

A user has submitted a loan application on YMG Funds.

━━━━━━━━━━━━━━━━━━━━━━━━
USER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━
Full Name:     ${name}
Email:         ${INV_USER.email}
Phone:         ${phone}

━━━━━━━━━━━━━━━━━━━━━━━━
LOAN DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━
Plan:          ${INV_LOAN_PLAN}
Amount:        ${fmtGHS(amount)}
Interest:      ${fmtGHS(interest)} (${(cfg.rate * 100)}%)
Total Repay:   ${fmtGHS(total)}
Duration:      ${cfg.duration} days
Purpose:       ${purpose}

— YMG Funds System
        `
      })
    });

    document.getElementById("loanModalOk").style.display = "flex";
    setTimeout(() => {
      document.getElementById("loanModal").classList.remove("inv-modal-active");
    }, 2500);

  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("loanModalBtnTxt").innerHTML =
    '<i class="fa-solid fa-paper-plane"></i> Submit Application';
});

// ══════════════════════════════════════════════
// LOAD HISTORY
// ══════════════════════════════════════════════
async function invLoadHistory() {
  const tbody = document.getElementById("invHistoryBody");
  tbody.innerHTML = `<tr><td colspan="6" class="inv-table-msg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const q    = query(
      collection(db, "users", INV_USER.uid, "investments"),
      orderBy("startDate", "desc")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="6" class="inv-table-msg">No investments yet. Activate a plan above to get started.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    snap.forEach(ds => {
      const inv    = ds.data();
      const start  = inv.startDate?.seconds
        ? new Date(inv.startDate.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "—";
      const mat    = inv.maturityDate?.seconds
        ? new Date(inv.maturityDate.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "Flexible";
      const profit = typeof inv.profitEarned === "number" ? inv.profitEarned : 0;
      const sc     = inv.status === "active" ? "success" : inv.status === "matured" ? "warning" : "pending";

      tbody.innerHTML += `
        <tr>
          <td><strong>${inv.plan}</strong></td>
          <td>${fmtGHS(inv.amount || 0)}</td>
          <td>${start}</td>
          <td>${mat}</td>
          <td class="inv-profit-green">+${fmtGHS(profit)}</td>
          <td><span class="inv-status-tag ${sc}">${inv.status}</span></td>
        </tr>`;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="inv-table-msg">Failed to load. Please refresh.</td></tr>`;
  }
}

// ══════════════════════════════════════════════
// PROFIT ENGINE
// ══════════════════════════════════════════════
async function invRunProfitEngine() {
  try {
    const snap = await getDocs(collection(db, "users", INV_USER.uid, "investments"));
    if (snap.empty) return;

    const now = new Date();
    let totalProfit = 0;

    for (const ds of snap.docs) {
      const inv = ds.data();
      if (inv.status !== "active") continue;

      const last = inv.lastProfitDate?.seconds
        ? new Date(inv.lastProfitDate.seconds * 1000) : null;
      if (!last) continue;

      const msSince = now.getTime() - last.getTime();
      let gained = 0;

      if (inv.rateType === "weekly") {
        const weeks = Math.floor(msSince / (7 * 864e5));
        if (weeks < 1) continue;
        gained = inv.amount * inv.rate * weeks;
      } else {
        const days = Math.floor(msSince / 864e5);
        if (days < 1) continue;
        const dailyRate = inv.rate / (inv.duration || 365);
        gained = inv.amount * dailyRate * days;
      }

      if (gained <= 0) continue;

      let newStatus = "active";
      if (inv.maturityDate?.seconds && now >= new Date(inv.maturityDate.seconds * 1000)) {
        newStatus = "matured";
      }

      await updateDoc(doc(db, "users", INV_USER.uid, "investments", ds.id), {
        profitEarned:   (inv.profitEarned || 0) + gained,
        lastProfitDate: Timestamp.fromDate(now),
        status:         newStatus
      });

      totalProfit += gained;
    }

    if (totalProfit > 0) {
      const uRef  = doc(db, "users", INV_USER.uid);
      const uData = (await getDoc(uRef)).data();
      await updateDoc(uRef, {
        balance: (uData.balance || 0) + totalProfit,
        profit:  (uData.profit  || 0) + totalProfit
      });
      await addDoc(collection(db, "users", INV_USER.uid, "transactions"), {
        type:   "profit",
        amount: parseFloat(totalProfit.toFixed(2)),
        note:   "Profit credit",
        status: "completed",
        date:   serverTimestamp()
      });

      // ── PROFIT NOTIFICATION ──────────────────
      const pN = Notifs.profitCredited(parseFloat(totalProfit.toFixed(2)));
      await createNotification(INV_USER.uid, pN.type, pN.title, pN.message);

      await invLoadHistory();
    }
  } catch (err) {
    console.error("Profit engine:", err);
  }
}

// ═══════════════════════════════════════════════════════
// PASTE THIS AT THE VERY BOTTOM OF investments.js
// DO NOT CHANGE ANYTHING ABOVE
// ═══════════════════════════════════════════════════════

// ── PREMIUM REFERRAL SETUP ─────────────────────
// Generates YMGP- code and loads stats
// Called inside the existing onSnapshot — see note below

function loadPremRefStats(d, uid) {
  // Generate premium code from uid if not exists
  // Format: YMGP-XXXXXX
  const premCode = d.premiumReferralCode || ("YMGP-" + uid.slice(0, 6).toUpperCase());

  // Save to Firestore if not yet set
  if (!d.premiumReferralCode) {
    updateDoc(doc(db, "users", uid), { premiumReferralCode: premCode }).catch(() => {});
  }

  invSetEl("premRefCodeDisplay", premCode);
  invSetEl("premRefCount",       d.premiumReferralCount    || 0);
  invSetEl("premRefEarned",      fmtGHS(d.premiumReferralEarnings || 0));
}

// ── PREMIUM CODE ──────────────────────────
const premRefCopyBtn = document.getElementById("premRefCopyBtn");
if (premRefCopyBtn) {
  premRefCopyBtn.addEventListener("click", () => {
    const code = document.getElementById("premRefCodeDisplay").textContent;
    if (!code || code === "—") return;
    navigator.clipboard.writeText(code).then(() => {
      premRefCopyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => {
        premRefCopyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy Premium Code';
      }, 2000);
    });
  });
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function invSetEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function invShow(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "";
}
function invHide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}
function fmtGHS(n) {
  return "GHS " + Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}

