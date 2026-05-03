import "./init.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, addDoc, updateDoc,
  collection, query, orderBy, where,
  serverTimestamp, Timestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification, Notifs } from "./notify-helper.js";
import { getPlatformSettings } from "./platform-settings.js";

const INV_PLANS = {
  "Starter Savings":       { rate: 0.005, rateType: "weekly", minDep: 50,   duration: null, tier: "standard" },
  "Fixed Deposit":         { rate: 0.095, rateType: "fixed",  minDep: 500,  duration: 90,   tier: "standard" },
  "Growth Plus":           { rate: 0.125, rateType: "fixed",  minDep: 1000, duration: 182,  tier: "standard" },
  "182-Day Growth Tool":   { rate: 0.15,  rateType: "fixed",  minDep: 1000, duration: 182,  tier: "premium"  },
  "365-Day Premium Tool":  { rate: 0.25,  rateType: "fixed",  minDep: 2000, duration: 365,  tier: "premium"  },
  "3-Year Wealth Builder": { rate: 0.35,  rateType: "annual", minDep: 500,  duration: 1095, tier: "premium"  }
};

const LOAN_PLANS = {
  "Standard Loan": { rate: 0.12, minAmt: 500,  maxAmt: 5000,  duration: 182, tier: "standard" },
  "Premium Loan":  { rate: 0.20, minAmt: 500,  maxAmt: 30000, duration: 365, tier: "premium"  }
};

const FORMSPREE_URL = "https://formspree.io/f/xqewrwyz";
const MIN_BALANCE   = 50;

let INV_USER      = null;
let INV_PLAN      = null;
let INV_BALANCE   = 0;
let INV_STD_ON    = false;
let INV_PREM_ON   = false;
let INV_ACT_TIER  = null;
let INV_PW_ACTION = null;
let INV_PW_PLAN   = null;
let INV_LOAN_PLAN = null;
let INV_SETTINGS  = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  INV_USER = user;

  INV_SETTINGS = await getPlatformSettings();

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    const name     = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;

    INV_BALANCE = typeof d.balance === "number" ? d.balance : 0;
    INV_STD_ON  = d.standardActivated || false;
    INV_PREM_ON = d.premiumActivated   || false;

    invSetEl("invAvailBal",       fmtGHS(d.balance || 0));
    invSetEl("invTotalInv",       fmtGHS(d.invested || 0));
    invSetEl("invTotalProfit",    fmtGHS(d.profit || 0));
    invSetEl("invPremRefEarned",  fmtGHS(d.premiumReferralEarnings || 0));

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

document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(b => {
  if (b) b.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

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

  const minBanner = document.getElementById("invMinBalBanner");
  if (minBanner) minBanner.style.display = INV_BALANCE <= MIN_BALANCE ? "flex" : "none";

  if (INV_SETTINGS && !INV_SETTINGS.investmentsEnabled) {
    const banner = document.createElement("div");
    banner.id    = "invDisabledBanner";
    banner.style.cssText = "display:flex;align-items:center;gap:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin-bottom:16px;";
    banner.innerHTML = `<i class="fa-solid fa-ban" style="color:#dc2626;flex-shrink:0;"></i><p style="font-size:0.85rem;color:#dc2626;margin:0;font-weight:600;">Investments are temporarily disabled by the administrator. Please try again later.</p>`;
    const existing = document.getElementById("invDisabledBanner");
    if (!existing) {
      const content = document.querySelector(".content") || document.querySelector("main");
      if (content) content.insertBefore(banner, content.firstChild);
    }
  }

  if (INV_SETTINGS && !INV_SETTINGS.loansEnabled) {
    document.querySelectorAll("[data-type='loan']").forEach(btn => {
      btn.disabled = true;
      btn.title    = "Loans are temporarily unavailable";
      btn.style.opacity = "0.5";
      btn.style.cursor  = "not-allowed";
    });
  }
}

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
document.getElementById("pwModal").addEventListener("click", e => { if (e.target.id === "pwModal") pwModalClose(); });

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
      if (INV_SETTINGS && !INV_SETTINGS.investmentsEnabled) {
        document.getElementById("pwModalErr").textContent = "Investments are currently disabled. Please try again later.";
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm & Continue';
        return;
      }
      const fee = INV_ACT_TIER === "standard" ? 500 : 1000;
      invSetEl("actModalTitle", INV_ACT_TIER === "standard" ? "Activate Standard Plans" : "Activate Premium Plans");
      invSetEl("actModalDesc",  `Pay a one-time GHS ${fee} fee to unlock all ${INV_ACT_TIER} plans.`);
      invSetEl("actModalFee",   `GHS ${fee.toLocaleString()}`);
      invSetEl("actModalBal",   fmtGHS(INV_BALANCE));
      invSetEl("actModalErr",   "");
      document.getElementById("actModalOk").style.display = "none";
      const ico = document.getElementById("actModalIco");
      if (ico) ico.innerHTML = INV_ACT_TIER === "premium" ? '<i class="fa-solid fa-crown"></i>' : '<i class="fa-solid fa-lock-open"></i>';
      document.getElementById("actModal").classList.add("inv-modal-active");

    } else if (INV_PW_ACTION === "invest") {
      if (INV_SETTINGS && !INV_SETTINGS.investmentsEnabled) {
        alert("Investments are currently disabled. Please try again later.");
        return;
      }
      INV_PLAN = INV_PW_PLAN;
      const cfg = INV_PLANS[INV_PLAN];
      invSetEl("invModalTitle",   `Invest in ${INV_PLAN}`);
      invSetEl("invModalPlanChip", INV_PLAN);
      invSetEl("invModalBalNote", fmtGHS(INV_BALANCE));
      invSetEl("invModalNote",    `Minimum: GHS ${cfg.minDep.toLocaleString()} · Max investable: ${fmtGHS(Math.max(0, INV_BALANCE - MIN_BALANCE))}`);
      invSetEl("invModalErr",     "");
      document.getElementById("invAmount").value = "";
      document.getElementById("invModalPreview").style.display = "none";
      document.getElementById("invModalOk").style.display      = "none";
      document.getElementById("invModal").classList.add("inv-modal-active");

    } else if (INV_PW_ACTION === "loan") {
      if (INV_SETTINGS && !INV_SETTINGS.loansEnabled) {
        alert("Loan applications are currently disabled. Please try again later.");
        return;
      }
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

document.querySelectorAll(".inv-cta-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const plan = btn.dataset.plan;
    const tier = btn.dataset.tier;
    const type = btn.dataset.type;

    if (type === "loan") {
      if (INV_SETTINGS && !INV_SETTINGS.loansEnabled) {
        alert("Loan applications are temporarily disabled. Please try again later.");
        return;
      }
      INV_PW_ACTION = "loan";
      INV_LOAN_PLAN = plan;
      pwModalOpen();
      return;
    }

    if (INV_SETTINGS && !INV_SETTINGS.investmentsEnabled) {
      alert("Investments are temporarily disabled. Please try again later.");
      return;
    }

    if (tier === "standard" && !INV_STD_ON) { INV_ACT_TIER = "standard"; INV_PW_ACTION = "activate"; pwModalOpen(); return; }
    if (tier === "premium"  && !INV_PREM_ON) { INV_ACT_TIER = "premium";  INV_PW_ACTION = "activate"; pwModalOpen(); return; }

    if (INV_BALANCE <= MIN_BALANCE) {
      alert(`Your balance must be above GHS ${MIN_BALANCE} to invest. Please deposit first.`);
      return;
    }

    INV_PW_ACTION = "invest";
    INV_PW_PLAN   = plan;
    pwModalOpen();
  });
});

document.getElementById("stdActBtn").addEventListener("click", () => {
  if (INV_SETTINGS && !INV_SETTINGS.investmentsEnabled) { alert("Investments are temporarily disabled."); return; }
  INV_ACT_TIER = "standard"; INV_PW_ACTION = "activate"; pwModalOpen();
});

document.getElementById("premActBtn").addEventListener("click", () => {
  if (INV_SETTINGS && !INV_SETTINGS.investmentsEnabled) { alert("Investments are temporarily disabled."); return; }
  INV_ACT_TIER = "premium"; INV_PW_ACTION = "activate"; pwModalOpen();
});

document.getElementById("actModalClose").addEventListener("click", () => { document.getElementById("actModal").classList.remove("inv-modal-active"); });
document.getElementById("actModal").addEventListener("click", e => { if (e.target.id === "actModal") document.getElementById("actModal").classList.remove("inv-modal-active"); });

document.getElementById("actModalConfirm").addEventListener("click", async () => {
  const fee   = INV_ACT_TIER === "standard" ? 500 : 1000;
  const errEl = document.getElementById("actModalErr");
  const btn   = document.getElementById("actModalConfirm");
  errEl.textContent = "";

  if (INV_BALANCE < fee) { errEl.textContent = `Insufficient balance. You need GHS ${fee.toLocaleString()} to activate.`; return; }

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
      type: "activation", plan: INV_ACT_TIER === "standard" ? "Standard Plan Activation" : "Premium Plan Activation",
      amount: fee, status: "completed", date: serverTimestamp()
    });

    const aN = Notifs.planActivated(INV_ACT_TIER);
    await createNotification(INV_USER.uid, aN.type, aN.title, aN.message);

    await handlePremiumReferralCredit(INV_ACT_TIER, fee);

    document.getElementById("actModalOk").style.display = "flex";
    setTimeout(() => { document.getElementById("actModal").classList.remove("inv-modal-active"); }, 2000);
  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Try again.";
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-unlock"></i> Pay & Activate';
});

document.getElementById("invModalClose").addEventListener("click", () => { document.getElementById("invModal").classList.remove("inv-modal-active"); });
document.getElementById("invModal").addEventListener("click", e => { if (e.target.id === "invModal") document.getElementById("invModal").classList.remove("inv-modal-active"); });

document.getElementById("invAmount").addEventListener("input", () => {
  const amt = parseFloat(document.getElementById("invAmount").value);
  const cfg = INV_PLANS[INV_PLAN];
  const prev = document.getElementById("invModalPreview");
  if (!cfg || !amt || isNaN(amt) || amt <= 0) { prev.style.display = "none"; return; }

  if (cfg.rateType === "weekly") {
    invSetEl("invPrevLbl1", "Weekly Profit");       invSetEl("invPrevVal1", `+${fmtGHS(amt * cfg.rate)}`);
    invSetEl("invPrevLbl2", "Monthly Profit (est.)"); invSetEl("invPrevVal2", `+${fmtGHS(amt * cfg.rate * 4)}`);
  } else if (cfg.rateType === "annual") {
    invSetEl("invPrevLbl1", "Yearly Return");       invSetEl("invPrevVal1", `+${fmtGHS(amt * cfg.rate)}`);
    invSetEl("invPrevLbl2", "Total after 3 Years"); invSetEl("invPrevVal2", fmtGHS(amt + (amt * cfg.rate * 3)));
  } else {
    const profit = amt * cfg.rate;
    invSetEl("invPrevLbl1", "Expected Return");   invSetEl("invPrevVal1", `+${fmtGHS(profit)}`);
    invSetEl("invPrevLbl2", "Total at Maturity"); invSetEl("invPrevVal2", fmtGHS(amt + profit));
  }
  prev.style.display = "block";
});

document.getElementById("invModalConfirm").addEventListener("click", async () => {
  const amt   = parseFloat(document.getElementById("invAmount").value);
  const cfg   = INV_PLANS[INV_PLAN];
  const errEl = document.getElementById("invModalErr");
  const btn   = document.getElementById("invModalConfirm");
  const ico   = document.getElementById("invModalBtnIco");
  errEl.textContent = "";

  if (!amt || isNaN(amt))  { errEl.textContent = "Please enter an amount."; return; }
  if (amt < cfg.minDep)    { errEl.textContent = `Minimum is GHS ${cfg.minDep.toLocaleString()}.`; return; }
  if (amt > INV_BALANCE)   { errEl.textContent = "Insufficient balance. Please deposit first."; return; }
  if ((INV_BALANCE - amt) < MIN_BALANCE) { errEl.textContent = `You must keep at least GHS ${MIN_BALANCE} in your account. Maximum you can invest is ${fmtGHS(INV_BALANCE - MIN_BALANCE)}.`; return; }

  btn.disabled = true;
  invSetEl("invModalBtnTxt", "Processing...");
  if (ico) ico.className = "fa-solid fa-spinner fa-spin";

  try {
    const now          = new Date();
    const maturityDate = cfg.duration ? new Date(now.getTime() + cfg.duration * 864e5) : null;

    await addDoc(collection(db, "users", INV_USER.uid, "investments"), {
      plan: INV_PLAN, amount: amt, rate: cfg.rate, rateType: cfg.rateType,
      duration: cfg.duration, tier: cfg.tier, startDate: serverTimestamp(),
      maturityDate: maturityDate ? Timestamp.fromDate(maturityDate) : null,
      profitEarned: 0, lastProfitDate: Timestamp.fromDate(now), status: "active", locked: cfg.duration !== null
    });

    const uRef  = doc(db, "users", INV_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();
    await updateDoc(uRef, {
      balance:     (uData.balance  || 0) - amt,
      invested:    (uData.invested || 0) + amt,
      activePlans: (uData.activePlans || 0) + 1
    });

    await addDoc(collection(db, "users", INV_USER.uid, "transactions"), {
      type: "investment", plan: INV_PLAN, amount: amt, status: "active", date: serverTimestamp()
    });

    const iN = Notifs.investmentActive(INV_PLAN, amt);
    await createNotification(INV_USER.uid, iN.type, iN.title, iN.message);

    document.getElementById("invModalOk").style.display = "flex";
    setTimeout(async () => { document.getElementById("invModal").classList.remove("inv-modal-active"); await invLoadHistory(); }, 1800);

  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  invSetEl("invModalBtnTxt", "Confirm Investment");
  if (ico) ico.className = "fa-solid fa-arrow-right";
});

const refCopyBtn = document.getElementById("invRefCopyBtn");
if (refCopyBtn) {
  refCopyBtn.addEventListener("click", () => {
    const code = document.getElementById("invRefCode").textContent;
    if (!code || code === "—") return;
    navigator.clipboard.writeText(code).then(() => {
      refCopyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => { refCopyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy Code'; }, 2000);
    });
  });
}

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
  document.getElementById("loanModalOk").style.display      = "none";
  document.getElementById("loanModal").classList.add("inv-modal-active");
}

document.getElementById("loanModalClose").addEventListener("click", () => { document.getElementById("loanModal").classList.remove("inv-modal-active"); });
document.getElementById("loanModal").addEventListener("click", e => { if (e.target.id === "loanModal") document.getElementById("loanModal").classList.remove("inv-modal-active"); });

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
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        subject: `Loan Application — ${name} — ${INV_LOAN_PLAN}`,
        message: `Hello Admin,\n\nA user has submitted a loan application on YMG IQ.\n\nFull Name: ${name}\nEmail: ${INV_USER.email}\nPhone: ${phone}\n\nPlan: ${INV_LOAN_PLAN}\nAmount: ${fmtGHS(amount)}\nInterest: ${fmtGHS(interest)} (${(cfg.rate * 100)}%)\nTotal Repay: ${fmtGHS(total)}\nDuration: ${cfg.duration} days\nPurpose: ${purpose}\n\n— YMG IQ System`
      })
    });

    document.getElementById("loanModalOk").style.display = "flex";
    setTimeout(() => { document.getElementById("loanModal").classList.remove("inv-modal-active"); }, 2500);

  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("loanModalBtnTxt").innerHTML = '<i class="fa-solid fa-paper-plane"></i> Get Instant Loan Now';
});

async function invLoadHistory() {
  const tbody = document.getElementById("invHistoryBody");
  tbody.innerHTML = `<tr><td colspan="6" class="inv-table-msg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const q    = query(collection(db, "users", INV_USER.uid, "investments"), orderBy("startDate", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="6" class="inv-table-msg">No investments yet. Activate a plan above to get started.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    snap.forEach(ds => {
      const inv    = ds.data();
      const start  = inv.startDate?.seconds ? new Date(inv.startDate.seconds * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";
      const mat    = inv.maturityDate?.seconds ? new Date(inv.maturityDate.seconds * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "Flexible";
      const profit = typeof inv.profitEarned === "number" ? inv.profitEarned : 0;
      const sc     = inv.status === "active" ? "success" : inv.status === "matured" ? "warning" : "pending";
      tbody.innerHTML += `<tr><td><strong>${inv.plan}</strong></td><td>${fmtGHS(inv.amount || 0)}</td><td>${start}</td><td>${mat}</td><td class="inv-profit-green">+${fmtGHS(profit)}</td><td><span class="inv-status-tag ${sc}">${inv.status}</span></td></tr>`;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="inv-table-msg">Failed to load. Please refresh.</td></tr>`;
  }
}

async function invRunProfitEngine() {
  try {
    const snap = await getDocs(collection(db, "users", INV_USER.uid, "investments"));
    if (snap.empty) return;

    const now = new Date();
    let totalProfit = 0;

    for (const ds of snap.docs) {
      const inv = ds.data();
      if (inv.status !== "active") continue;

      const last = inv.lastProfitDate?.seconds ? new Date(inv.lastProfitDate.seconds * 1000) : null;
      if (!last) continue;

      const msSince = now.getTime() - last.getTime();
      let gained    = 0;

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
      if (inv.maturityDate?.seconds && now >= new Date(inv.maturityDate.seconds * 1000)) newStatus = "matured";

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
        type: "profit", amount: parseFloat(totalProfit.toFixed(2)), note: "Profit credit", status: "completed", date: serverTimestamp()
      });

      const pN = Notifs.profitCredited(parseFloat(totalProfit.toFixed(2)));
      await createNotification(INV_USER.uid, pN.type, pN.title, pN.message);
      await invLoadHistory();
    }
  } catch (err) {
    console.error("Profit engine:", err);
  }
}

async function handlePremiumReferralCredit(tier, fee) {
  try {
    if (INV_SETTINGS && !INV_SETTINGS.referralsEnabled) return;

    const uRef  = doc(db, "users", INV_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();

    const premReferredBy = uData.premiumReferredBy;
    if (!premReferredBy) return;

    const rewardedKey = tier === "standard" ? "premStdRefRewarded" : "premPremRefRewarded";
    if (uData[rewardedKey]) return;

    const q    = query(collection(db, "users"), where("premiumReferralCode", "==", premReferredBy));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const referrerDoc  = snap.docs[0];
    const referrerId   = referrerDoc.id;
    const referrerData = referrerDoc.data();

    if (referrerId === INV_USER.uid) return;

    const reward        = parseFloat((fee * 0.10).toFixed(2));
    const isFirstReward = !uData.premStdRefRewarded && !uData.premPremRefRewarded;

    await updateDoc(doc(db, "users", referrerId), {
      balance:                  (referrerData.balance || 0) + reward,
      premiumReferralEarnings:  (referrerData.premiumReferralEarnings || 0) + reward,
      ...(isFirstReward && { premiumReferralCount: (referrerData.premiumReferralCount || 0) + 1 })
    });

    await addDoc(collection(db, "users", referrerId, "transactions"), {
      type: "referral_reward", amount: reward,
      note: `Premium referral reward — ${uData.name || "a user"} activated ${tier} plan`,
      status: "completed", date: serverTimestamp()
    });

    await createNotification(referrerId, "referral_reward", "Premium Referral Reward 🎉",
      `${uData.name || "Someone you referred"} activated their ${tier} plan. You earned GHS ${reward.toFixed(2)}.`);

    await updateDoc(uRef, { [rewardedKey]: true });

  } catch (err) {
    console.error("Premium referral credit error:", err);
  }
}

function loadPremRefStats(d, uid) {
  const codeEl   = document.getElementById("premRefCodeDisplay");
  const copyBtn  = document.getElementById("premRefCopyBtn");
  const countEl  = document.getElementById("premRefCount");
  const earnedEl = document.getElementById("premRefEarned");

  if (!d.premiumActivated) {
    if (codeEl)   codeEl.textContent   = "———";
    if (copyBtn)  { copyBtn.disabled = true; copyBtn.style.opacity = "0.4"; copyBtn.style.cursor = "not-allowed"; }
    if (countEl)  countEl.textContent  = "0";
    if (earnedEl) earnedEl.textContent = fmtGHS(0);
    return;
  }

  const premCode = d.premiumReferralCode || ("YMGP-" + uid.slice(0, 6).toUpperCase());
  if (!d.premiumReferralCode) updateDoc(doc(db, "users", uid), { premiumReferralCode: premCode }).catch(() => {});

  if (codeEl)   codeEl.textContent   = premCode;
  if (copyBtn)  { copyBtn.disabled = false; copyBtn.style.opacity = "1"; copyBtn.style.cursor = "pointer"; }
  if (countEl)  countEl.textContent  = d.premiumReferralCount || 0;
  if (earnedEl) earnedEl.textContent = fmtGHS(d.premiumReferralEarnings || 0);
}

const premRefCopyBtn = document.getElementById("premRefCopyBtn");
if (premRefCopyBtn) {
  premRefCopyBtn.addEventListener("click", () => {
    if (!INV_PREM_ON) return;
    const code = document.getElementById("premRefCodeDisplay").textContent;
    if (!code || code === "———") return;
    navigator.clipboard.writeText(code).then(() => {
      premRefCopyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => { premRefCopyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy Premium Code'; }, 2000);
    });
  });
}

function invSetEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function invShow(id)  { const el = document.getElementById(id); if (el) el.style.display = ""; }
function invHide(id)  { const el = document.getElementById(id); if (el) el.style.display = "none"; }
function fmtGHS(n)    { return "GHS " + Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 }); }