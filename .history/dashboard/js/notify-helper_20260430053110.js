
import { db } from "../../js/firebase.js";
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function createNotification(uid, type, title, message) {
  try {
    await addDoc(collection(db, "users", uid, "notifications"), {
      type,
      title,
      message,
      read:      false,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

export const Notifs = {
  depositSuccess: (amount) => ({
    type:    "deposit",
    title:   "Deposit Successful",
    message: `GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })} has been credited to your wallet.`
  }),

  withdrawalSubmitted: (amount) => ({
    type:    "withdrawal",
    title:   "Withdrawal Submitted",
    message: `Your withdrawal request of GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })} is under review. Allow 2–3 working days.`
  }),

  profitCredited: (amount) => ({
    type:    "profit",
    title:   "Profit Credited",
    message: `GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })} profit has been added to your balance.`
  }),

  investmentActive: (plan, amount) => ({
    type:    "investment",
    title:   "Investment Active",
    message: `Your investment of GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })} in ${plan} is now active.`
  }),

  referralEarned: (name, amount) => ({
    type:    "referral_reward",
    title:   "Referral Reward Earned",
    message: `${name} made their first deposit. GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })} has been credited to your wallet.`
  }),

  planActivated: (tier) => ({
    type:    "activation",
    title:   `${tier === "premium" ? "Premium" : "Standard"} Plans Activated`,
    message: `You've unlocked all ${tier} investment plans. Start investing now!`
  })
};