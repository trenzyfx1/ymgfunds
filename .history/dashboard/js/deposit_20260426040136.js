

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) return;

  const data = snap.data();

  // ✅ BALANCE
  const balance = data.balance || 0;
  const invested = data.invested || 0;

  document.getElementById("currentBalance").textContent =
    `GHS ${balance.toLocaleString()}`;

  document.getElementById("availableBalance").textContent =
    `GHS ${(balance - invested).toLocaleString()}`;

  // ✅ LOAD DEPOSIT HISTORY
  const txRef = collection(db, "users", user.uid, "transactions");
  const q = query(txRef, orderBy("date", "desc"));

  const snapshotTx = await getDocs(q);

  const table = document.getElementById("depositTable");
  table.innerHTML = "";

  if (snapshotTx.empty) {
    table.innerHTML = `<tr><td colspan="5">No deposits yet</td></tr>`;
    return;
  }

  snapshotTx.forEach(docSnap => {
    const tx = docSnap.data();

    if (tx.type !== "deposit") return;

    const date = tx.date?.seconds
      ? new Date(tx.date.seconds * 1000).toLocaleDateString()
      : "N/A";

    const row = `
      <tr>
        <td>${tx.reference || "-"}</td>
        <td class="tx-amount positive">+GHS ${tx.amount?.toLocaleString()}</td>
        <td>${tx.method || "N/A"}</td>
        <td>${date}</td>
        <td><span class="status-badge ${tx.status || "pending"}">${tx.status || "pending"}</span></td>
      </tr>
    `;

    table.innerHTML += row;
  });
});