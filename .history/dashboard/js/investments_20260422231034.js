import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── PLAN CONFIG ────────────────────────────────
const PLANS = {
  "Starter Savings": {
    rate: 0.005,          // 0.5% per week
    rateType: "weekly",
    minDeposit: 50,
    duration: null,
    tier: "standard",
    label: "Flexible · Weekly Growth"
  },
  "Fixed Deposit": {
    rate: 0.095,          // 9.5% total return
    rateType: "fixed",
    minDeposit: 500,
    duration: 90,
    tier: "standard",
    label: "90 Days · 9.50% Return"
  },
  "Growth Plus": {
    rate: 0.125,          // 12.5% total return
    rateType: "fixed",
    minDeposit: 1000,
    duration: 182,
    tier: "standard",
    label: "182 Days · 12.50% Return"
  },
  "Standard Loan": {
    rate: 0.06,
    rateType: "loan",
    minDeposit: 500,
    maxDeposit: 5000,
    duration: 182,
    tier: "standard",
    label: "GHS 500 – 5,000 · 6% Interest"
  },
  "182-Day Growth Tool": {
    rate: 0.15,
    rateType: "fixed",
    minDeposit: 1000,
    duration: 182,
    tier: "premium",
    label: "182 Days · Up to 15%"
  },
  "365-Day Premium Tool": {
    rate: 0.25,
    rateType: "fixed",
    minDeposit: 2000,
    duration: 365,
    tier: "premium",
    label: "365 Days · Up to 25%"
  },
  "3-Year Wealth Builder": {
    rate: 0.35,
    rateType: "annual",
    minDeposit: 500,
    duration: 1095,
    tier: "premium",
    label: "3 Years · Up to 35%/yr"
  },
  "Premium Loan": {
    rate: 0.04,
    rateType: "loan",
    minDeposit: 500,
    maxDeposit: 30000,
    duration: 365,
    tier: "premium",
    label: "GHS 500 – 30,000 · 4% Interest"
  }
};

let currentUser = null;
let currentPlan = null;
let userBalance = 0;
let standardActivated = false;
let premiumActivated = false;
let activatingTier = null;

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }
  currentUser = user;

  // Load referral code display
  const userRef = doc(db, "users", user.uid);
  onSnapshot(userRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    // Avatar
    const name = data.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const avatar = document.getElementById("profileAvatar");
    if (avatar) avatar.textContent = initials;

    userBalance = typeof data.balance === "number" ? data.balance : 0;
    standardActivated = data.standardActivated || false;
    premiumActivated = data.premiumActivated || false;

    // Referral code
    const codeBox = document.getElementById("referralCodeBox");
    if (codeBox) codeBox.textContent = data.referralCode || user.uid.slice(0, 8).toUpperCase();

    updateActivationUI();
  });

  await loadActiveInvestments();
  await runProfitEngine();
});

// ── LOGOUT ─────────────────────────────────────
document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(btn => {
  if (btn) btn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

// ── UPDATE ACTIVATION UI ───────────────────────
function updateActivationUI() {
  // Standard plans
  const stdBanner = document.getElementById("standardActivationBanner");
  const stdBadge = document.getElementById("standardStatusBadge");
  const stdLocks = ["lock-starter", "lock-fixed", "lock-growth", "lock-std-loan"];

  if (standardActivated) {
    const stdDisclaimer = document.getElementById("standardDisclaimer");
    if (stdDisclaimer) stdDisclaimer.style.display = "flex";
    if (stdBanner) stdBanner.style.display = "none";
    if (stdBadge) {
      stdBadge.innerHTML = '<i class="fa-solid fa-check"></i> Activated';
      stdBadge.classList.add("activated");
    }
    stdLocks.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    document.querySelectorAll("[data-tier='standard']").forEach(btn => btn.disabled = false);
  } else {
    if (stdBanner) stdBanner.style.display = "flex";
    document.querySelectorAll("[data-tier='standard']").forEach(btn => btn.disabled = true);
  }

  // Premium plans
  const premBanner = document.getElementById("premiumActivationBanner");
  const premBadge = document.getElementById("premiumStatusBadge");
  const premLocks = ["lock-p182", "lock-p365", "lock-p3yr", "lock-prem-loan"];
  const refBanner = document.getElementById("referralBonusBanner");

  if (premiumActivated) {
    const premDisclaimer = document.getElementById("premiumDisclaimer");
    if (premDisclaimer) premDisclaimer.style.display = "flex";
    if (premBanner) premBanner.style.display = "none";
    if (premBadge) {
      premBadge.innerHTML = '<i class="fa-solid fa-check"></i> Activated';
      premBadge.classList.add("activated");
    }
    if (refBanner) refBanner.classList.add("unlocked");
    premLocks.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    document.querySelectorAll("[data-tier='premium']").forEach(btn => btn.disabled = false);
  } else {
    if (premBanner) premBanner.style.display = "flex";
    document.querySelectorAll("[data-tier='premium']").forEach(btn => btn.disabled = true);
  }
}

const activateStdBtn = document.getElementById("activateStandardBtn");
if (activateStdBtn) activateStdBtn.addEventListener("click", () => {
  openActivationModal("standard");
});

const activatePremBtn = document.getElementById("activatePremiumBtn");
if (activatePremBtn) activatePremBtn.addEventListener("click", () => {
  openActivationModal("premium");
});

function openActivationModal(tier) {
  activatingTier = tier;
  const fee = tier === "standard" ? 500 : 1000;
  const title = tier === "standard" ? "Activate Standard Plans" : "Activate Premium Plans";
  const icon = tier === "standard" ? "fa-lock-open" : "fa-crown";

  document.getElementById("activationModalTitle").textContent = title;
  document.getElementById("activationModalDesc").textContent =
    `Pay a one-time fee to unlock all ${tier} plans and start investing.`;
  document.getElementById("activationFeeAmount").textContent = `GHS ${fee.toLocaleString()}`;
  document.getElementById("activationUserBalance").textContent =
    `GHS ${userBalance.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
  document.getElementById("activationModalIcon").innerHTML = `<i class="fa-solid ${icon}"></i>`;
  document.getElementById("activationError").textContent = "";
  document.getElementById("activationSuccess").classList.remove("visible");
  document.getElementById("activationModal").classList.add("active");
}

document.getElementById("activationModalClose").addEventListener("click", () => {
  document.getElementById("activationModal").classList.remove("active");
});

document.getElementById("activationModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("activationModal"))
    document.getElementById("activationModal").classList.remove("active");
});

document.getElementById("confirmActivationBtn").addEventListener("click", async () => {
  const fee = activatingTier === "standard" ? 500 : 1000;
  const errorEl = document.getElementById("activationError");
  const btn = document.getElementById("confirmActivationBtn");

  errorEl.textContent = "";

  if (userBalance < fee) {
    errorEl.textContent = `Insufficient balance. You need GHS ${fee.toLocaleString()} to activate.`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    const updateData = {
      balance: (userData.balance || 0) - fee
    };

    if (activatingTier === "standard") updateData.standardActivated = true;
    if (activatingTier === "premium") updateData.premiumActivated = true;

    await updateDoc(userRef, updateData);

    // Log activation transaction
    await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
      type: "activation",
      plan: activatingTier === "standard" ? "Standard Plan Activation" : "Premium Plan Activation",
      amount: fee,
      status: "completed",
      date: serverTimestamp()
    });

    document.getElementById("activationSuccess").classList.add("visible");
    setTimeout(() => {
      document.getElementById("activationModal").classList.remove("active");
    }, 1800);

  } catch (err) {
    console.error("Activation error:", err);
    errorEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-unlock"></i> Pay & Activate';
});

// ── INVEST NOW BUTTONS ─────────────────────────
document.querySelectorAll(".invest-now-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const plan = btn.dataset.plan;
    const tier = btn.dataset.tier;

    // Check activation
    if (tier === "standard" && !standardActivated) {
      openActivationModal("standard");
      return;
    }
    if (tier === "premium" && !premiumActivated) {
      openActivationModal("premium");
      return;
    }

    openInvestModal(plan);
  });
});

// ── OPEN INVEST MODAL ──────────────────────────
function openInvestModal(plan) {
  currentPlan = plan;
  const config = PLANS[plan];
  const isLoan = config.rateType === "loan";

  document.getElementById("modalPlanName").textContent = isLoan ? `Apply for ${plan}` : `Invest in ${plan}`;
  document.getElementById("investAmount").value = "";
  document.getElementById("investSuccess").classList.remove("visible");
  document.getElementById("investError").textContent = "";
  document.getElementById("investPreview").style.display = "none";

  let noteText = `Minimum: GHS ${config.minDeposit.toLocaleString()}`;
  if (isLoan && config.maxDeposit) noteText += ` · Maximum: GHS ${config.maxDeposit.toLocaleString()}`;
  noteText += ` · ${config.label}`;
  document.getElementById("investMinNote").textContent = noteText;

  document.getElementById("confirmInvestBtn").textContent = isLoan ? "Apply for Loan" : "Confirm Investment";
  document.getElementById("investModal").classList.add("active");
}

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("investModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("investModal")) closeModal();
});

function closeModal() {
  document.getElementById("investModal").classList.remove("active");
  document.getElementById("investError").textContent = "";
  document.getElementById("investSuccess").classList.remove("visible");
  document.getElementById("investPreview").style.display = "none";
}

// ── LIVE PREVIEW ───────────────────────────────
document.getElementById("investAmount").addEventListener("input", () => {
  const amount = parseFloat(document.getElementById("investAmount").value);
  const preview = document.getElementById("investPreview");
  const config = PLANS[currentPlan];

  if (!config || !amount || isNaN(amount) || amount <= 0) {
    preview.style.display = "none";
    return;
  }

  let returnAmount = 0;
  let atMaturity = 0;
  const weeklyRow = document.getElementById("previewWeeklyRow");

  if (config.rateType === "weekly") {
    const weeklyProfit = amount * config.rate;
    const monthlyProfit = weeklyProfit * 4;
    document.getElementById("previewReturn").textContent = `+GHS ${monthlyProfit.toFixed(2)} / month`;
    document.getElementById("previewMaturity").textContent = "Flexible — withdraw anytime";
    document.getElementById("previewWeekly").textContent = `+GHS ${weeklyProfit.toFixed(2)}`;
    weeklyRow.style.display = "flex";
  } else if (config.rateType === "annual") {
    returnAmount = amount * config.rate;
    atMaturity = amount + (returnAmount * 3);
    document.getElementById("previewReturn").textContent = `+GHS ${returnAmount.toFixed(2)} / year`;
    document.getElementById("previewMaturity").textContent = `GHS ${atMaturity.toFixed(2)} after 3 years`;
    weeklyRow.style.display = "none";
  } else if (config.rateType === "loan") {
    const interest = amount * config.rate;
    const totalRepay = amount + interest;
    document.getElementById("previewReturn").textContent = `Interest: GHS ${interest.toFixed(2)}`;
    document.getElementById("previewMaturity").textContent = `Total Repayment: GHS ${totalRepay.toFixed(2)}`;
    weeklyRow.style.display = "none";
  } else {
    returnAmount = amount * config.rate;
    atMaturity = amount + returnAmount;
    document.getElementById("previewReturn").textContent = `+GHS ${returnAmount.toFixed(2)}`;
    document.getElementById("previewMaturity").textContent = `GHS ${atMaturity.toFixed(2)}`;
    weeklyRow.style.display = "none";
  }

  preview.style.display = "block";
});

// ── CONFIRM INVESTMENT ─────────────────────────
document.getElementById("confirmInvestBtn").addEventListener("click", async () => {
  const amountVal = parseFloat(document.getElementById("investAmount").value);
  const errorEl = document.getElementById("investError");
  const config = PLANS[currentPlan];
  const btn = document.getElementById("confirmInvestBtn");
  const isLoan = config.rateType === "loan";

  errorEl.textContent = "";

  if (!amountVal || isNaN(amountVal)) {
    errorEl.textContent = "Please enter an amount.";
    return;
  }
  if (amountVal < config.minDeposit) {
    errorEl.textContent = `Minimum is GHS ${config.minDeposit.toLocaleString()}.`;
    return;
  }
  if (config.maxDeposit && amountVal > config.maxDeposit) {
    errorEl.textContent = `Maximum is GHS ${config.maxDeposit.toLocaleString()}.`;
    return;
  }
  if (!isLoan && amountVal > userBalance) {
    errorEl.textContent = "Insufficient balance. Please deposit first.";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

  try {
    const now = new Date();
    const maturityDate = config.duration
      ? new Date(now.getTime() + config.duration * 24 * 60 * 60 * 1000)
      : null;

    // Save investment/loan to Firestore
    await addDoc(collection(db, "users", currentUser.uid, "investments"), {
      plan: currentPlan,
      amount: amountVal,
      rate: config.rate,
      rateType: config.rateType,
      duration: config.duration,
      tier: config.tier,
      isLoan,
      startDate: serverTimestamp(),
      maturityDate: maturityDate ? Timestamp.fromDate(maturityDate) : null,
      profitEarned: 0,
      lastProfitDate: Timestamp.fromDate(now),
      status: "active",
      locked: !isLoan && config.duration !== null
    });

    // Update user balances
    if (!isLoan) {
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      await updateDoc(userRef, {
        balance: (userData.balance || 0) - amountVal,
        invested: (userData.invested || 0) + amountVal,
        activePlans: (userData.activePlans || 0) + 1
      });
    }

    // Log transaction
    await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
      type: isLoan ? "loan" : "investment",
      plan: currentPlan,
      amount: amountVal,
      status: isLoan ? "pending" : "active",
      date: serverTimestamp()
    });

    document.getElementById("investSuccess").classList.add("visible");
    setTimeout(async () => {
      closeModal();
      await loadActiveInvestments();
    }, 1800);

  } catch (err) {
    console.error("Investment error:", err);
    errorEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  btn.innerHTML = isLoan ? "Apply for Loan" : "Confirm Investment";
});

// ── LOAD ACTIVE INVESTMENTS ────────────────────
async function loadActiveInvestments() {
  const tbody = document.getElementById("activeInvestmentsTable");
  tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const investRef = collection(db, "users", currentUser.uid, "investments");
    const q = query(investRef, orderBy("startDate", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No active investments yet. Activate a plan above to get started.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    snap.forEach(docSnap => {
      const inv = docSnap.data();
      const startDate = inv.startDate?.seconds
        ? new Date(inv.startDate.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "—";
      const maturity = inv.maturityDate?.seconds
        ? new Date(inv.maturityDate.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "Flexible";
      const profit = typeof inv.profitEarned === "number" ? inv.profitEarned : 0;
      const statusClass = inv.status === "active" ? "success" : inv.status === "matured" ? "warning" : "pending";

      tbody.innerHTML += `
        <tr>
          <td><strong>${inv.plan}</strong>${inv.isLoan ? ' <span class="loan-tag">Loan</span>' : ''}</td>
          <td>GHS ${Number(inv.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</td>
          <td>${startDate}</td>
          <td>${maturity}</td>
          <td class="tx-amount positive">+GHS ${profit.toLocaleString("en-GH", { minimumFractionDigits: 2 })}</td>
          <td><span class="status-badge ${statusClass}">${inv.status}</span></td>
        </tr>
      `;
    });

  } catch (err) {
    console.error("Load investments error:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load investments.</td></tr>`;
  }
}

// ── PROFIT ENGINE ──────────────────────────────
async function runProfitEngine() {
  try {
    const investRef = collection(db, "users", currentUser.uid, "investments");
    const snap = await getDocs(investRef);
    if (snap.empty) return;

    const now = new Date();
    let totalNewProfit = 0;

    for (const docSnap of snap.docs) {
      const inv = docSnap.data();
      if (inv.status !== "active" || inv.isLoan) continue;

      const lastProfitDate = inv.lastProfitDate?.seconds
        ? new Date(inv.lastProfitDate.seconds * 1000)
        : null;
      if (!lastProfitDate) continue;

      const msSinceLast = now.getTime() - lastProfitDate.getTime();
      let newProfit = 0;

      if (inv.rateType === "weekly") {
        // Credit every 7 days
        const weeksPassed = Math.floor(msSinceLast / (1000 * 60 * 60 * 24 * 7));
        if (weeksPassed < 1) continue;
        newProfit = inv.amount * inv.rate * weeksPassed;
      } else if (inv.rateType === "fixed" || inv.rateType === "annual") {
        // Daily accrual
        const daysPassed = Math.floor(msSinceLast / (1000 * 60 * 60 * 24));
        if (daysPassed < 1) continue;
        const dailyRate = inv.rate / (inv.duration || 365);
        newProfit = inv.amount * dailyRate * daysPassed;
      } else {
        continue;
      }

      if (newProfit <= 0) continue;

      const newProfitEarned = (inv.profitEarned || 0) + newProfit;
      let newStatus = "active";
      if (inv.maturityDate?.seconds && now >= new Date(inv.maturityDate.seconds * 1000)) {
        newStatus = "matured";
      }

      await updateDoc(doc(db, "users", currentUser.uid, "investments", docSnap.id), {
        profitEarned: newProfitEarned,
        lastProfitDate: Timestamp.fromDate(now),
        status: newStatus
      });

      totalNewProfit += newProfit;
    }

    if (totalNewProfit > 0) {
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      await updateDoc(userRef, {
        balance: (userData.balance || 0) + totalNewProfit,
        profit: (userData.profit || 0) + totalNewProfit
      });

      await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
        type: "profit",
        amount: parseFloat(totalNewProfit.toFixed(2)),
        note: "Profit credit",
        status: "completed",
        date: serverTimestamp()
      });

      await loadActiveInvestments();
    }

  } catch (err) {
    console.error("Profit engine error:", err);
  }
}