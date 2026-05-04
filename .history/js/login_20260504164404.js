import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc,
  collection, query, where, getDocs,
  serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const passwordInput = document.getElementById('password');
const eyeIcon       = document.getElementById('eyeIcon');
const toggleBtn     = document.getElementById('togglePassword');

toggleBtn.addEventListener('click', () => {
  const isHidden     = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  eyeIcon.className  = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

function showError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.classList.add('error');
  if (error) error.textContent = message;
}

function showSuspendedError() {
  const emailInput = document.getElementById('email');
  const errorEl   = document.getElementById('emailError');

  if (emailInput) emailInput.classList.add('error');

  const suspendedBanner = document.getElementById('suspendedBanner');
  if (suspendedBanner) {
    suspendedBanner.style.display = "flex";
    return;
  }

  const form = document.querySelector('.auth-form') ||
               document.querySelector('form') ||
               document.querySelector('.login-card') ||
               document.getElementById('email')?.parentElement?.parentElement;

  if (form) {
    const existing = document.getElementById('suspendedBannerDynamic');
    if (existing) { existing.style.display = "flex"; return; }

    const banner = document.createElement('div');
    banner.id    = 'suspendedBannerDynamic';
    banner.style.cssText = `
      display:flex;align-items:flex-start;gap:12px;
      background:#fef2f2;border:1px solid #fecaca;border-radius:10px;
      padding:14px 16px;margin-bottom:16px;
    `;
    banner.innerHTML = `
      <i class="fa-solid fa-ban" style="color:#dc2626;margin-top:2px;flex-shrink:0;"></i>
      <div>
        <strong style="display:block;font-size:0.88rem;color:#dc2626;margin-bottom:4px;">Account Suspended</strong>
        <p style="font-size:0.82rem;color:#555;margin:0 0 8px 0;line-height:1.5;">
          Your account has been suspended. You cannot access YMG IQ at this time.
        </p>
        <a href="help.html" style="font-size:0.8rem;color:#dc2626;font-weight:700;text-decoration:underline;">
          Contact Support / Appeal →
        </a>
      </div>
    `;
    form.insertBefore(banner, form.firstChild);
  } else if (errorEl) {
    errorEl.innerHTML = `
      Account suspended. <a href="help.html" style="color:#dc2626;font-weight:700;text-decoration:underline;">Contact Support →</a>
    `;
  }
}

function clearErrors() {
  ['email', 'password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('error');
  });
  ['emailError', 'passwordError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  const banner = document.getElementById('suspendedBannerDynamic');
  if (banner) banner.style.display = 'none';
}

function getDeviceInfo() {
  const ua      = navigator.userAgent;
  const isPhone = /iPhone|Android|Mobile/i.test(ua);
  const isMac   = /Mac/i.test(ua);
  const isWin   = /Windows/i.test(ua);
  const isLinux = /Linux/i.test(ua);

  let browser = "Unknown Browser";
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua))  browser = "Chrome";
  else if (/Firefox/i.test(ua))                 browser = "Firefox";
  else if (/Safari/i.test(ua))                  browser = "Safari";
  else if (/Edg/i.test(ua))                     browser = "Edge";

  let os = "Unknown OS";
  if (isPhone && /iPhone/i.test(ua))  os = "iPhone";
  else if (isPhone)                   os = "Android";
  else if (isMac)                     os = "Mac";
  else if (isWin)                     os = "Windows";
  else if (isLinux)                   os = "Linux";

  return `${browser} on ${os}`;
}

async function syncEmailVerified(user) {
  try {
    await user.reload();
    if (user.emailVerified) {
      await updateDoc(doc(db, "users", user.uid), { emailVerified: true });
    }
  } catch (err) {
    console.error("Email verified sync error:", err);
  }
}

async function recordLoginAndNotify(user) {
  try {
    const deviceInfo  = getDeviceInfo();
    const now         = new Date();
    const timeString  = now.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    const snap       = await getDoc(doc(db, "users", user.uid));
    const lastDevice = snap.data()?.lastLoginDevice || null;
    const isNewDevice = lastDevice && lastDevice !== deviceInfo;

    await addDoc(collection(db, "users", user.uid, "notifications"), {
      type:      "login",
      title:     isNewDevice ? "⚠️ New Device Login Detected" : "Login Successful",
      message:   isNewDevice
        ? `Your account was accessed from a new device: ${deviceInfo} at ${timeString}. If this wasn't you, change your password immediately.`
        : `You logged in from ${deviceInfo} at ${timeString}.`,
      read:      false,
      createdAt: serverTimestamp(),
      actions:   isNewDevice ? ["change_password", "logout_all"] : []
    });

    await setDoc(doc(db, "users", user.uid), {
      lastLoginDevice: deviceInfo,
      lastLoginAt:     serverTimestamp()
    }, { merge: true });

  } catch (err) {
    console.error("Login notification error:", err);
  }
}

function isAccountId(val) {
  return /^[A-Z0-9]{8}$/i.test(val.trim());
}

async function getEmailByAccountId(accountId) {
  const upper = accountId.toUpperCase();
  const q1    = query(collection(db, "users"), where("accountId", "==", upper));
  const snap1 = await getDocs(q1);
  if (!snap1.empty) return snap1.docs[0].data().email || null;
  const q2    = query(collection(db, "users"), where("referralCode", "==", upper));
  const snap2 = await getDocs(q2);
  if (!snap2.empty) return snap2.docs[0].data().email || null;
  return null;
}

document.getElementById('email').addEventListener('blur', () => {
  const val = document.getElementById('email').value.trim();
  if (!val || isAccountId(val)) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    showError('email', 'emailError', 'Please enter a valid email address or Account ID.');
  } else {
    document.getElementById('email').classList.remove('error');
    document.getElementById('emailError').textContent = '';
  }
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  clearErrors();

  const rawInput = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  let valid = true;

  if (!rawInput) {
    showError('email', 'emailError', 'Please enter your email address or Account ID.');
    valid = false;
  }
  if (!password || password.length < 6) {
    showError('password', 'passwordError', 'Please enter your password.');
    valid = false;
  }
  if (!valid) return;

  const btn  = document.getElementById('loginBtn');
  const text = document.getElementById('btnText');
  const icon = document.getElementById('btnIcon');

  btn.disabled     = true;
  text.textContent = 'Logging in...';
  icon.className   = 'fa-solid fa-spinner fa-spin';

  try {
    let emailToUse = rawInput;

    if (isAccountId(rawInput)) {
      text.textContent = 'Looking up account...';
      const found = await getEmailByAccountId(rawInput);
      if (!found) {
        showError('email', 'emailError', 'No account found with that Account ID.');
        btn.disabled     = false;
        text.textContent = 'Login to Account';
        icon.className   = 'fa-solid fa-arrow-right';
        return;
      }
      emailToUse = found;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawInput)) {
      showError('email', 'emailError', 'Please enter a valid email address or Account ID.');
      btn.disabled     = false;
      text.textContent = 'Login to Account';
      icon.className   = 'fa-solid fa-arrow-right';
      return;
    }

    text.textContent = 'Logging in...';
    const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
    const user           = userCredential.user;

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.data();

    if (userData?.suspended === true) {
      // Sign them out immediately
      await auth.signOut();
      btn.disabled     = false;
      text.textContent = 'Login to Account';
      icon.className   = 'fa-solid fa-arrow-right';
      showSuspendedError();
      return;
    }
    // ────────────────────────────────────────────────────────────

    sessionStorage.setItem("ymg_session", user.uid);
    await syncEmailVerified(user);
    await recordLoginAndNotify(user);

    document.getElementById('loginSuccess').classList.add('visible');
    setTimeout(() => {
      window.location.href = "../dashboard/dashboard.html";
    }, 1200);

  } catch (error) {
    btn.disabled     = false;
    text.textContent = 'Login to Account';
    icon.className   = 'fa-solid fa-arrow-right';

    if (
      error.code === "auth/user-not-found"    ||
      error.code === "auth/wrong-password"    ||
      error.code === "auth/invalid-credential"
    ) {
      // Check if this is a Google account trying to use email/password
      try {
        const { fetchSignInMethodsForEmail } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        const methods = await fetchSignInMethodsForEmail(auth, emailToUse);
        if (methods.includes("google.com") && !methods.includes("password")) {
          showError('email', 'emailError', 'This account was created with Google Sign-In. Please use the "Continue with Google" button to log in.');
          showError('password', 'passwordError', '');
        } else {
          showError('email',    'emailError',    'Incorrect Account ID/email or password.');
          showError('password', 'passwordError', '');
        }
      } catch {
        showError('email',    'emailError',    'Incorrect Account ID/email or password.');
        showError('password', 'passwordError', '');
      }
    } else if (error.code === "auth/too-many-requests") {
      showError('email', 'emailError', 'Too many failed attempts. Please try again later.');
    } else {
      showError('email', 'emailError', 'Login failed. Please try again.');
    }
  }
});

const googleBtn = document.getElementById("googleBtn");
googleBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result  = await signInWithPopup(auth, provider);
    const user    = result.user;
    const userRef = doc(db, "users", user.uid);
    const snap    = await getDoc(userRef);

    if (snap.exists() && snap.data()?.suspended === true) {
      await auth.signOut();
      showSuspendedError();
      return;
    }

    if (!snap.exists()) {
      await setDoc(userRef, {
        name:      user.displayName,
        email:     user.email,
        balance:   0,
        createdAt: new Date()
      });
    }

    sessionStorage.setItem("ymg_session", user.uid);
    await syncEmailVerified(user);
    await recordLoginAndNotify(user);
    window.location.href = "../dashboard/dashboard.html";

  } catch (error) {
    console.error("Google login error:", error);
    alert(error.message);
  }
});

document.getElementById("forgotPwBtn")?.addEventListener("click", async () => {
  const rawInput = document.getElementById("email").value.trim();
  const btn      = document.getElementById("forgotPwBtn");

  if (!rawInput) {
    showError("email", "emailError", "Enter your email address above first.");
    return;
  }
  if (isAccountId(rawInput)) {
    showError("email", "emailError", "Please enter your email address to reset your password.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawInput)) {
    showError("email", "emailError", "Enter a valid email address to reset your password.");
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  try {
    await sendPasswordResetEmail(auth, rawInput);
    const msg = document.getElementById("forgotMsg");
    if (msg) {
      msg.textContent   = `Reset link sent to ${rawInput}. Check your inbox.`;
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 5000);
    } else {
      alert(`Reset link sent to ${rawInput}. Check your inbox.`);
    }
  } catch (err) {
    console.error(err);
    if (err.code === "auth/user-not-found") {
      showError("email", "emailError", "No account found with this email.");
    } else {
      showError("email", "emailError", "Failed to send reset email. Try again.");
    }
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Forgot Password?';
});