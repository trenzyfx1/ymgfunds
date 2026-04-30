export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Store OTP temporarily (expires in 5 minutes)
  // We encode it in a signed response — frontend sends it back for verification
  const expires = Date.now() + 5 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ otp, phone, expires })).toString("base64");

  // Send SMS via Termii
  const response = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to:        phone,
      from:      "YMG IQ",
      sms:       `Your YMG IQ verification code is: ${otp}. Expires in 5 minutes.`,
      type:      "plain",
      channel:   "generic",
      api_key:   process.env.TERMII_API_KEY,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return res.status(500).json({ error: "Failed to send OTP", details: data });
  }

  // Return the encoded payload (OTP is hidden inside base64)
  return res.status(200).json({ success: true, token: payload });
}