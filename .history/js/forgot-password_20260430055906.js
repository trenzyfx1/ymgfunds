
import { auth } from "./firebase.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.getElementById("resetBtn").addEventListener("click", async () => {
  const email   = document.getElementById("resetEmail").value.trim();
  const errEl   = document.getElementById("resetErr");
  const emailEr = document.getElementById("resetEmailError");
  const btn     = document.getElementById("resetBtn");
  const btnText = document.getElementById("resetBtnText");
  const btnIcon = document.getElementById("resetBtnIcon");

  errEl.textContent   = "";
  emailEr.textContent = "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailEr.textContent = "Please enter a valid email address.";
    return;
  }

  btn.disabled      = true;
  btnText.textContent = "Sending...";
  btnIcon.className   = "fa-solid fa-spinner fa-spin";

  try {
    await sendPasswordResetEmail(auth, email);
    document.getElementById("resetSuccess").style.display = "flex";
    document.getElementById("resetEmail").value = "";
    btnText.textContent = "Email Sent!";
    btnIcon.className   = "fa-solid fa-check";
  } catch (err) {
    console.error(err);
    if (err.code === "auth/user-not-found") {
      errEl.textContent = "No account found with this email address.";
    } else if (err.code === "auth/too-many-requests") {
      errEl.textContent = "Too many attempts. Please try again later.";
    } else {
      errEl.textContent = "Failed to send reset email. Please try again.";
    }
    btn.disabled      = false;
    btnText.textContent = "Send Reset Email";
    btnIcon.className   = "fa-solid fa-paper-plane";
  }
});

document.getElementById("resetEmail").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("resetBtn").click();
});