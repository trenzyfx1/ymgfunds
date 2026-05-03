import { auth } from "../../js/firebase.js";
import {
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function confirmWithPassword(actionLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;`;
    overlay.innerHTML = `
      <div style="background:#0c1425;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:28px 28px 24px;width:100%;max-width:400px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(201,168,76,0.12);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;"><i class="fa-solid fa-lock"></i></div>
          <div>
            <h3 style="font-family:'Syne',sans-serif;font-size:0.95rem;font-weight:700;color:#e2e8f0;margin:0;">Confirm Identity</h3>
            <p style="font-size:0.75rem;color:#64748b;margin:0;">${actionLabel}</p>
          </div>
        </div>
        <p style="font-size:0.82rem;color:#94a3b8;margin-bottom:14px;">Enter your admin password to proceed.</p>
        <div style="position:relative;margin-bottom:8px;">
          <i class="fa-solid fa-lock" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#475569;font-size:0.82rem;pointer-events:none;"></i>
          <input type="password" id="_gatePwInput" placeholder="Enter your password"
            style="width:100%;padding:11px 40px 11px 36px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;"
            autocomplete="current-password" />
          <button type="button" id="_gatePwEye" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="_gatePwEyeIco"></i>
          </button>
        </div>
        <p id="_gatePwErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:14px;"></p>
        <div style="display:flex;gap:8px;">
          <button id="_gateYes" style="flex:1;background:#c9a84c;color:#081c10;border:none;border-radius:9px;padding:11px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-check" id="_gateYesIco"></i><span id="_gateYesTxt">Confirm</span>
          </button>
          <button id="_gateNo" style="flex:1;background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:11px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const pwInput = overlay.querySelector("#_gatePwInput");
    const errEl   = overlay.querySelector("#_gatePwErr");
    const yesBtn  = overlay.querySelector("#_gateYes");
    const noBtn   = overlay.querySelector("#_gateNo");
    const eyeBtn  = overlay.querySelector("#_gatePwEye");
    const eyeIco  = overlay.querySelector("#_gatePwEyeIco");
    const yesIco  = overlay.querySelector("#_gateYesIco");
    const yesTxt  = overlay.querySelector("#_gateYesTxt");

    setTimeout(() => pwInput.focus(), 100);

    eyeBtn.addEventListener("click", () => {
      const h = pwInput.type === "password";
      pwInput.type     = h ? "text" : "password";
      eyeIco.className = h ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });

    pwInput.addEventListener("keydown", e => { if (e.key === "Enter") yesBtn.click(); });

    noBtn.addEventListener("click", () => { document.body.removeChild(overlay); resolve(false); });

    yesBtn.addEventListener("click", async () => {
      const pw = pwInput.value;
      errEl.textContent = "";
      if (!pw) { errEl.textContent = "Please enter your password."; return; }
      yesBtn.disabled  = true;
      yesIco.className = "fa-solid fa-spinner fa-spin";
      yesTxt.textContent = "Verifying...";
      try {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, pw);
        await reauthenticateWithCredential(auth.currentUser, credential);
        document.body.removeChild(overlay);
        resolve(true);
      } catch (err) {
        yesBtn.disabled    = false;
        yesIco.className   = "fa-solid fa-check";
        yesTxt.textContent = "Confirm";
        errEl.textContent  = (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential")
          ? "Incorrect password. Please try again."
          : "Verification failed. Please try again.";
      }
    });
  });
}

export async function requirePagePassword(pageLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "_pageGateOverlay";
    overlay.style.cssText = `position:fixed;inset:0;background:#060d0a;display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;`;
    overlay.innerHTML = `
      <div style="background:#0c1425;border:1px solid rgba(201,168,76,0.2);border-radius:20px;padding:36px 32px 30px;width:100%;max-width:420px;text-align:center;">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(201,168,76,0.1);border:2px solid rgba(201,168,76,0.25);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:1.4rem;color:#c9a84c;">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <h2 style="font-family:'Syne',sans-serif;font-size:1.15rem;font-weight:800;color:#e2e8f0;margin:0 0 6px;">Admin Verification</h2>
        <p style="font-size:0.82rem;color:#64748b;margin:0 0 24px;">${pageLabel} — Enter your password to access this page.</p>
        <div style="position:relative;margin-bottom:8px;text-align:left;">
          <i class="fa-solid fa-lock" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#475569;font-size:0.82rem;pointer-events:none;"></i>
          <input type="password" id="_pageGatePw" placeholder="Enter your admin password"
            style="width:100%;padding:12px 44px 12px 38px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;transition:border-color 0.2s;"
            autocomplete="current-password" />
          <button type="button" id="_pageGateEye" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="_pageGateEyeIco"></i>
          </button>
        </div>
        <p id="_pageGateErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:16px;text-align:left;"></p>
        <button id="_pageGateBtn" style="width:100%;background:linear-gradient(135deg,#c9a84c,#a8873d);color:#081c10;border:none;border-radius:10px;padding:13px;font-family:'Syne',sans-serif;font-size:0.92rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;">
          <i class="fa-solid fa-unlock" id="_pageGateBtnIco"></i>
          <span id="_pageGateBtnTxt">Unlock Page</span>
        </button>
        <a href="index.html" style="font-size:0.78rem;color:#475569;text-decoration:none;">← Back to Dashboard</a>
      </div>`;
    document.body.appendChild(overlay);

    const pwInput = overlay.querySelector("#_pageGatePw");
    const errEl   = overlay.querySelector("#_pageGateErr");
    const btn     = overlay.querySelector("#_pageGateBtn");
    const btnIco  = overlay.querySelector("#_pageGateBtnIco");
    const btnTxt  = overlay.querySelector("#_pageGateBtnTxt");
    const eyeBtn  = overlay.querySelector("#_pageGateEye");
    const eyeIco  = overlay.querySelector("#_pageGateEyeIco");

    setTimeout(() => pwInput.focus(), 200);

    eyeBtn.addEventListener("click", () => {
      const h = pwInput.type === "password";
      pwInput.type     = h ? "text" : "password";
      eyeIco.className = h ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });

    pwInput.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });

    pwInput.addEventListener("focus", () => {
      pwInput.style.borderColor = "#c9a84c";
    });
    pwInput.addEventListener("blur", () => {
      pwInput.style.borderColor = "rgba(255,255,255,0.08)";
    });

    btn.addEventListener("click", async () => {
      const pw = pwInput.value;
      errEl.textContent = "";
      if (!pw) { errEl.textContent = "Please enter your password."; return; }

      btn.disabled     = true;
      btnIco.className = "fa-solid fa-spinner fa-spin";
      btnTxt.textContent = "Verifying...";

      try {
        const waitForUser = () => new Promise((res) => {
          const check = () => auth.currentUser ? res(auth.currentUser) : setTimeout(check, 200);
          check();
        });
        const user       = await waitForUser();
        const credential = EmailAuthProvider.credential(user.email, pw);
        await reauthenticateWithCredential(user, credential);
        overlay.remove();
        resolve(true);
      } catch (err) {
        btn.disabled       = false;
        btnIco.className   = "fa-solid fa-unlock";
        btnTxt.textContent = "Unlock Page";
        errEl.textContent  = (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential")
          ? "Incorrect password. Please try again."
          : "Verification failed. Please try again.";
        pwInput.value = "";
        pwInput.focus();
      }
    });
  });
}