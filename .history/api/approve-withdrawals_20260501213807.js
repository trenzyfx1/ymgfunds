export const config = {
  api: { bodyParser: true }
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { requestId, amount, paystackData, name } = req.body;

  if (!requestId || !amount || !paystackData) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!SECRET_KEY) {
    return res.status(500).json({ error: "Paystack secret key not configured" });
  }

  try {
    let recipientCode;

    if (paystackData.type === "mobile_money") {
      const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${SECRET_KEY}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify({
          type:           "mobile_money",
          name:           paystackData.accountName || name,
          account_number: paystackData.accountNumber,
          bank_code:      paystackData.bankCode,
          currency:       "GHS"
        })
      });

      const recipientData = await recipientRes.json();

      if (!recipientData.status) {
        return res.status(400).json({
          error:   "Failed to create transfer recipient",
          details: recipientData.message || recipientData
        });
      }

      recipientCode = recipientData.data.recipient_code;

    } else if (paystackData.type === "ghipss") {
      const bankListRes = await fetch("https://api.paystack.co/bank?currency=GHS&type=ghipss", {
        headers: { "Authorization": `Bearer ${SECRET_KEY}` }
      });
      const bankListData = await bankListRes.json();
      const banks        = bankListData.data || [];

      const matchedBank = banks.find(b =>
        b.name.toLowerCase().includes((paystackData.bankName || "").toLowerCase().split(" ")[0])
      );

      const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${SECRET_KEY}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify({
          type:           "ghipss",
          name:           paystackData.accountName || name,
          account_number: paystackData.accountNumber,
          bank_code:      matchedBank ? matchedBank.code : paystackData.bankCode || "",
          currency:       "GHS"
        })
      });

      const recipientData = await recipientRes.json();

      if (!recipientData.status) {
        return res.status(400).json({
          error:   "Failed to create bank transfer recipient",
          details: recipientData.message || recipientData
        });
      }

      recipientCode = recipientData.data.recipient_code;

    } else {
      return res.status(400).json({ error: "Unsupported payment type: " + paystackData.type });
    }

    const amountInPesewas = Math.round(amount * 100);

    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${SECRET_KEY}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        source:    "balance",
        amount:    amountInPesewas,
        recipient: recipientCode,
        reason:    `YMG IQ withdrawal — ${requestId}`,
        currency:  "GHS"
      })
    });

    const transferData = await transferRes.json();

    if (!transferData.status) {
      return res.status(400).json({
        error:   "Transfer failed",
        details: transferData.message || transferData
      });
    }

    return res.status(200).json({
      success:          true,
      transferCode:     transferData.data?.transfer_code,
      transferStatus:   transferData.data?.status,
      recipientCode
    });

  } catch (err) {
    console.error("Approve withdrawal error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}