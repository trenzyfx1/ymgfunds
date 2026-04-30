//DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG FUNDS. ALL RIGHTS RESERVED.
const FORMSPREE_URL = "https://formspree.io/f/xqewrwyz";

const sendBtn    = document.getElementById("sendBtn");
const formSuccess = document.getElementById("formSuccess");
const fullName   = document.getElementById("fullName");
const email      = document.getElementById("email");
const subject    = document.getElementById("subject");
const message    = document.getElementById("message");

sendBtn.addEventListener("click", async () => {
  [fullName, email, subject, message].forEach(f => {
    f.style.borderColor = "";
  });

  let valid = true;
  [fullName, email, subject, message].forEach(field => {
    if (!field.value.trim()) {
      field.style.borderColor = "#e05c5c";
      field.addEventListener("input", () => {
        field.style.borderColor = "";
      }, { once: true });
      valid = false;
    }
  });

  if (!valid) return;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    email.style.borderColor = "#e05c5c";
    return;
  }

  sendBtn.disabled = true;
  sendBtn.innerHTML = "<span>Sending...</span> <i class='fa-solid fa-spinner fa-spin'></i>";

  try {
    const res = await fetch(FORMSPREE_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        subject: `Contact Form — ${subject.value.trim()} — ${fullName.value.trim()}`,
        message: `
Name:    ${fullName.value.trim()}
Email:   ${email.value.trim()}
Subject: ${subject.value.trim()}

Message:
${message.value.trim()}

— YMG Funds Contact Form
        `
      })
    });

    if (res.ok) {
      sendBtn.style.display = "none";
      formSuccess.classList.add("visible");
      fullName.value = "";
      email.value    = "";
      subject.value  = "";
      message.value  = "";
    } else {
      sendBtn.disabled = false;
      sendBtn.innerHTML = "<span>Send Message</span> <i class='fa-solid fa-paper-plane'></i>";
      alert("Failed to send. Please try again or email us directly.");
    }

  } catch (err) {
    console.error(err);
    sendBtn.disabled = false;
    sendBtn.innerHTML = "<span>Send Message</span> <i class='fa-solid fa-paper-plane'></i>";
    alert("Network error. Please check your connection and try again.");
  }
});