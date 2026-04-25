import { auth, db } from "../../";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUser = null;

// ── AUTH CHECK ─────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../pages/login.html";
    return;
  }

  currentUser = user;

  loadUserData();
  loadReferrals();
});

// ── LOAD USER DATA ─────────────────────────
function loadUserData() {
  const userRef = doc(db, "users", currentUser.uid);

  onSnapshot(userRef, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();

    // Stats
    document.getElementById("referralCount").textContent = data.referralCount || 0;

    document.getElementById("referralEarnings").textContent =
      `GHS ${(data.referralEarnings || 0).toFixed(2)}`;

    // Referral code
    const code = data.referralCode || "—";
    document.getElementById("refCode").textContent = code;

    // Referral link
    const link = `${window.location.origin}/pages/signup.html?ref=${code}`;
    document.getElementById("refLink").textContent = link;
  });
}

// ── LOAD REFERRALS LIST ─────────────────────
function loadReferrals() {
  const refCol = collection(db, "users", currentUser.uid, "referrals");
  const q = query(refCol, orderBy("date", "desc"));

  onSnapshot(q, (snap) => {
    const tbody = document.getElementById("referralTableBody");
    tbody.innerHTML = "";

    let pending = 0;
    let success = 0;

    if (snap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty">
            No referrals yet.
          </td>
        </tr>`;
      return;
    }

    snap.forEach(doc => {
      const r = doc.data();

      const date = r.date?.seconds
        ? new Date(r.date.seconds * 1000).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
          })
        : "—";

      const isActivated = r.status === "activated";

      if (isActivated) success++;
      else pending++;

      tbody.innerHTML += `
        <tr>
          <td><strong>${r.name || "User"}</strong></td>
          <td>${date}</td>
          <td>${isActivated ? "Completed" : "—"}</td>
          <td class="tx-amount ${isActivated ? "positive" : ""}">
            ${isActivated ? `+GHS ${r.amountEarned}` : "—"}
          </td>
          <td>
            <span class="status-badge ${isActivated ? "success" : "pending"}">
              ${isActivated ? "Earned" : "Pending"}
            </span>
          </td>
        </tr>
      `;
    });

    // Update stats
    document.getElementById("pendingReferrals").textContent = pending;
    document.getElementById("successfulReferrals").textContent = success;
  });
}

// ── COPY BUTTONS ────────────────────────────
document.getElementById("copyCode").addEventListener("click", () => {
  const code = document.getElementById("refCode").textContent;
  navigator.clipboard.writeText(code);
  showToast();
});

document.getElementById("copyLink").addEventListener("click", () => {
  const link = document.getElementById("refLink").textContent;
  navigator.clipboard.writeText(link);
  showToast();
});

function showToast() {
  const toast = document.getElementById("copiedToast");
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}