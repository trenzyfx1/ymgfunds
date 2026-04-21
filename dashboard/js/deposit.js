// import { auth, db } from "./firebase.js";
// import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
// import { doc, updateDoc, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// const paystackLink = "https://paystack.shop/pay/ek45vy29la";

// let currentUser = null;

// onAuthStateChanged(auth, (user) => {
//   if (!user) return (window.location.href = "../pages/login.html");
//   currentUser = user;
// });

// // Quick amounts
// document.querySelectorAll(".quick-amt").forEach(btn => {
//   btn.addEventListener("click", () => {
//     document.getElementById("depositAmount").value = btn.dataset.amount;
//   });
// });

// // Deposit button
// document.getElementById("depositBtn").addEventListener("click", async () => {
//   const amount = Number(document.getElementById("depositAmount").value);
//   const method = document.getElementById("paymentMethod").value;

//   if (!amount || amount < 50) {
//     alert("Minimum deposit is GHS 50");
//     return;
//   }

//   if (!method) {
//     alert("Select payment method");
//     return;
//   }

//   // save pending transaction before redirect
//   await updateDoc(doc(db, "users", currentUser.uid), {
//     transactions: arrayUnion({
//       type: "deposit",
//       amount,
//       status: "pending",
//       date: new Date(),
//       method
//     })
//   });

//   // redirect to paystack
//   window.location.href = paystackLink;
// });

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