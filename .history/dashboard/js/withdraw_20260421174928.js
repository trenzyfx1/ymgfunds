import { auth, db } from "../../js/firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
const FEE = 5;

// ── AUTH CHECK ─────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }

  currentUser = user;
  loadWithdrawals();
});

// ── HANDLE WITHDRAW ─────────────────────
document.getElementById("withdrawBtn").addEventListener("click", async () => {

  const amountInput = document.getElementById("withdrawAmount");
  const method = document.getElementById("withdrawMethod").value;
  const account = document.getElementById("withdrawAccount").value.trim();

  const amount = Number(amountInput.value);

  if (!amount || amount < 10) {
    alert("Minimum withdrawal is GHS 10");
    return;
  }

  if (!method) {
    alert("Select withdrawal method");
    return;
  }

  if (!account) {
    alert("Enter account details");
    return;
  }

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data();

    const balance = data.balance || 0;

    const total = amount + FEE;

    if (balance < total) {
      alert("Insufficient balance");
      return;
    }

    // 🔥 DEDUCT BALANCE
    await updateDoc(userRef, {
      balance: balance - total
    });

    // 🔥 SAVE TRANSACTION
    const txRef = collection(db, "users", currentUser.uid, "transactions");

    await addDoc(txRef, {
      type: "withdrawal",
      amount: amount,
      method: method,
      account: account,
      status: "pending",
      date: new Date()
    });

    document.getElementById("withdrawSuccess").classList.add("visible");

    amountInput.value = "";
    document.getElementById("withdrawAccount").value = "";

    loadWithdrawals();

  } catch (err) {
    console.error(err);
    alert("Withdrawal failed");
  }
});

// ── LOAD WITHDRAWALS ────────────────────
async function loadWithdrawals() {

  const table = document.getElementById("withdrawTable");
  table.innerHTML = "";

  const txRef = collection(db, "users", currentUser.uid, "transactions");
  const q = query(txRef, orderBy("date", "desc"));

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    table.innerHTML = `<tr><td colspan="5">No withdrawals yet</td></tr>`;
    return;
  }

  snapshot.forEach(docSnap => {
    const tx = docSnap.data();

    if (tx.type !== "withdrawal") return;

    const date = tx.date?.seconds
      ? new Date(tx.date.seconds * 1000).toLocaleDateString()
      : "N/A";

    const ref = "#WTH-" + docSnap.id.slice(0, 5).toUpperCase();

    const row = `
      <tr>
        <td>${ref}</td>
        <td class="tx-amount negative">-GHS ${tx.amount.toLocaleString()}</td>
        <td>${tx.method}</td>
        <td>${date}</td>
        <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
      </tr>
    `;

    table.innerHTML += row;
  });
}