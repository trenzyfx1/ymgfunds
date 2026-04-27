import { auth, db } from "../../js/firebase.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const REFERRAL_REWARD = 10; // GHS 10 per successful referral

// ── DOM ─────────────────────────────────────
const refCodeEl           = document.getElementById("refCode");
const refLinkEl           = document.getElementById("refLink");
const referralCountEl     = document.getElementById("referralCount");
const referralEarningsEl  = document.getElementById("referralEarnings");
const pendingReferralsEl  = document.getElementById("pendingReferrals");
const successfulReferralsEl = document.getElementById("successfulReferrals");
const tableBody           = document.getElementById("referralTableBody");

// ── COPY BUTTONS ────────────────────────────
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

// ── LOAD DATA ───────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) return;
    const data = userSnap.data();

    // Referral code + link
    const code = data.referralCode || user.uid.slice(0, 8).toUpperCase();
    refCodeEl.textContent = code;
    refLinkEl.textContent = `${window.location.origin}/pages/signup.html?ref=${code}`;

    // Avatar
    const name = data.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;

    // Stats
    referralCountEl.textContent    = data.referralCount    || 0;
    referralEarningsEl.textContent = `GHS ${(data.referralEarnings || 0).toFixed(2)}`;

    // Load referral records
    const snap = await getDocs(collection(db, "users", user.uid, "referrals"));

    let pending = 0;
    let success = 0;
    tableBody.innerHTML = "";

    if (snap.empty) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#888;">No referrals yet. Share your code to get started.</td></tr>`;
    } else {
      snap.forEach(docSnap => {
        const ref    = docSnap.data();
        const status = ref.status === "completed" ? "completed" : "pending";
        if (status === "pending")   pending++;
        else                        success++;

        const joinedDate = ref.createdAt?.seconds
          ? new Date(ref.createdAt.seconds * 1000).toLocaleDateString("en-GB", {
              day: "2-digit", month: "short", year: "numeric"
            })
          : "—";

        const depositDate = ref.depositedAt?.seconds
          ? new Date(ref.depositedAt.seconds * 1000).toLocaleDateString("en-GB", {
              day: "2-digit", month: "short", year: "numeric"
            })
          : "—";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${ref.name || "User"}</strong></td>
          <td>${joinedDate}</td>
          <td>${depositDate}</td>
          <td class="tx-amount ${status === "completed" ? "positive" : ""}">
            ${status === "completed" ? `+GHS ${REFERRAL_REWARD.toFixed(2)}` : "—"}
          </td>
          <td>
            <span class="status-badge ${status === "completed" ? "success" : "pending"}">
              ${status === "completed" ? "Earned" : "Pending"}
            </span>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    }

    pendingReferralsEl.textContent   = pending;
    successfulReferralsEl.textContent = success;

  } catch (err) {
    console.error("Referrals error:", err);
  }
});