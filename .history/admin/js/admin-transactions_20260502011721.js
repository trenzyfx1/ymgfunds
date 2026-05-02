import { db } from "../../js/firebase.js";
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const PAGE_SIZE    = 25;
let allTransactions = [];
let currentPage     = 1;

function fmtGHS(n) {
  return "GHS " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}

function fmtDate(seconds) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function isToday(seconds) {
  if (!seconds) return false;
  const d = new Date(seconds * 1000);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

function isThisWeek(seconds) {
  if (!seconds) return false;
  const d = new Date(seconds * 1000);
  const week = new Date(); week.setDate(week.getDate() - 7);
  return d >= week;
}

function isThisMonth(seconds) {
  if (!seconds) return false;
  const d = new Date(seconds * 1000); const n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

function txTypeLabel(type) {
  const map = {
    deposit:        { label: "Deposit",        color: "completed" },
    withdrawal:     { label: "Withdrawal",     color: "failed" },
    investment:     { label: "Investment",     color: "active" },
    profit_credit:  { label: "Profit Credit",  color: "completed" },
    referral_bonus: { label: "Referral Bonus", color: "completed" },
    activation:     { label: "Activation",     color: "active" },
    refund:         { label: "Refund",         color: "pending" },
  };
  return map[type] || { label: type || "—", color: "pending" };
}

function txAmountColor(type) {
  if (type === "deposit" || type === "profit_credit" || type === "referral_bonus" || type === "refund") return "var(--adm-green)";
  if (type === "withdrawal" || type === "investment" || type === "activation") return "var(--adm-red)";
  return "var(--adm-text)";
}

function txAmountSign(type) {
  if (type === "deposit" || type === "profit_credit" || type === "referral_bonus" || type === "refund") return "+";
  return "−";
}

async function loadTransactions() {
  const tbody = document.getElementById("txTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
  allTransactions = [];

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const promises = users.map(async (user) => {
      const txSnap = await getDocs(
        query(collection(db, "users", user.id, "transactions"), orderBy("date", "desc"))
      );
      txSnap.forEach(d => {
        allTransactions.push({
          ...d.data(),
          txId:      d.id,
          userName:  user.name,
          userEmail: user.email,
          userId:    user.id
        });
      });
    });

    await Promise.all(promises);

    allTransactions.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

    let depCount = 0, depAmt = 0;
    let wdrCount = 0, wdrAmt = 0;
    let invCount = 0, invAmt = 0;
    let profCount = 0, profAmt = 0;

    allTransactions.forEach(t => {
      const amt = t.amount || 0;
      if (t.type === "deposit")       { depCount++;  depAmt  += amt; }
      if (t.type === "withdrawal")    { wdrCount++;  wdrAmt  += t.gross || amt; }
      if (t.type === "investment")    { invCount++;  invAmt  += amt; }
      if (t.type === "profit_credit") { profCount++; profAmt += amt; }
    });

    document.getElementById("statAll").textContent      = allTransactions.length;
    document.getElementById("statDep").textContent      = depCount;
    document.getElementById("statDepAmt").textContent   = fmtGHS(depAmt);
    document.getElementById("statWdr").textContent      = wdrCount;
    document.getElementById("statWdrAmt").textContent   = fmtGHS(wdrAmt);
    document.getElementById("statInv").textContent      = invCount;
    document.getElementById("statInvAmt").textContent   = fmtGHS(invAmt);
    document.getElementById("statProfit").textContent   = profCount;
    document.getElementById("statProfitAmt").textContent = fmtGHS(profAmt);

    currentPage = 1;
    renderTable(getFiltered());

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function getFiltered() {
  const type   = document.getElementById("txTypeFilter")?.value   || "all";
  const period = document.getElementById("txPeriodFilter")?.value || "all";
  const search = document.getElementById("txSearch")?.value.toLowerCase() || "";

  return allTransactions.filter(t => {
    const sec = t.date?.seconds;

    const matchType   = type   === "all" || t.type === type;
    const matchPeriod =
      period === "today" ? isToday(sec) :
      period === "week"  ? isThisWeek(sec) :
      period === "month" ? isThisMonth(sec) :
      true;
    const matchSearch = !search ||
      (t.userName  || "").toLowerCase().includes(search) ||
      (t.userEmail || "").toLowerCase().includes(search) ||
      (t.reference || "").toLowerCase().includes(search);

    return matchType && matchPeriod && matchSearch;
  });
}

function renderTable(data) {
  const tbody  = document.getElementById("txTableBody");
  const total  = data.length;
  const start  = (currentPage - 1) * PAGE_SIZE;
  const end    = Math.min(start + PAGE_SIZE, total);
  const page   = data.slice(start, end);

  document.getElementById("txPageInfo").textContent =
    `Showing ${total === 0 ? 0 : start + 1}–${end} of ${total} transactions`;

  const prevBtn = document.getElementById("txPrevBtn");
  const nextBtn = document.getElementById("txNextBtn");
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = end >= total;

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty">No transactions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = page.map(t => {
    const { label, color } = txTypeLabel(t.type);
    const amtColor = txAmountColor(t.type);
    const sign     = txAmountSign(t.type);
    const amt      = t.type === "withdrawal" ? (t.gross || t.amount || 0) : (t.amount || 0);

    return `
      <tr>
        <td><span style="font-size:0.72rem;color:var(--adm-muted);font-family:monospace;">${t.reference || "—"}</span></td>
        <td>
          <div class="adm-user-cell">
            <div class="adm-user-av">${initials(t.userName)}</div>
            <div>
              <p class="adm-user-name">${t.userName || "—"}</p>
              <p class="adm-user-email">${t.userEmail || ""}</p>
            </div>
          </div>
        </td>
        <td><span class="adm-badge ${color}">${label}</span></td>
        <td><strong style="color:${amtColor};">${sign}${fmtGHS(amt)}</strong></td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(t.date?.seconds)}</td>
        <td><span class="adm-badge ${t.status === "completed" || !t.status ? "completed" : t.status === "pending" ? "pending" : "failed"}">${t.status || "completed"}</span></td>
      </tr>
    `;
  }).join("");
}

document.getElementById("txTypeFilter")?.addEventListener("change",   () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("txPeriodFilter")?.addEventListener("change", () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("txSearch")?.addEventListener("input",        () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("admRefresh")?.addEventListener("click", loadTransactions);

document.getElementById("txPrevBtn")?.addEventListener("click", () => {
  if (currentPage > 1) { currentPage--; renderTable(getFiltered()); }
});

document.getElementById("txNextBtn")?.addEventListener("click", () => {
  if (currentPage * PAGE_SIZE < getFiltered().length) { currentPage++; renderTable(getFiltered()); }
});

loadTransactions();