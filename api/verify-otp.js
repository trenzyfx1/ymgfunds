export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { token, code, phone } = req.body;
  if (!token || !code || !phone) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));

    if (decoded.phone !== phone) {
      return res.status(400).json({ error: "Phone number mismatch" });
    }

    if (Date.now() > decoded.expires) {
      return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    if (decoded.otp !== code.trim()) {
      return res.status(400).json({ error: "Incorrect OTP. Please try again." });
    }

    return res.status(200).json({ success: true, verified: true });

  } catch (err) {
    return res.status(400).json({ error: "Invalid token" });
  }
}