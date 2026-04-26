import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, addDoc, updateDoc,
  collection, getDocs, query, orderBy,
  serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── REPLACE THIS WITH CLIENT'S REAL PAYSTACK PUBLIC KEY ──
const PAYSTACK_PUBLIC_KEY = "pk_test_1715e22f3504664a394797de9d84fe31720e67a1";
// ─────────────────────────────────────────────────────────

const DEPOSIT_FEE = 5; // GHS 5 processing fee

let DEP_USER    = null;
let DEP_EMAIL   = null;
let DEP_BALANCE = 0;
let DEP_INVESTED = 0;

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  DEP_USER  = user;
  DEP_EMAIL = user.email;

  // Real-time balance updates
  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    DEP_BALANCE  = typeof d.balance  === "number" ? d.balance  : 0;
    DEP_INVESTED = typeof d.invested === "number" ? d.invested : 0;

    // Avatar
    const name = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;

    document.getElementById("currentBalance").textContent =
      fmtGHS(DEP_BALANCE);
    document.getElementById("availableBalance").textContent =
      fmtGHS(DEP_BALANCE);
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

  const net = amount - DEPOSIT_FEE;
  document.getElementById("summaryAmt").textContent = fmtGHS(amount);
  document.getElementById("summaryNet").textContent = fmtGHS(net > 0 ? net : 0);
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
  if (amount <= DEPOSIT_FEE) {
    errEl.textContent = `Amount must be greater than the GHS ${DEPOSIT_FEE} processing fee.`;
    return;
  }

  initPaystack(amount);
});

// ── PAYSTACK ───────────────────────────────────
function initPaystack(amount) {
  const btn = document.getElementById("depositBtn");
  btn.disabled = true;
  document.getElementById("depBtnTxt").textContent = "Opening payment...";

  // Paystack takes amount in pesewas (kobo) — multiply by 100
  // But since this is GHS (Ghana Cedis), Paystack Ghana uses pesewas
  const amountInPesewas = Math.round(amount * 100);
  const reference = "YMG_" + new Date().getTime() + "_" + Math.random().toString(36).slice(2, 7).toUpperCase();

  const handler = window.PaystackPop.setup({
    key:       PAYSTACK_PUBLIC_KEY,
    email:     DEP_EMAIL,
    amount:    amountInPesewas,
    currency:  "GHS",
    ref:       reference,
    metadata: {
      custom_fields: [
        { display_name: "User ID",   variable_name: "user_id",   value: DEP_USER.uid },
        { display_name: "Platform",  variable_name: "platform",  value: "YMG Funds"  }
      ]
    },
    onClose: () => {
      btn.disabled = false;
      document.getElementById("depBtnTxt").textContent = "Pay Now";
    },
    callback: async (response) => {
      // Payment successful — response.reference is the Paystack reference
      await handlePaymentSuccess(amount, response.reference);
      btn.disabled = false;
      document.getElementById("depBtnTxt").textContent = "Pay Now";
    }
  });

  handler.openIframe();
}

// ── HANDLE SUCCESSFUL PAYMENT ──────────────────
async function handlePaymentSuccess(amount, reference) {
  try {
    const netAmount = amount - DEPOSIT_FEE; // what user actually receives

    // Update user balance in Firestore
    const uRef  = doc(db, "users", DEP_USER.uid);
    const uSnap = await getDoc(uRef);
    const uData = uSnap.data();

    await updateDoc(uRef, {
      balance: (uData.balance || 0) + netAmount
    });

    // Log transaction
    await addDoc(collection(db, "users", DEP_USER.uid, "transactions"), {
      type:      "deposit",
      amount:    netAmount,
      gross:     amount,
      fee:       DEPOSIT_FEE,
      method:    "Paystack",
      reference: reference,
      status:    "completed",
      date:      serverTimestamp()
    });

    // Show success
    document.getElementById("depositedAmt").textContent = netAmount.toLocaleString("en-GH", { minimumFractionDigits: 2 });
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

      const statusClass = tx.status === "completed" ? "success" : tx.status === "failed" ? "danger" : "pending";

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