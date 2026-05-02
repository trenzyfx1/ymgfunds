import { db } from "../../js/firebase.js";
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function fmtGHS(n) {
  return "GHS " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}

function fmtDate(seconds) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function showToast(msg, type = "success") {
  const toast = document.getElementById("admToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `adm-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}

function downloadCSV(filename, rows) {
  const csv     = rows.map(r => r.map(cell => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob    = new Blob([csv], { type: "text/csv" });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = url;
  a.download    = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setBtn(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled   = loading;
  btn.innerHTML  = loading
    ? `<i class="fa-solid fa-spinner fa-spin"></i> Exporting...`
    : `<i class="fa-solid fa-download"></i> CSV`;
}

function setFullBtn(loading) {
  const btn = document.getElementById("exportFull");
  if (!btn) return;
  btn.disabled  = loading;
  btn.innerHTML = loading
    ? `<i class="fa-solid fa-spinner fa-spin"></i> Exporting...`
    : `<i class="fa-solid fa-file-export"></i> CSV`;
}

async function loadSummary() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let totalDep = 0, totalWdr = 0, totalInv = 0, totalProfit = 0, totalBal = 0;
    let depCount = 0, wdrCount = 0, invCount = 0;
    let verified = 0, standard = 0, premium = 0;

    const planCounts = {};

    const promises = users.map(async (user) => {
      totalBal += user.balance || 0;
      if (user.emailVerified)     verified++;
      if (user.standardActivated) standard++;
      if (user.premiumActivated)  premium++;

      const txSnap  = await getDocs(collection(db, "users", user.id, "transactions"));
      const invSnap = await getDocs(collection(db, "users", user.id, "investments"));

      txSnap.forEach(d => {
        const t = d.data();
        if (t.type === "deposit")       { totalDep    += t.amount || 0; depCount++; }
        if (t.type === "withdrawal")    { totalWdr    += t.gross || t.amount || 0; wdrCount++; }
        if (t.type === "profit_credit") { totalProfit += t.amount || 0; }
      });

      invSnap.forEach(d => {
        const i = d.data();
        if (i.status === "active") {
          totalInv += i.amount || 0; invCount++;
          planCounts[i.planName] = (planCounts[i.planName] || 0) + 1;
        }
      });
    });

    await Promise.all(promises);

    document.getElementById("rptUsers").textContent       = users.length;
    document.getElementById("rptDeposits").textContent    = fmtGHS(totalDep);
    document.getElementById("rptWithdrawals").textContent = fmtGHS(totalWdr);
    document.getElementById("rptBalance").textContent     = fmtGHS(totalBal);

    const summaryList = document.getElementById("summaryList");
    const rows = [
      ["Total Users",             users.length],
      ["Email Verified",          `${verified} (${users.length ? Math.round(verified/users.length*100) : 0}%)`],
      ["Standard Activated",      standard],
      ["Premium Activated",       premium],
      ["Total Deposits",          fmtGHS(totalDep)],
      ["Total Deposit Count",     depCount],
      ["Total Withdrawals",       fmtGHS(totalWdr)],
      ["Total Withdrawal Count",  wdrCount],
      ["Active Investments",      `${invCount} plans`],
      ["Total Invested",          fmtGHS(totalInv)],
      ["Total Profits Paid",      fmtGHS(totalProfit)],
      ["Total Platform Balance",  fmtGHS(totalBal)],
      ...Object.entries(planCounts).map(([plan, count]) => [`  → ${plan}`, `${count} active plans`])
    ];

    summaryList.innerHTML = rows.map((r, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${i < rows.length - 1 ? "border-bottom:1px solid var(--adm-border);" : ""}">
        <span style="font-size:0.82rem;color:var(--adm-muted);">${r[0]}</span>
        <strong style="font-size:0.85rem;color:var(--adm-text);">${r[1]}</strong>
      </div>
    `).join("");

    return { users, totalDep, totalWdr, totalInv, totalProfit, totalBal, depCount, wdrCount, invCount, verified, standard, premium, planCounts };

  } catch (err) {
    console.error(err);
    document.getElementById("summaryList").innerHTML = `<p style="color:var(--adm-red);font-size:0.82rem;">Failed to load summary.</p>`;
  }
}

document.getElementById("exportUsers")?.addEventListener("click", async () => {
  setBtn("exportUsers", true);
  try {
    const snap  = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows  = [
      ["Name", "Email", "Phone", "Balance (GHS)", "Account ID", "Email Verified", "Phone Verified", "Standard Activated", "Premium Activated", "Referral Code", "Referral Count", "Country", "Joined Date"]
    ];
    users.forEach(u => {
      rows.push([
        u.name || "", u.email || "", u.phone || "",
        (u.balance || 0).toFixed(2),
        u.id.slice(0, 8).toUpperCase(),
        u.emailVerified ? "Yes" : "No",
        u.phoneVerified ? "Yes" : "No",
        u.standardActivated ? "Yes" : "No",
        u.premiumActivated  ? "Yes" : "No",
        u.referralCode || "",
        u.referralCount || 0,
        u.country || "",
        fmtDate(u.createdAt?.seconds)
      ]);
    });
    downloadCSV(`ymgiq-users-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast(`Exported ${users.length} users.`, "success");
  } catch (err) { console.error(err); showToast("Export failed.", "error"); }
  setBtn("exportUsers", false);
});

document.getElementById("exportDeposits")?.addEventListener("click", async () => {
  setBtn("exportDeposits", true);
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows      = [["User Name", "Email", "Amount (GHS)", "Reference", "Method", "Date", "Status"]];
    const promises  = users.map(async (user) => {
      const txSnap = await getDocs(collection(db, "users", user.id, "transactions"));
      txSnap.forEach(d => {
        const t = d.data();
        if (t.type === "deposit") {
          rows.push([
            user.name || "", user.email || "",
            (t.amount || 0).toFixed(2),
            t.reference || "", t.method || "Paystack",
            fmtDate(t.date?.seconds), t.status || "completed"
          ]);
        }
      });
    });
    await Promise.all(promises);
    downloadCSV(`ymgiq-deposits-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast(`Exported ${rows.length - 1} deposits.`, "success");
  } catch (err) { console.error(err); showToast("Export failed.", "error"); }
  setBtn("exportDeposits", false);
});

document.getElementById("exportWithdrawals")?.addEventListener("click", async () => {
  setBtn("exportWithdrawals", true);
  try {
    const snap  = await getDocs(query(collection(db, "withdrawalRequests"), orderBy("requestDate", "desc")));
    const rows  = [["User Name", "Email", "Phone", "Gross Amount (GHS)", "Fee (GHS)", "Net Amount (GHS)", "Method", "Account Details", "Reference", "Date", "Status"]];
    snap.forEach(d => {
      const w = d.data();
      rows.push([
        w.name || "", w.email || "", w.phone || "",
        (w.gross || w.amount || 0).toFixed(2),
        (w.fee || 0).toFixed(2),
        (w.amount || 0).toFixed(2),
        w.method || "", w.paymentDetails || "",
        w.reference || "",
        fmtDate(w.requestDate?.seconds),
        w.status || "pending"
      ]);
    });
    downloadCSV(`ymgiq-withdrawals-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast(`Exported ${rows.length - 1} withdrawals.`, "success");
  } catch (err) { console.error(err); showToast("Export failed.", "error"); }
  setBtn("exportWithdrawals", false);
});

document.getElementById("exportInvestments")?.addEventListener("click", async () => {
  setBtn("exportInvestments", true);
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows      = [["User Name", "Email", "Plan", "Amount (GHS)", "Return Rate (%)", "Expected Profit (GHS)", "Start Date", "Maturity Date", "Status"]];
    const promises  = users.map(async (user) => {
      const invSnap = await getDocs(collection(db, "users", user.id, "investments"));
      invSnap.forEach(d => {
        const i = d.data();
        const expectedProfit = i.expectedProfit || ((i.amount || 0) * ((i.returnRate || 0) / 100));
        rows.push([
          user.name || "", user.email || "",
          i.planName || "",
          (i.amount || 0).toFixed(2),
          i.returnRate || 0,
          expectedProfit.toFixed(2),
          fmtDate(i.startDate?.seconds),
          fmtDate(i.maturityDate?.seconds),
          i.status || "active"
        ]);
      });
    });
    await Promise.all(promises);
    downloadCSV(`ymgiq-investments-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast(`Exported ${rows.length - 1} investments.`, "success");
  } catch (err) { console.error(err); showToast("Export failed.", "error"); }
  setBtn("exportInvestments", false);
});

document.getElementById("exportTransactions")?.addEventListener("click", async () => {
  setBtn("exportTransactions", true);
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows      = [["User Name", "Email", "Type", "Amount (GHS)", "Reference", "Date", "Status"]];
    const promises  = users.map(async (user) => {
      const txSnap = await getDocs(collection(db, "users", user.id, "transactions"));
      txSnap.forEach(d => {
        const t   = d.data();
        const amt = t.type === "withdrawal" ? (t.gross || t.amount || 0) : (t.amount || 0);
        rows.push([
          user.name || "", user.email || "",
          t.type || "", amt.toFixed(2),
          t.reference || "",
          fmtDate(t.date?.seconds),
          t.status || "completed"
        ]);
      });
    });
    await Promise.all(promises);
    downloadCSV(`ymgiq-transactions-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast(`Exported ${rows.length - 1} transactions.`, "success");
  } catch (err) { console.error(err); showToast("Export failed.", "error"); }
  setBtn("exportTransactions", false);
});

document.getElementById("exportFull")?.addEventListener("click", async () => {
  setFullBtn(true);
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let totalDep = 0, totalWdr = 0, totalBal = 0, totalProfit = 0;
    let verified = 0, standard = 0, premium = 0;
    const planCounts = {};

    const promises = users.map(async (user) => {
      totalBal += user.balance || 0;
      if (user.emailVerified)     verified++;
      if (user.standardActivated) standard++;
      if (user.premiumActivated)  premium++;

      const txSnap  = await getDocs(collection(db, "users", user.id, "transactions"));
      const invSnap = await getDocs(collection(db, "users", user.id, "investments"));

      txSnap.forEach(d => {
        const t = d.data();
        if (t.type === "deposit")       totalDep    += t.amount || 0;
        if (t.type === "withdrawal")    totalWdr    += t.gross || t.amount || 0;
        if (t.type === "profit_credit") totalProfit += t.amount || 0;
      });

      invSnap.forEach(d => {
        const i = d.data();
        if (i.status === "active") planCounts[i.planName] = (planCounts[i.planName] || 0) + 1;
      });
    });

    await Promise.all(promises);

    const rows = [
      ["YMG IQ Platform Report", `Generated: ${new Date().toLocaleDateString("en-GB")}`],
      [],
      ["METRIC", "VALUE"],
      ["Total Users",            users.length],
      ["Email Verified Users",   verified],
      ["Standard Activated",     standard],
      ["Premium Activated",      premium],
      [],
      ["Total Deposits",         totalDep.toFixed(2)],
      ["Total Withdrawals",      totalWdr.toFixed(2)],
      ["Total Profits Paid",     totalProfit.toFixed(2)],
      ["Total Platform Balance", totalBal.toFixed(2)],
      [],
      ["ACTIVE PLAN BREAKDOWN",  ""],
      ...Object.entries(planCounts).map(([plan, count]) => [plan, count])
    ];

    downloadCSV(`ymgiq-full-report-${new Date().toISOString().slice(0,10)}.csv`, rows);
    showToast("Full platform report exported.", "success");
  } catch (err) { console.error(err); showToast("Export failed.", "error"); }
  setFullBtn(false);
});

document.getElementById("admRefresh")?.addEventListener("click", loadSummary);

loadSummary();