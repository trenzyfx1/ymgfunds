import { auth, db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── DOM ─────────────────────────────
const refCodeEl = document.getElementById("refCode");
const refLinkEl = document.getElementById("refLink");

const referralCountEl = document.getElementById("referralCount");
const referralEarningsEl = document.getElementById("referralEarnings");
const pendingReferralsEl = document.getElementById("pendingReferrals");
const successfulReferralsEl = document.getElementById("successfulReferrals");

const tableBody = document.getElementById("referralTableBody");

// ── COPY BUTTONS ────────────────────
document.getElementById("copyCode").addEventListener("click", () => {
  navigator.clipboard.writeText(refCodeEl.textContent);
  showToast();
});

document.getElementById("copyLink").addEventListener("click", () => {
  navigator.clipboard.writeText(refLinkEl.textContent);
  showToast();
});

function showToast() {
  const toast = document.getElementById("copiedToast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ── LOAD USER DATA ──────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return;

    const data = userSnap.data();

    // ✅ Set referral code
    refCodeEl.textContent = data.referralCode;

    // ✅ Set referral link (VERY IMPORTANT)
    const link = `${window.location.origin}/pages/signup.html?ref=${data.referralCode}`;
    refLinkEl.textContent = link;

    // ✅ Stats
    referralCountEl.textContent = data.referralCount || 0;
    referralEarningsEl.textContent = "GHS " + (data.referralEarnings || 0).toFixed(2);

    // ── LOAD REFERRALS LIST ──────────
    const refCol = collection(db, "users", user.uid, "referrals");
    const snap = await getDocs(refCol);

    let pending = 0;
    let success = 0;

    tableBody.innerHTML = "";

    snap.forEach((docSnap) => {
      const ref = docSnap.data();

      const status = ref.status === "completed" ? "success" : "pending";

      if (status === "pending") pending++;
      else success++;

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td><strong>${ref.name}</strong></td>
        <td>${formatDate(ref.date)}</td>
        <td>${ref.deposit || "—"}</td>
        <td class="tx-amount ${status === "success" ? "positive" : ""}">
          ${status === "success" ? "+GHS 0.01" : "—"}
        </td>
        <td>
          <span class="status-badge ${status}">
            ${status === "success" ? "Earned" : "Pending"}
          </span>
        </td>
      `;

      tableBody.appendChild(tr);
    });

    pendingReferralsEl.textContent = pending;
    successfulReferralsEl.textContent = success;

  } catch (err) {
    console.error("❌ Error loading referrals:", err);
  }
});

// ── DATE FORMAT ─────────────────────
function formatDate(timestamp) {
  if (!timestamp) return "—";

  const date = timestamp.toDate();
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}