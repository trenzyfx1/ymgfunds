import { auth, db } from "../../js/firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Only redirect if fully authenticated (session + PIN both done)
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const loginTime = sessionStorage.getItem("admin_login_time");
  if (loginTime) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists() && snap.data().isAdmin) {
      window.location.href = "./index.html";
    } else {
      await signOut(auth);
    }
  }
});

document.getElementById("admEyeBtn")?.addEventListener("click", () => {
  const inp = document.getElementById("adminPassword");
  const ico = document.getElementById("admEyeIco");
  const hidden = inp.type === "password";
  inp.type      = hidden ? "text" : "password";
  ico.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
});

document.getElementById("adminPassword")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("adminLoginBtn")?.click();
});

// Stored after password verified — used by PIN step
let cachedAdminPin = null;

document.getElementById("adminLoginBtn")?.addEventListener("click", async () => {
  const email    = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const errEl    = document.getElementById("adminErr");
  const denied   = document.getElementById("accessDenied");
  const btn      = document.getElementById("adminLoginBtn");
  const icon     = document.getElementById("adminBtnIcon");
  const text     = document.getElementById("adminBtnText");

  errEl.textContent    = "";
  denied.style.display = "none";

  if (!email)    { errEl.textContent = "Please enter your email address."; return; }
  if (!password) { errEl.textContent = "Please enter your password."; return; }

  btn.disabled     = true;
  icon.className   = "fa-solid fa-spinner fa-spin";
  text.textContent = "Verifying...";

  try {
    await setPersistence(auth, browserSessionPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user           = userCredential.user;
    const snap           = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists() || !snap.data().isAdmin) {
      await signOut(auth);
      denied.style.display = "flex";
      document.getElementById("accessDeniedMsg").textContent = "Access denied. You do not have admin privileges.";
      btn.disabled     = false;
      icon.className   = "fa-solid fa-arrow-right-to-bracket";
      text.textContent = "Login to Admin Panel";
      return;
    }

    const adminPin = snap.data().adminPin;
    if (!adminPin) {
      errEl.textContent = "No 2FA PIN set on this account. Please contact the system administrator.";
      await signOut(auth);
      btn.disabled     = false;
      icon.className   = "fa-solid fa-arrow-right-to-bracket";
      text.textContent = "Login to Admin Panel";
      return;
    }

    // Cache PIN for comparison — no need to re-authenticate
    cachedAdminPin = adminPin;

    // Stay signed in — just show PIN form
    document.getElementById("adminLoginForm").style.display = "none";
    document.getElementById("adminPinForm").style.display   = "block";
    document.querySelectorAll(".adm-pin-box")[0]?.focus();

  } catch (err) {
    btn.disabled     = false;
    icon.className   = "fa-solid fa-arrow-right-to-bracket";
    text.textContent = "Login to Admin Panel";

    if (
      err.code === "auth/user-not-found"    ||
      err.code === "auth/wrong-password"    ||
      err.code === "auth/invalid-credential"
    ) {
      errEl.textContent = "Incorrect email or password.";
    } else if (err.code === "auth/too-many-requests") {
      errEl.textContent = "Too many failed attempts. Please try again later.";
    } else {
      errEl.textContent = "Login failed. Please try again.";
    }
  }
});

document.querySelectorAll(".adm-pin-box").forEach((box, i, boxes) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/\D/g, "").slice(0, 1);
    if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
    if (i === boxes.length - 1 && box.value) {
      document.getElementById("adminPinBtn")?.click();
    }
  });
  box.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
    if (e.key === "Enter") document.getElementById("adminPinBtn")?.click();
  });
});

document.getElementById("adminPinBtn")?.addEventListener("click", async () => {
  const pin   = Array.from(document.querySelectorAll(".adm-pin-box")).map(b => b.value).join("");
  const errEl = document.getElementById("adminPinErr");
  const btn   = document.getElementById("adminPinBtn");

  errEl.textContent = "";

  if (pin.length < 6) { errEl.textContent = "Please enter the full 6-digit PIN."; return; }
  if (!cachedAdminPin) { errEl.textContent = "Session expired. Please log in again."; showLoginForm(); return; }

  btn.disabled         = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

  if (pin !== cachedAdminPin) {
    await signOut(auth);
    cachedAdminPin = null;
    errEl.textContent = "Incorrect PIN. Please try again.";
    document.querySelectorAll(".adm-pin-box").forEach(b => b.value = "");
    document.querySelectorAll(".adm-pin-box")[0]?.focus();
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-shield-check"></i> Verify PIN';
    return;
  }

  // PIN correct — set session and redirect
  sessionStorage.setItem("admin_login_time", Date.now().toString());
  window.location.href = "./index.html";
});

document.getElementById("adminPinBack")?.addEventListener("click", () => {
  showLoginForm();
});

function showLoginForm() {
  cachedAdminPin = null;
  signOut(auth).catch(() => {});
  document.getElementById("adminLoginForm").style.display = "block";
  document.getElementById("adminPinForm").style.display   = "none";
  document.querySelectorAll(".adm-pin-box").forEach(b => b.value = "");
  document.getElementById("adminPinErr").textContent = "";
  const btn  = document.getElementById("adminLoginBtn");
  const icon = document.getElementById("adminBtnIcon");
  const text = document.getElementById("adminBtnText");
  if (btn)  btn.disabled     = false;
  if (icon) icon.className   = "fa-solid fa-arrow-right-to-bracket";
  if (text) text.textContent = "Login to Admin Panel";
}