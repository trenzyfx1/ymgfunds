export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const otp     = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 5 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ otp, phone, expires })).toString("base64");

  try {
    const response = await fetch("https://api.ng.termii.com/api/sms/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to:      phone,
        from:    process.env.TERMII_SENDER_ID,
        sms:     `Your YMG IQ verification code is: ${otp}. Expires in 5 minutes. Do not share this code.`,
        type:    "plain",
        channel: "whatsapp",
        api_key: process.env.TERMII_API_KEY,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: "Failed to send OTP", details: data });
    }

    return res.status(200).json({ success: true, token: payload });

  } catch (err) {
    return res.status(500).json({ error: "Server error", message: err.message });
  }
}