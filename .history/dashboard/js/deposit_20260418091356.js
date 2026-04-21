import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;

// ── AUTH CHECK ──
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }

  currentUser = user;
  loadBalance();
});

// ── LOAD BALANCE ──
async function loadBalance() {
  const ref = doc(db, "users", currentUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const data = snap.data();

  document.querySelector(".balance-info-bar strong").textContent =
    `GHS ${data.balance?.toLocaleString() || 0}`;
}

// ── DEPOSIT LOGIC ──
document.getElementById("depositBtn").addEventListener("click", async () => {
  const amount = Number(document.getElementById("depositAmount").value);
  const method = document.getElementById("paymentMethod").value;

  if (!amount || amount < 50) {
    alert("Minimum deposit is GHS 50");
    return;
  }

  if (!method) {
    alert("Select payment method");
    return;
  }

  const btn = document.getElementById("depositBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

  try {
    const userRef = doc(db, "users", currentUser.uid);

    // 1. UPDATE BALANCE
    await updateDoc(userRef, {
      balance: increment(amount)
    });

    // 2. ADD TRANSACTION HISTORY
    await updateDoc(userRef, {
      transactions: arrayUnion({
        type: "deposit",
        amount,
        method,
        status: "success",
        date: new Date()
      })
    });

    // UI success
    document.getElementById("depositedAmt").textContent = amount;
    document.getElementById("depositSuccess").classList.add("visible");

    loadBalance();

  } catch (err) {
    console.error(err);
    alert("Deposit failed. Try again.");
  }

  btn.disabled = false;
  btn.innerHTML = `<i class="fa-solid fa-lock"></i> Deposit Now`;
});