import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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

let currentUser;
let userData;

// ── LOAD USER ─────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  currentUser = user;

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) return;

  userData = snap.data();

  const balance = userData.balance || 0;
  const invested = userData.invested || 0;
  const available = balance - invested;

  document.getElementById("availableBalance").textContent =
    `GHS ${available.toLocaleString()}`;

  loadWithdrawHistory();
});

// ── LIVE SUMMARY ──────────────────────────
const amountInput = document.getElementById("withdrawAmount");

amountInput.addEventListener("input", () => {
  const amount = Number(amountInput.value);
  if (!amount) return;

  const fee = 5;
  const receive = amount - fee;

  document.getElementById("withdrawSummary").style.display = "block";

  document.getElementById("sumAmount").textContent =
    `GHS ${amount.toLocaleString()}`;

  document.getElementById("sumReceive").textContent =
    `GHS ${receive.toLocaleString()}`;
});

// ── WITHDRAW BUTTON ───────────────────────
document.getElementById("withdrawBtn").addEventListener("click", async () => {
  const amount = Number(document.getElementById("withdrawAmount").value);
  const method = document.getElementById("withdrawMethod").value;
  const account = document.getElementById("withdrawAccount").value;

  if (!amount || amount < 10) {
    alert("Enter valid amount");
    return;
  }

  if (!method) {
    alert("Select method");
    return;
  }

  if (!account) {
    alert("Enter account number");
    return;
  }

  const fee = 5;
  const totalDeduct = amount;

  const balance = userData.balance || 0;
  const invested = userData.invested || 0;
  const available = balance - invested;

  if (amount > available) {
    alert("Insufficient balance");
    return;
  }

  // 🔥 UPDATE BALANCE
  const userRef = doc(db, "users", currentUser.uid);

  await updateDoc(userRef, {
    balance: balance - totalDeduct
  });

  // 🔥 SAVE TRANSACTION
  const txRef = collection(db, "users", currentUser.uid, "transactions");

  await addDoc(txRef, {
    type: "withdrawal",
    amount,
    method,
    account, // ✅ THIS IS WHAT YOU WANTED
    status: "pending",
    reference: "WTH-" + Date.now(),
    date: new Date()
  });

  document.getElementById("withdrawSuccess").classList.add("visible");

  // Reset form
  document.getElementById("withdrawAmount").value = "";
  document.getElementById("withdrawAccount").value = "";
  document.getElementById("withdrawSummary").style.display = "none";

  loadWithdrawHistory();
});

// ── LOAD HISTORY ──────────────────────────
async function loadWithdrawHistory() {
  const txRef = collection(db, "users", currentUser.uid, "transactions");
  const q = query(txRef, orderBy("date", "desc"));

  const snapshot = await getDocs(q);

  const table = document.getElementById("withdrawTable");
  table.innerHTML = "";

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

    const row = `
      <tr>
        <td>${tx.reference}</td>
        <td class="tx-amount negative">-GHS ${tx.amount}</td>
        <td>
          ${tx.method}<br>
          <small>${tx.account || ""}</small>
        </td>
        <td>${date}</td>
        <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
      </tr>
    `;

    table.innerHTML += row;
  });
}