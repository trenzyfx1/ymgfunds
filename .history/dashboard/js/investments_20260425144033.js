import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, addDoc, updateDoc,
  collection, query, orderBy,
  serverTimestamp, Timestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── PLAN CONFIG ────────────────────────────────
const INV_PLANS = {
  "Starter Savings":      { rate: 0.005,  rateType: "weekly",  minDep: 50,   duration: null, tier: "standard" },
  "Fixed Deposit":        { rate: 0.095,  rateType: "fixed",   minDep: 500,  duration: 90,   tier: "standard" },
  "Growth Plus":          { rate: 0.125,  rateType: "fixed",   minDep: 1000, duration: 182,  tier: "standard" },
  "182-Day Growth Tool":  { rate: 0.15,   rateType: "fixed",   minDep: 1000, duration: 182,  tier: "premium"  },
  "365-Day Premium Tool": { rate: 0.25,   rateType: "fixed",   minDep: 2000, duration: 365,  tier: "premium"  },
  "3-Year Wealth Builder":{ rate: 0.35,   rateType: "annual",  minDep: 500,  duration: 1095, tier: "premium"  }
};

let INV_USER        = null;
let INV_PLAN        = null;
let INV_BALANCE     = 0;
let INV_STD_ON      = false;
let INV_PREM_ON     = false;
let INV_ACT_TIER    = null;

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  INV_USER = user;

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    // avatar
    const name = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;

    INV_BALANCE  = typeof d.balance  === "number" ? d.balance  : 0;
    INV_STD_ON   = d.standardActivated  || false;
    INV_PREM_ON  = d.premiumActivated   || false;

    // balance bar
    invSetEl("invAvailBal",   fmtGHS(d.balance  || 0));
    invSetEl("invTotalInv",   fmtGHS(d.invested || 0));
    invSetEl("invTotalProfit",fmtGHS(d.profit   || 0));

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
  const stdStrips  = ["istrip-starter","istrip-fixed","istrip-growth"];
  const premStrips = ["istrip-p182","istrip-p365","istrip-p3yr"];

  // Standard
  if (INV_STD_ON) {
    stdStrips.forEach(id => invHide(id));
    invHide("stdActBanner");
    invShow("stdDisclaimer");
    const t = document.getElementById("stdTierTag");
    if (t) { t.innerHTML = '<i class="fa-solid fa-check"></i> Activated'; t.classList.replace("inv-tier-locked","inv-tier-active"); }
  } else {
    stdStrips.forEach(id => invShow(id));
    invShow("stdActBanner");
    invHide("stdDisclaimer");
  }

  // Premium
  if (INV_PREM_ON) {
    premStrips.forEach(id => invHide(id));
    invHide("premActBanner");
    invShow("premDisclaimer");
    const t = document.getElementById("premTierTag");
    if (t) { t.innerHTML = '<i class="fa-solid fa-check"></i> Activated'; t.classList.replace("inv-tier-locked","inv-tier-active"); }
  } else {
    premStrips.forEach(id => invShow(id));
    invShow("premActBanner");
    invHide("premDisclaimer");
  }
}

// ── ACTIVATION BANNER BUTTONS ──────────────────
document.getElementById("stdActBtn").addEventListener("click",  () => invOpenActModal("standard"));
document.getElementById("premActBtn").addEventListener("click", () => invOpenActModal("premium"));

function invOpenActModal(tier) {
  INV_ACT_TIER = tier;
  const fee = tier === "standard" ? 500 : 1000;
  invSetEl("actModalTitle", tier === "standard" ? "Activate Standard Plans" : "Activate Premium Plans");
  invSetEl("actModalDesc",  `Pay a one-time GHS ${fee} fee to unlock all ${tier} plans.`);
  invSetEl("actModalFee",   `GHS ${fee.toLocaleString()}`);
  invSetEl("actModalBal",   fmtGHS(INV_BALANCE));
  invSetEl("actModalErr",   "");
  document.getElementById("actModalOk").style.display = "none";
  const ico = document.getElementById("actModalIco");
  if (ico) ico.innerHTML = tier === "premium" ? '<i class="fa-solid fa-crown"></i>' : '<i class="fa-solid fa-lock-open"></i>';
  invModalOpen("actModal");
}

document.getElementById("actModalClose").addEventListener("click", () => invModalClose("actModal"));
document.getElementById("actModal").addEventListener("click", e => { if (e.target.id === "actModal") invModalClose("actModal"); });

document.getElementById("actModalConfirm").addEventListener("click", async () => {
  const fee = INV_ACT_TIER === "standard" ? 500 : 1000;
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
    const update = { balance: (uData.balance || 0) - fee };
    if (INV_ACT_TIER === "standard") update.standardActivated = true;
    if (INV_ACT_TIER === "premium")  update.premiumActivated  = true;
    await updateDoc(uRef, update);

    await addDoc(collection(db, "users", INV_USER.uid, "transactions"), {
      type: "activation",
      plan: INV_ACT_TIER === "standard" ? "Standard Plan Activation" : "Premium Plan Activation",
      amount: fee,
      status: "completed",
      date: serverTimestamp()
    });

    document.getElementById("actModalOk").style.display = "flex";
    setTimeout(() => invModalClose("actModal"), 2000);
  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Try again.";
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-unlock"></i> Pay & Activate';
});

// ── INVEST NOW BUTTONS ─────────────────────────
document.querySelectorAll(".inv-cta-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const plan = btn.dataset.plan;
    const tier = btn.dataset.tier;
    if (tier === "standard" && !INV_STD_ON)  { invOpenActModal("standard"); return; }
    if (tier === "premium"  && !INV_PREM_ON) { invOpenActModal("premium");  return; }
    invOpenInvModal(plan);
  });
});

// ── OPEN INVEST MODAL ──────────────────────────
function invOpenInvModal(plan) {
  INV_PLAN = plan;
  const cfg = INV_PLANS[plan];
  invSetEl("invModalTitle",   `Invest in ${plan}`);
  invSetEl("invModalPlanChip", plan);
  invSetEl("invModalBalNote",  fmtGHS(INV_BALANCE));
  invSetEl("invModalNote",     `Minimum: GHS ${cfg.minDep.toLocaleString()}`);
  invSetEl("invModalErr",      "");
  document.getElementById("invAmount").value = "";
  document.getElementById("invModalPreview").style.display = "none";
  document.getElementById("invModalOk").style.display = "none";
  invModalOpen("invModal");
}

document.getElementById("invModalClose").addEventListener("click", () => invModalClose("invModal"));
document.getElementById("invModal").addEventListener("click", e => { if (e.target.id === "invModal") invModalClose("invModal"); });

// ── LIVE PREVIEW ───────────────────────────────
document.getElementById("invAmount").addEventListener("input", () => {
  const amt = parseFloat(document.getElementById("invAmount").value);
  const cfg = INV_PLANS[INV_PLAN];
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

// ── CONFIRM INVESTMENT ─────────────────────────
document.getElementById("invModalConfirm").addEventListener("click", async () => {
  const amt   = parseFloat(document.getElementById("invAmount").value);
  const cfg   = INV_PLANS[INV_PLAN];
  const errEl = document.getElementById("invModalErr");
  const btn   = document.getElementById("invModalConfirm");
  errEl.textContent = "";

  if (!amt || isNaN(amt))        { errEl.textContent = "Please enter an amount."; return; }
  if (amt < cfg.minDep)          { errEl.textContent = `Minimum is GHS ${cfg.minDep.toLocaleString()}.`; return; }
  if (amt > INV_BALANCE)         { errEl.textContent = "Insufficient balance. Please deposit first."; return; }

  btn.disabled = true;
  invSetEl("invModalBtnTxt", "Processing...");
  const ico = document.getElementById("invModalBtnIco");
  if (ico) ico.className = "fa-solid fa-spinner fa-spin";

  try {
    const now         = new Date();
    const maturityDate = cfg.duration
      ? new Date(now.getTime() + cfg.duration * 864e5)
      : null;

    // Save investment
    await addDoc(collection(db, "users", INV_USER.uid, "investments"), {
      plan: INV_PLAN,
      amount: amt,
      rate: cfg.rate,
      rateType: cfg.rateType,
      duration: cfg.duration,
      tier: cfg.tier,
      startDate: serverTimestamp(),
      maturityDate: maturityDate ? Timestamp.fromDate(maturityDate) : null,
      profitEarned: 0,
      lastProfitDate: Timestamp.fromDate(now),
      status: "active",
      locked: cfg.duration !== null
    });

    // Update user balances
    const uRef  = doc(db, "users", INV_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();
    await updateDoc(uRef, {
      balance:     (uData.balance  || 0) - amt,
      invested:    (uData.invested || 0) + amt,
      activePlans: (uData.activePlans || 0) + 1
    });

    // Log transaction
    await addDoc(collection(db, "users", INV_USER.uid, "transactions"), {
      type:   "investment",
      plan:   INV_PLAN,
      amount: amt,
      status: "active",
      date:   serverTimestamp()
    });

    document.getElementById("invModalOk").style.display = "flex";
    setTimeout(async () => {
      invModalClose("invModal");
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

// ── LOAD HISTORY ───────────────────────────────
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
      const inv   = ds.data();
      const start = inv.startDate?.seconds
        ? new Date(inv.startDate.seconds * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })
        : "—";
      const mat   = inv.maturityDate?.seconds
        ? new Date(inv.maturityDate.seconds * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })
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

// ── PROFIT ENGINE ──────────────────────────────
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
      await invLoadHistory();
    }
  } catch (err) {
    console.error("Profit engine:", err);
  }
}

// ── MODAL HELPERS ──────────────────────────────
function invModalOpen(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("inv-modal-active");
}
function invModalClose(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("inv-modal-active");
}

// ── DOM HELPERS ────────────────────────────────
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