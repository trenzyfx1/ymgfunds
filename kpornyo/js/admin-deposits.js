import { db } from "../../js/firebase.js";
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const PAGE_SIZE  = 25;
let allDeposits  = [];
let currentPage  = 1;

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
  const d    = new Date(seconds * 1000);
  const now  = new Date();
  const week = new Date(now);
  week.setDate(now.getDate() - 7);
  return d >= week;
}

function isThisMonth(seconds) {
  if (!seconds) return false;
  const d   = new Date(seconds * 1000);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

async function loadDeposits() {
  const tbody = document.getElementById("depTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
  allDeposits = [];

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const promises = users.map(async (user) => {
      const txSnap = await getDocs(
        query(collection(db, "users", user.id, "transactions"), orderBy("date", "desc"))
      );
      txSnap.forEach(d => {
        const t = d.data();
        if (t.type === "deposit") {
          allDeposits.push({ ...t, txId: d.id, userName: user.name, userEmail: user.email, userId: user.id });
        }
      });
    });

    await Promise.all(promises);

    allDeposits.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

    let total = 0, totalCount = 0;
    let todayAmt = 0, todayCount = 0;
    let weekAmt = 0, weekCount = 0;
    let monthAmt = 0, monthCount = 0;

    allDeposits.forEach(d => {
      const amt = d.amount || 0;
      const sec = d.date?.seconds;
      total += amt; totalCount++;
      if (isToday(sec))     { todayAmt += amt; todayCount++; }
      if (isThisWeek(sec))  { weekAmt  += amt; weekCount++; }
      if (isThisMonth(sec)) { monthAmt += amt; monthCount++; }
    });

    document.getElementById("statTotal").textContent      = fmtGHS(total);
    document.getElementById("statCount").textContent      = `${totalCount} transactions`;
    document.getElementById("statToday").textContent      = fmtGHS(todayAmt);
    document.getElementById("statTodayCount").textContent = `${todayCount} deposits`;
    document.getElementById("statWeek").textContent       = fmtGHS(weekAmt);
    document.getElementById("statWeekCount").textContent  = `${weekCount} deposits`;
    document.getElementById("statMonth").textContent      = fmtGHS(monthAmt);
    document.getElementById("statMonthCount").textContent = `${monthCount} deposits`;

    currentPage = 1;
    renderTable(getFiltered());

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function getFiltered() {
  const filter = document.getElementById("depFilter")?.value || "all";
  const search = document.getElementById("depSearch")?.value.toLowerCase() || "";

  return allDeposits.filter(d => {
    const sec = d.date?.seconds;
    const matchFilter =
      filter === "today" ? isToday(sec) :
      filter === "week"  ? isThisWeek(sec) :
      filter === "month" ? isThisMonth(sec) :
      true;

    const matchSearch = !search ||
      (d.userName   || "").toLowerCase().includes(search) ||
      (d.userEmail  || "").toLowerCase().includes(search) ||
      (d.reference  || "").toLowerCase().includes(search);

    return matchFilter && matchSearch;
  });
}

function renderTable(data) {
  const tbody  = document.getElementById("depTableBody");
  const total  = data.length;
  const start  = (currentPage - 1) * PAGE_SIZE;
  const end    = Math.min(start + PAGE_SIZE, total);
  const page   = data.slice(start, end);

  document.getElementById("depPageInfo").textContent =
    `Showing ${total === 0 ? 0 : start + 1}–${end} of ${total} deposits`;

  const prevBtn = document.getElementById("depPrevBtn");
  const nextBtn = document.getElementById("depNextBtn");
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = end >= total;

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty">No deposits found.</td></tr>`;
    return;
  }

  tbody.innerHTML = page.map(d => `
    <tr>
      <td><span style="font-size:0.72rem;color:var(--adm-muted);font-family:monospace;">${d.reference || "—"}</span></td>
      <td>
        <div class="adm-user-cell">
          <div class="adm-user-av">${initials(d.userName)}</div>
          <div>
            <p class="adm-user-name">${d.userName || "—"}</p>
            <p class="adm-user-email">${d.userEmail || ""}</p>
          </div>
        </div>
      </td>
      <td><strong style="color:var(--adm-green);">${fmtGHS(d.amount)}</strong></td>
      <td style="font-size:0.78rem;">${d.method || d.channel || "Paystack"}</td>
      <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(d.date?.seconds)}</td>
      <td><span class="adm-badge ${d.status === "completed" || !d.status ? "completed" : d.status}">${d.status || "completed"}</span></td>
    </tr>
  `).join("");
}

document.getElementById("depFilter")?.addEventListener("change", () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("depSearch")?.addEventListener("input",  () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("admRefresh")?.addEventListener("click", loadDeposits);

document.getElementById("depPrevBtn")?.addEventListener("click", () => {
  if (currentPage > 1) { currentPage--; renderTable(getFiltered()); }
});

document.getElementById("depNextBtn")?.addEventListener("click", () => {
  if (currentPage * PAGE_SIZE < getFiltered().length) { currentPage++; renderTable(getFiltered()); }
});

loadDeposits();