import { createNotification, Notifs } from "./notify-helper.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, addDoc, updateDoc,
  collection, getDocs, query, orderBy, where,
  serverTimestamp, onSnapshot, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {


// ── REPLACE THIS WITH CLIENT'S REAL PAYSTACK PUBLIC KEY ──
const PAYSTACK_PUBLIC_KEY = "pk_test_1715e22f3504664a394797de9d84fe31720e67a1"; // TEST KEY
// ─────────────────────────────────────────────────────────
// pk_test_1715e22f3504664a394797de9d84fe31720e67a1
// pk_live_bbf9be7a02b476503f3608a1a30ca24114186c7d
const DEPOSIT_FEE_PERCENT = 0.02; // 2% processing fee
const REFERRAL_REWARD     = 10;   // GHS 10 per successful referral

let DEP_USER    = null;
let DEP_EMAIL   = null;
let DEP_BALANCE = 0;

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  DEP_USER  = user;
  DEP_EMAIL = user.email;

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    DEP_BALANCE = typeof d.balance === "number" ? d.balance : 0;

    const name = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;

    document.getElementById("currentBalance").textContent   = fmtGHS(DEP_BALANCE);
    document.getElementById("availableBalance").textContent = fmtGHS(DEP_BALANCE);
  });

  await loadDepositHistory();
});

// ── LOGOUT ─────────────────────────────────────
document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(b => {
  if (b) b.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

// ── QUICK AMOUNT BUTTONS ───────────────────────
document.querySelectorAll(".dep-quick-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dep-quick-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const amount = parseFloat(btn.dataset.amount);
    document.getElementById("depositAmount").value = amount;
    updateSummary(amount);
  });
});

// ── AMOUNT INPUT ───────────────────────────────
document.getElementById("depositAmount").addEventListener("input", () => {
  document.querySelectorAll(".dep-quick-btn").forEach(b => b.classList.remove("active"));
  const amount = parseFloat(document.getElementById("depositAmount").value);
  updateSummary(amount);
});

function updateSummary(amount) {
  const summary = document.getElementById("depSummary");
  const errEl   = document.getElementById("depError");
  errEl.textContent = "";

  if (!amount || isNaN(amount) || amount <= 0) {
    summary.style.display = "none";
    return;
  }

  const fee = parseFloat((amount * DEPOSIT_FEE_PERCENT).toFixed(2));
  const net = parseFloat((amount - fee).toFixed(2));

  document.getElementById("summaryAmt").textContent  = fmtGHS(amount);
  document.getElementById("summaryFee").textContent  = `− ${fmtGHS(fee)}`;
  document.getElementById("summaryNet").textContent  = fmtGHS(net > 0 ? net : 0);
  summary.style.display = "block";
}

// ── DEPOSIT BUTTON ─────────────────────────────
document.getElementById("depositBtn").addEventListener("click", () => {
  const amount  = parseFloat(document.getElementById("depositAmount").value);
  const errEl   = document.getElementById("depError");
  errEl.textContent = "";

  if (!amount || isNaN(amount)) {
    errEl.textContent = "Please enter a deposit amount.";
    return;
  }
  if (amount < 50) {
    errEl.textContent = "Minimum deposit is GHS 50.00.";
    return;
  }

  initPaystack(amount);
});

// ── PAYSTACK ───────────────────────────────────
function initPaystack(amount) {
  if (!DEP_USER) {
    document.getElementById("depError").textContent = "Session error. Please refresh the page and try again.";
    return;
  }

  const btn = document.getElementById("depositBtn");
  btn.disabled = true;
  document.getElementById("depBtnTxt").textContent = "Opening payment...";

  const amountInPesewas = Math.round(amount * 100);
  const reference = "YMG_" + new Date().getTime() + "_" + Math.random().toString(36).slice(2, 7).toUpperCase();

  const handler = window.PaystackPop.setup({
    key:      PAYSTACK_PUBLIC_KEY,
    email:    DEP_EMAIL,
    amount:   amountInPesewas,
    currency: "GHS",
    ref:      reference,
    metadata: {
      custom_fields: [
        { display_name: "User ID",  variable_name: "user_id",  value: DEP_USER.uid },
        { display_name: "Platform", variable_name: "platform", value: "YMG Funds"  }
      ]
    },
    onClose: () => {
      btn.disabled = false;
      document.getElementById("depBtnTxt").textContent = "Pay Now";
    },
    callback: (response) => {
      handlePaymentSuccess(amount, response.reference).then(() => {
        btn.disabled = false;
        document.getElementById("depBtnTxt").textContent = "Pay Now";
      });
    }
  });

  handler.openIframe();
}

// ── HANDLE SUCCESSFUL PAYMENT ──────────────────
async function handlePaymentSuccess(amount, reference) {
  try {
    const fee       = parseFloat((amount * DEPOSIT_FEE_PERCENT).toFixed(2));
    const netAmount = parseFloat((amount - fee).toFixed(2));

    // Update user balance
    const uRef  = doc(db, "users", DEP_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();

    await updateDoc(uRef, {
      balance: (uData.balance || 0) + netAmount
    });

    // Log deposit transaction
    await addDoc(collection(db, "users", DEP_USER.uid, "transactions"), {
      type:      "deposit",
      amount:    netAmount,
      gross:     amount,
      fee:       fee,
      method:    "Paystack",
      reference: reference,
      status:    "completed",
      date:      serverTimestamp()
    });

    // ── REFERRAL CREDIT — trigger on first deposit ──
    await handleReferralCredit(uData);

    // Show success
    document.getElementById("depositedAmt").textContent =
      netAmount.toLocaleString("en-GH", { minimumFractionDigits: 2 });
    document.getElementById("depositSuccess").style.display = "flex";
    document.getElementById("depositAmount").value = "";
    document.getElementById("depSummary").style.display = "none";
    document.querySelectorAll(".dep-quick-btn").forEach(b => b.classList.remove("active"));

    setTimeout(() => {
      document.getElementById("depositSuccess").style.display = "none";
    }, 5000);

    await loadDepositHistory();

  } catch (err) {
    console.error("Payment processing error:", err);
    document.getElementById("depError").textContent =
      "Payment received but failed to update balance. Please contact support with reference: " + reference;
  }
}

// ── REFERRAL CREDIT ────────────────────────────
// Called after every deposit — only triggers on the FIRST deposit
async function handleReferralCredit(uData) {
  try {
    // Check if this user was referred
    const referredBy = uData.referredBy;
    if (!referredBy) return;

    // Check if this is their first deposit
    // If referralRewarded is already true, skip
    if (uData.referralRewarded) return;

    // Find the referrer by their referral code
    const q    = query(collection(db, "users"), where("referralCode", "==", referredBy));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const referrerDoc  = snap.docs[0];
    const referrerId   = referrerDoc.id;
    const referrerData = referrerDoc.data();

    // Prevent self-referral
    if (referrerId === DEP_USER.uid) return;

    // Credit GHS 10 to referrer's balance
    await updateDoc(doc(db, "users", referrerId), {
      balance:          (referrerData.balance || 0) + REFERRAL_REWARD,
      referralEarnings: (referrerData.referralEarnings || 0) + REFERRAL_REWARD
    });

    // Log reward as a transaction for the referrer
    await addDoc(collection(db, "users", referrerId, "transactions"), {
      type:   "referral_reward",
      amount: REFERRAL_REWARD,
      note:   `Referral reward from ${uData.name || "a new user"}`,
      status: "completed",
      date:   serverTimestamp()
    });

    // Update the referral record to "completed"
    const refCol  = collection(db, "users", referrerId, "referrals");
    const refSnap = await getDocs(refCol);
    refSnap.forEach(async (refDoc) => {
      if (refDoc.data().userId === DEP_USER.uid) {
        await updateDoc(doc(db, "users", referrerId, "referrals", refDoc.id), {
          status:      "completed",
          amountEarned: REFERRAL_REWARD,
          depositedAt:  serverTimestamp()
        });
      }
    });

    // Mark this user as referral-rewarded so it doesn't trigger again
    await updateDoc(doc(db, "users", DEP_USER.uid), {
      referralRewarded: true
    });

    console.log("✅ Referral reward credited to", referrerId);

  } catch (err) {
    console.error("Referral credit error:", err);
  }
}

// ── LOAD DEPOSIT HISTORY ───────────────────────
async function loadDepositHistory() {
  const tbody = document.getElementById("depositTable");
  tbody.innerHTML = `<tr><td colspan="6" class="dep-table-msg"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const q    = query(
      collection(db, "users", DEP_USER.uid, "transactions"),
      orderBy("date", "desc")
    );
    const snap = await getDocs(q);

    const deposits = [];
    snap.forEach(ds => {
      const tx = ds.data();
      if (tx.type === "deposit") deposits.push(tx);
    });

    if (deposits.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="dep-table-msg">No deposits yet. Make your first deposit above.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    deposits.forEach(tx => {
      const date = tx.date?.seconds
        ? new Date(tx.date.seconds * 1000).toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric"
          })
        : "—";

      const ref = tx.reference
        ? `<span class="dep-ref-tag">${tx.reference}</span>`
        : "—";

      const statusClass = tx.status === "completed" ? "success"
        : tx.status === "failed" ? "danger" : "pending";

      tbody.innerHTML += `
        <tr>
          <td>${ref}</td>
          <td class="dep-amount-pos">+${fmtGHS(tx.gross || tx.amount || 0)}</td>
          <td class="dep-fee-cell">−${fmtGHS(tx.fee || 0)}</td>
          <td class="dep-amount-pos">+${fmtGHS(tx.amount || 0)}</td>
          <td>${date}</td>
          <td><span class="dep-status ${statusClass}">${tx.status || "pending"}</span></td>
        </tr>`;
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="dep-table-msg">Failed to load history. Please refresh.</td></tr>`;
  }
}

// ── HELPERS ────────────────────────────────────
function fmtGHS(n) {
  return "GHS " + Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}