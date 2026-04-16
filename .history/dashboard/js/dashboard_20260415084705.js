import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── AUTH CHECK ───────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }

  try {
    // ── GET USER DATA ───────────────────────
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();

      // ── USER NAME ────────────────────────
      document.getElementById("userName").textContent = data.name || "User";

      // Avatar initials
      const initials = data.name
        ? data.name.split(" ").map(n => n[0]).join("").toUpperCase()
        : "U";
      document.getElementById("profileAvatar").textContent = initials;

      // ── BALANCES ─────────────────────────
      const balance = data.balance || 0;
      const invested = data.invested || 0;
      const profit = data.profit || 0;

      document.getElementById("totalBalance").textContent = `GHS ${balance.toLocaleString()}`;
      document.getElementById("investedBalance").textContent = `GHS ${invested.toLocaleString()}`;
      document.getElementById("profitBalance").textContent = `GHS ${profit.toLocaleString()}`;
      document.getElementById("availableBalance").textContent = `GHS ${(balance - invested).toLocaleString()}`;

      // ── QUICK STATS (fallback for now) ────
      document.getElementById("activeInvestments").textContent = data.activePlans || 0;
      document.getElementById("referrals").textContent = data.referrals || 0;
    }

    // ── LOAD TRANSACTIONS ──────────────────
    const txRef = collection(db, "users", user.uid, "transactions");
    const q = query(txRef, orderBy("date", "desc"), limit(5));

    const querySnapshot = await getDocs(q);

    const table = document.getElementById("transactionTable");
    table.innerHTML = "";

    if (querySnapshot.empty) {
      table.innerHTML = `<tr><td colspan="4">No transactions yet</td></tr>`;
      return;
    }

    let totalDeposits = 0;
    let totalWithdrawals = 0;

    querySnapshot.forEach((docSnap) => {
      const tx = docSnap.data();

      // Count totals
      if (tx.type === "deposit") totalDeposits += tx.amount;
      if (tx.type === "withdrawal") totalWithdrawals += tx.amount;

      const row = `
        <tr>
          <td>
            <span class="tx-type ${tx.type}">
              <i class="fa-solid ${
                tx.type === "deposit"
                  ? "fa-arrow-down"
                  : tx.type === "withdrawal"
                  ? "fa-arrow-up"
                  : "fa-arrow-trend-up"
              }"></i>
              ${tx.type}
            </span>
          </td>
          <td class="tx-amount ${tx.type === "withdrawal" ? "negative" : "positive"}">
            ${tx.type === "withdrawal" ? "-" : "+"}GHS ${tx.amount.toLocaleString()}
          </td>
          <td>${new Date(tx.date?.seconds * 1000).toLocaleDateString()}</td>
          <td>
            <span class="status-badge ${tx.status}">
              ${tx.status}
            </span>
          </td>
        </tr>
      `;

      table.innerHTML += row;
    });

    // ── UPDATE TOTALS ──────────────────────
    document.getElementById("totalDeposits").textContent = `GHS ${totalDeposits.toLocaleString()}`;
    document.getElementById("totalWithdrawals").textContent = `GHS ${totalWithdrawals.toLocaleString()}`;

  } catch (error) {
    console.error("Dashboard error:", error);
  }
});

// ── LOGOUT ──────────────────────────────────
const logoutBtns = [document.getElementById("logoutBtn"), document.getElementById("logoutBtn2")];

logoutBtns.forEach(btn => {
  if (btn) {
    btn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "../pages/login.html";
    });
  }
});