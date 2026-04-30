// DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG FUNDS. ALL RIGHTS RESERVED.
import "./init.js";
import { initNotifications } from "./notifications.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, collection, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const REFERRAL_REWARD = 10;

const refCodeEl             = document.getElementById("refCode");
const refLinkEl             = document.getElementById("refLink");
const referralCountEl       = document.getElementById("referralCount");
const referralEarningsEl    = document.getElementById("referralEarnings");
const pendingReferralsEl    = document.getElementById("pendingReferrals");
const successfulReferralsEl = document.getElementById("successfulReferrals");
const tableBody             = document.getElementById("referralTableBody");

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

document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(btn => {
  if (btn) btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }

  initNotifications(user.uid);

  try {
    onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      const name     = data.name || "User";
      const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
      const av = document.getElementById("profileAvatar");
      if (av) av.textContent = initials;

      const code = data.referralCode || user.uid.slice(0, 8).toUpperCase();
      refCodeEl.textContent = code;
      refLinkEl.textContent = `${window.location.origin}/pages/signup.html?ref=${code}`;

      referralCountEl.textContent    = data.referralCount    || 0;
      referralEarningsEl.textContent = `GHS ${(data.referralEarnings || 0).toFixed(2)}`;
    });

    onSnapshot(collection(db, "users", user.uid, "referrals"), (snap) => {
      let pending = 0;
      let success = 0;
      tableBody.innerHTML = "";

      if (snap.empty) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#888;">No referrals yet. Share your code to get started.</td></tr>`;
        pendingReferralsEl.textContent    = 0;
        successfulReferralsEl.textContent = 0;
        return;
      }

      const refs = [];
      snap.forEach(ds => refs.push({ id: ds.id, ...ds.data() }));
      refs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      refs.forEach(ref => {
        const status = ref.status === "completed" ? "completed" : "pending";
        if (status === "pending") pending++;
        else                      success++;

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

      pendingReferralsEl.textContent    = pending;
      successfulReferralsEl.textContent = success;
    });

  } catch (err) {
    console.error("Referrals error:", err);
  }
});