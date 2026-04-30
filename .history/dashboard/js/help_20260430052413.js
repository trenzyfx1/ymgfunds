import "./init.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FORMSPREE_URL = "https://formspree.io/f/xqewrwyz";

let HLP_USER = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  HLP_USER = user;

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) return;
  const d = snap.data();

  const name     = d.name || "User";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const av = document.getElementById("profileAvatar");
  if (av) av.textContent = initials;

  const nameEl  = document.getElementById("hlpName");
  const emailEl = document.getElementById("hlpEmail");
  if (nameEl  && !nameEl.value)  nameEl.value  = d.name  || "";
  if (emailEl && !emailEl.value) emailEl.value = d.email || user.email || "";
});

document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(btn => {
  if (btn) btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

document.getElementById("hlpSubmitBtn").addEventListener("click", async () => {
  const name    = document.getElementById("hlpName").value.trim();
  const email   = document.getElementById("hlpEmail").value.trim();
  const subject = document.getElementById("hlpSubject").value;
  const message = document.getElementById("hlpMessage").value.trim();
  const errEl   = document.getElementById("hlpErr");
  const btn     = document.getElementById("hlpSubmitBtn");
  errEl.textContent = "";

  if (!name)    { errEl.textContent = "Please enter your full name."; return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = "Please enter a valid email address."; return;
  }
  if (!subject) { errEl.textContent = "Please select a subject."; return; }
  if (!message || message.length < 10) {
    errEl.textContent = "Please enter a message (at least 10 characters)."; return;
  }

  btn.disabled = true;
  document.getElementById("hlpBtnTxt").innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    const res = await fetch(FORMSPREE_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        subject: `Support Request — ${subject} — ${name}`,
        message: `
Hello Admin,

A user has submitted a support request on YMG Funds.

━━━━━━━━━━━━━━━━━━━━━━━━
USER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━
Name:     ${name}
Email:    ${email}
User ID:  ${HLP_USER?.uid || "—"}

━━━━━━━━━━━━━━━━━━━━━━━━
SUPPORT REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━
Subject:  ${subject}
Message:

${message}

━━━━━━━━━━━━━━━━━━━━━━━━
Please respond to the user at: ${email}

— YMG Funds System
        `
      })
    });

    if (res.ok) {
      document.getElementById("hlpSuccess").style.display = "flex";
      document.getElementById("hlpMessage").value  = "";
      document.getElementById("hlpSubject").value  = "";
      document.getElementById("hlpErr").textContent = "";

      setTimeout(() => {
        document.getElementById("hlpSuccess").style.display = "none";
      }, 6000);
    } else {
      errEl.textContent = "Failed to send. Please try again.";
    }

  } catch (err) {
    console.error(err);
    errEl.textContent = "Something went wrong. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("hlpBtnTxt").innerHTML =
    '<i class="fa-solid fa-paper-plane"></i> Send Message';
});

document.querySelectorAll(".hlp-faq-q").forEach(btn => {
  btn.addEventListener("click", () => {
    const faqId  = btn.dataset.faq;
    const answer = document.getElementById(`faq${faqId}`);
    const icon   = btn.querySelector("i");
    const isOpen = answer.classList.contains("open");

    // Close all
    document.querySelectorAll(".hlp-faq-a").forEach(a => a.classList.remove("open"));
    document.querySelectorAll(".hlp-faq-q i").forEach(i => i.style.transform = "");

    if (!isOpen) {
      answer.classList.add("open");
      icon.style.transform = "rotate(180deg)";
    }
  });
});