const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const event = req.body;

    if (event.event !== "charge.success") {
      return res.status(200).send("Ignored");
    }

    const email = event.data.customer.email;
    const amount = event.data.amount / 100;
    const reference = event.data.reference;

    const usersRef = admin.firestore().collection("users");
    const snapshot = await usersRef.where("email", "==", email).get();

    if (snapshot.empty) {
      console.log("User not found");
      return res.status(404).send("User not found");
    }

    const userDoc = snapshot.docs[0];

    await userDoc.ref.update({
      balance: admin.firestore.FieldValue.increment(amount),
      transactions: admin.firestore.FieldValue.arrayUnion({
        type: "deposit",
        amount,
        status: "success",
        reference,
        date: new Date()
      })
    });

    return res.status(200).send("Payment processed");

  } catch (error) {
    console.error(error);
    return res.status(500).send("Error");
  }
});