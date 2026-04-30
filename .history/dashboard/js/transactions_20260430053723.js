import "./init.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, collection,
  query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let TX_USER = null;
let ALL_TXS = []; 

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  TX_USER = user;

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    const name = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;
  });

  await loadTransactions();
});

document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(b => {
  if (b) b.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

async function loadTransactions() {
  const tbody = document.getElementById("txTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="tx-table-msg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const q    = query(
      collection(db, "users", TX_USER.uid, "transactions"),
      orderBy("date", "desc")
    );
    const snap = await getDocs(q);

    ALL_TXS = [];
    snap.forEach(ds => {
      ALL_TXS.push({ id: ds.id, ...ds.data() });
    });

    let totalDeposit  = 0;
    let totalWithdraw = 0;
    let totalProfit   = 0;
    let totalInvested = 0;

    ALL_TXS.forEach(tx => {
      if (tx.type === "deposit")          totalDeposit  += tx.amount || 0;
      if (tx.type === "withdrawal")       totalWithdraw += tx.gross  || tx.amount || 0;
      if (tx.type === "profit")           totalProfit   += tx.amount || 0;
      if (tx.type === "investment")       totalInvested += tx.amount || 0;
    });

    setEl("txTotalDeposit",   fmtGHS(totalDeposit));
    setEl("txTotalWithdraw",  fmtGHS(totalWithdraw));
    setEl("txTotalProfit",    fmtGHS(totalProfit));
    setEl("txTotalInvested",  fmtGHS(totalInvested));

    renderTable("all");

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="tx-table-msg">Failed to load. Please refresh.</td></tr>`;
  }
}

function renderTable(filter) {
  const tbody = document.getElementById("txTableBody");
  const countEl = document.getElementById("txCount");

  const filtered = filter === "all"
    ? ALL_TXS
    : ALL_TXS.filter(tx => tx.type === filter);

  countEl.textContent = `${filtered.length} record${filtered.length !== 1 ? "s" : ""}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="tx-table-msg">No ${filter === "all" ? "" : filter} transactions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  filtered.forEach(tx => {
    const date = tx.date?.seconds
      ? new Date(tx.date.seconds * 1000).toLocaleDateString("en-GB", {
          day: "2-digit", month: "short", year: "numeric"
        })
      : "—";

    const { icon, label, colorClass, amountPrefix, amountClass } = getTxMeta(tx);

    const ref = tx.reference
      ? `<span class="tx-ref-tag">${tx.reference}</span>`
      : `<span class="tx-ref-tag">${tx.type?.toUpperCase()?.slice(0, 3)}-${tx.id?.slice(0, 6).toUpperCase()}</span>`;

    const description = getTxDescription(tx);
    const statusClass = tx.status === "completed" || tx.status === "success" || tx.status === "active"
      ? "success"
      : tx.status === "failed" || tx.status === "declined"
        ? "danger"
        : "pending";

    const displayStatus = tx.status === "active" ? "active"
      : tx.status === "completed" ? "completed"
      : tx.status === "success"   ? "success"
      : tx.status === "failed"    ? "failed"
      : "pending";

    tbody.innerHTML += `
      <tr>
        <td>${ref}</td>
        <td>
          <span class="tx-type-badge ${colorClass}">
            <i class="${icon}"></i> ${label}
          </span>
        </td>
        <td class="tx-desc">${description}</td>
        <td class="tx-amt ${amountClass}">${amountPrefix}${fmtGHS(tx.amount || 0)}</td>
        <td class="tx-date">${date}</td>
        <td><span class="tx-status-badge ${statusClass}">${displayStatus}</span></td>
      </tr>`;
  });
}

function getTxMeta(tx) {
  switch (tx.type) {
    case "deposit":
      return { icon: "fa-solid fa-arrow-down", label: "Deposit", colorClass: "tx-deposit", amountPrefix: "+", amountClass: "tx-positive" };
    case "withdrawal":
      return { icon: "fa-solid fa-arrow-up", label: "Withdrawal", colorClass: "tx-withdrawal", amountPrefix: "−", amountClass: "tx-negative" };
    case "investment":
      return { icon: "fa-solid fa-chart-line", label: "Investment", colorClass: "tx-investment", amountPrefix: "−", amountClass: "tx-negative" };
    case "profit":
      return { icon: "fa-solid fa-arrow-trend-up", label: "Profit", colorClass: "tx-profit", amountPrefix: "+", amountClass: "tx-positive" };
    case "referral_reward":
      return { icon: "fa-solid fa-gift", label: "Referral", colorClass: "tx-referral", amountPrefix: "+", amountClass: "tx-positive" };
    case "activation":
      return { icon: "fa-solid fa-unlock", label: "Activation", colorClass: "tx-activation", amountPrefix: "−", amountClass: "tx-negative" };
    default:
      return { icon: "fa-solid fa-circle", label: tx.type || "Other", colorClass: "tx-other", amountPrefix: "", amountClass: "" };
  }
}

function getTxDescription(tx) {
  switch (tx.type) {
    case "deposit":
      return `Deposit via Paystack`;
    case "withdrawal":
      return tx.method ? `Withdrawal · ${tx.method}` : "Withdrawal request";
    case "investment":
      return tx.plan ? `Invested in ${tx.plan}` : "Investment";
    case "profit":
      return tx.note || (tx.plan ? `Profit from ${tx.plan}` : "Profit credit");
    case "referral_reward":
      return tx.note || "Referral reward";
    case "activation":
      return tx.plan || "Plan activation fee";
    default:
      return tx.note || "—";
  }
}

document.querySelectorAll(".tx-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".tx-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderTable(chip.dataset.filter);
  });
});

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtGHS(n) {
  return "GHS " + Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}