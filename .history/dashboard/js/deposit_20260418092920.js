import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, updateDoc, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const paystackLink = "https://paystack.shop/pay/ek45vy29la";

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return (window.location.href = "../pages/login.html");
  currentUser = user;
});

// Quick amounts
document.querySelectorAll(".quick-amt").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("depositAmount").value = btn.dataset.amount;
  });
});

// Deposit button
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

  // save pending transaction before redirect
  await updateDoc(doc(db, "users", currentUser.uid), {
    transactions: arrayUnion({
      type: "deposit",
      amount,
      status: "pending",
      date: new Date(),
      method
    })
  });

  // redirect to paystack
  window.location.href = paystackLink;
});