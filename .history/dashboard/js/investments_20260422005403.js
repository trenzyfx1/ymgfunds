import { auth, db } from "../../js/f";
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
    monthlyRate: 0.01,
    dailyRate: 0.01 / 30,
    minDeposit: 50,
    duration: null,
    label: "Flexible"
  },
  "Fixed Deposit": {
    monthlyRate: 0.015,
    dailyRate: 0.015 / 30,
    minDeposit: 500,
    duration: 30,
    label: "30 Days"
  },
  "Growth Plus 3M": {
    monthlyRate: 0.02,
    dailyRate: 0.02 / 30,
    minDeposit: 1000,
    duration: 90,
    label: "3 Months"
  },
  "Growth Plus 6M": {
    monthlyRate: 0.025,
    dailyRate: 0.025 / 30,
    minDeposit: 1000,
    duration: 180,
    label: "6 Months"
  },
  "Growth Plus 12M": {
    monthlyRate: 0.03,
    dailyRate: 0.03 / 30,
    minDeposit: 1000,
    duration: 365,
    label: "12 Months"
  }
};

let currentUser = null;
let currentPlan = "Starter Savings"; // always initialized
let userBalance = 0;

// ── EVERYTHING RUNS AFTER DOM IS READY ─────────
document.addEventListener("DOMContentLoaded", () => {

  // ── AUTH ─────────────────────────────────────
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../pages/login.html";
      return;
    }
    currentUser = user;

    const userRef = doc(db, "users", user.uid);
    onSnapshot(userRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const name = data.name || "User";
      const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
      const avatar = document.getElementById("profileAvatar");
      if (avatar) avatar.textContent = initials;
      userBalance = typeof data.balance === "number" ? data.balance : 0;
    });

    await loadActiveInvestments();
    await runDailyProfitEngine();
  });

  // ── LOGOUT ───────────────────────────────────
  document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(btn => {
    if (btn) btn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "../pages/login.html";
    });
  });

  // ── INVEST NOW BUTTONS ────────────────────────
  document.querySelectorAll(".invest-now-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const plan = btn.dataset.plan;
      openInvestModal(plan);
    });
  });

  // ── GROWTH PLUS DURATION BUTTONS ─────────────
  document.querySelectorAll(".gp-duration-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".gp-duration-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentPlan = `Growth Plus ${btn.dataset.duration}`;
      const config = PLANS[currentPlan];
      document.getElementById("investMinNote").textContent =
        `Minimum: GHS ${config.minDeposit.toLocaleString()} · ${(config.monthlyRate * 100).toFixed(1)}%/month · ${config.label}`;
      // Reset preview when duration changes
      document.getElementById("investPreview").style.display = "none";
      document.getElementById("investAmount").value = "";
    });
  });

  // ── CLOSE MODAL ───────────────────────────────
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("investModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("investModal")) closeModal();
  });

  // ── LIVE PROFIT PREVIEW ───────────────────────
  document.getElementById("investAmount").addEventListener("input", () => {
    const amount = parseFloat(document.getElementById("investAmount").value);
    const preview = document.getElementById("investPreview");
    const config = PLANS[currentPlan];

    if (!config || !amount || isNaN(amount) || amount <= 0) {
      preview.style.display = "none";
      return;
    }

    const daily = amount * config.dailyRate;
    const monthly = amount * config.monthlyRate;
    const atMaturity = config.duration ? amount + (daily * config.duration) : null;

    document.getElementById("previewDaily").textContent = "+GHS " + daily.toFixed(2);
    document.getElementById("previewMonthly").textContent = "+GHS " + monthly.toFixed(2);

    const maturityRow = document.getElementById("previewMaturityRow");
    if (atMaturity) {
      document.getElementById("previewMaturity").textContent = "GHS " + atMaturity.toFixed(2);
      maturityRow.style.display = "flex";
    } else {
      maturityRow.style.display = "none";
    }
    preview.style.display = "block";
  });

  // ── CONFIRM INVESTMENT ────────────────────────
  document.getElementById("confirmInvestBtn").addEventListener("click", async () => {
    const amountVal = parseFloat(document.getElementById("investAmount").value);
    const errorEl = document.getElementById("investError");
    const config = PLANS[currentPlan];
    const btn = document.getElementById("confirmInvestBtn");

    errorEl.textContent = "";

    if (!amountVal || isNaN(amountVal)) {
      errorEl.textContent = "Please enter an amount.";
      return;
    }
    if (amountVal < config.minDeposit) {
      errorEl.textContent = `Minimum investment is GHS ${config.minDeposit.toLocaleString()}.`;
      return;
    }
    if (amountVal > userBalance) {
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

      // Save investment to Firestore
      await addDoc(collection(db, "users", currentUser.uid, "investments"), {
        plan: currentPlan,
        amount: amountVal,
        dailyRate: config.dailyRate,
        monthlyRate: config.monthlyRate,
        duration: config.duration,
        startDate: serverTimestamp(),
        maturityDate: maturityDate ? Timestamp.fromDate(maturityDate) : null,
        profitEarned: 0,
        lastProfitDate: Timestamp.fromDate(now),
        status: "active",
        locked: config.duration !== null
      });

      // Deduct from balance, add to invested
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      await updateDoc(userRef, {
        balance: (userData.balance || 0) - amountVal,
        invested: (userData.invested || 0) + amountVal,
        activePlans: (userData.activePlans || 0) + 1
      });

      // Log transaction
      await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
        type: "investment",
        plan: currentPlan,
        amount: amountVal,
        status: "active",
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
    btn.innerHTML = "Confirm Investment";
  });

}); // end DOMContentLoaded

// ── HELPERS ────────────────────────────────────
function openInvestModal(plan) {
  currentPlan = plan;
  const config = PLANS[plan];

  document.getElementById("modalPlanName").textContent = `Invest in ${plan}`;
  document.getElementById("investAmount").value = "";
  document.getElementById("investSuccess").classList.remove("visible");
  document.getElementById("investError").textContent = "";
  document.getElementById("investPreview").style.display = "none";
  document.getElementById("investMinNote").textContent =
    `Minimum: GHS ${config.minDeposit.toLocaleString()} · ${(config.monthlyRate * 100).toFixed(1)}%/month`;

  const gpPicker = document.getElementById("gpDurationPicker");
  if (plan === "Growth Plus") {
    gpPicker.style.display = "block";
    currentPlan = "Growth Plus 3M";
    document.querySelectorAll(".gp-duration-btn").forEach((b, i) => {
      b.classList.toggle("active", i === 0);
    });
    // Update note for default GP duration
    const gpConfig = PLANS["Growth Plus 3M"];
    document.getElementById("investMinNote").textContent =
      `Minimum: GHS ${gpConfig.minDeposit.toLocaleString()} · ${(gpConfig.monthlyRate * 100).toFixed(1)}%/month · ${gpConfig.label}`;
  } else {
    gpPicker.style.display = "none";
  }

  document.getElementById("investModal").classList.add("active");
}

function closeModal() {
  document.getElementById("investModal").classList.remove("active");
  document.getElementById("investError").textContent = "";
  document.getElementById("investSuccess").classList.remove("visible");
  document.getElementById("investPreview").style.display = "none";
}

// ── LOAD ACTIVE INVESTMENTS ────────────────────
async function loadActiveInvestments() {
  const tbody = document.getElementById("activeInvestmentsTable");
  tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const investRef = collection(db, "users", currentUser.uid, "investments");
    const q = query(investRef, orderBy("startDate", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No active investments yet. Choose a plan above to get started.</td></tr>`;
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
          <td><strong>${inv.plan}</strong></td>
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

// ── DAILY PROFIT ENGINE ────────────────────────
async function runDailyProfitEngine() {
  try {
    const investRef = collection(db, "users", currentUser.uid, "investments");
    const snap = await getDocs(investRef);
    if (snap.empty) return;

    const now = new Date();
    let totalNewProfit = 0;

    for (const docSnap of snap.docs) {
      const inv = docSnap.data();
      if (inv.status !== "active") continue;

      const lastProfitDate = inv.lastProfitDate?.seconds
        ? new Date(inv.lastProfitDate.seconds * 1000)
        : null;

      if (!lastProfitDate) continue;

      const msSinceLast = now.getTime() - lastProfitDate.getTime();
      const daysPassed = Math.floor(msSinceLast / (1000 * 60 * 60 * 24));

      if (daysPassed < 1) continue;

      const dailyProfit = inv.amount * inv.dailyRate * daysPassed;
      const newProfitEarned = (inv.profitEarned || 0) + dailyProfit;

      let newStatus = "active";
      if (inv.maturityDate?.seconds) {
        if (now >= new Date(inv.maturityDate.seconds * 1000)) newStatus = "matured";
      }

      await updateDoc(doc(db, "users", currentUser.uid, "investments", docSnap.id), {
        profitEarned: newProfitEarned,
        lastProfitDate: Timestamp.fromDate(now),
        status: newStatus
      });

      totalNewProfit += dailyProfit;
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
        note: "Daily profit credit",
        status: "completed",
        date: serverTimestamp()
      });

      await loadActiveInvestments();
    }

  } catch (err) {
    console.error("Profit engine error:", err);
  }
}