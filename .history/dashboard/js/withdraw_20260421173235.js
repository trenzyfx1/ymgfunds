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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
let currentBalance = 0;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }

  currentUser = user;

  const snap = await getDoc(doc(db, "users", user.uid));

  if (snap.exists()) {
    const data = snap.data();

    currentBalance = data.balance || 0;

    document.querySelector(".balance-info-bar strong").textContent =
      `GHS ${currentBalance.toLocaleString()}`;
  }
});

// ── LIVE SUMMARY ──
const amountInput = document.getElementById("withdrawAmount");
const summary = document.getElementById("withdrawSummary");

amountInput.addEventListener("input", () => {
  const amt = Number(amountInput.value);

  if (amt > 0) {
    summary.style.display = "block";
    document.getElementById("sumAmount").textContent = `GHS ${amt}`;
    document.getElementById("sumReceive").textContent = `GHS ${amt - 5}`;
  } else {
    summary.style.display = "none";
  }
});

// ── WITHDRAW BUTTON ──
document.getElementById("withdrawBtn").addEventListener("click", async () => {
  const amount = Number(document.getElementById("withdrawAmount").value);
  const method = document.getElementById("withdrawMethod").value;
  const account = document.getElementById("withdrawAccount").value.trim();

  if (!amount || amount < 10) {
    alert("Minimum withdrawal is GHS 10");
    return;
  }

  if (!method) {
    alert("Select withdrawal method");
    return;
  }

  if (!account) {
    alert("Enter account number");
    return;
  }

  const totalDeduct = amount + 5;

  if (totalDeduct > currentBalance) {
    alert("Insufficient balance");
    return;
  }

  const btn = document.getElementById("withdrawBtn");
  btn.disabled = true;
  btn.innerHTML = "Processing...";

  try {
    // 🔥 1. UPDATE BALANCE
    await updateDoc(doc(db, "users", currentUser.uid), {
      balance: currentBalance - totalDeduct
    });

    // 🔥 2. SAVE TRANSACTION
    await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
      type: "withdrawal",
      amount: amount,
      fee: 5,
      method,
      account,
      status: "pending",
      date: serverTimestamp()
    });

    // 🔥 SUCCESS UI
    document.getElementById("withdrawSuccess").classList.add("visible");

    // Reset form
    document.getElementById("withdrawAmount").value = "";
    document.getElementById("withdrawAccount").value = "";
    summary.style.display = "none";

  } catch (err) {
    console.error(err);
    alert("Withdrawal failed");
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Request Withdrawal';
});