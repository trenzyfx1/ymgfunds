import { db } from "../../js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DEFAULTS = {
  depositsEnabled:      true,
  withdrawalsEnabled:   true,
  registrationsEnabled: true,
  investmentsEnabled:   true,
  loansEnabled:         true,
  referralsEnabled:     true,
  kycRequired:          true,
  maintenanceMode:      false
};

let _cache = null;

export async function getPlatformSettings() {
  if (_cache) return _cache;
  try {
    const snap = await getDoc(doc(db, "config", "platformSettings"));
    _cache = snap.exists() ? { ...DEFAULTS, ...snap.data() } : { ...DEFAULTS };
  } catch {
    _cache = { ...DEFAULTS };
  }
  return _cache;
}

export function clearSettingsCache() {
  _cache = null;
}