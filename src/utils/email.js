import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,  // must be a Gmail App Password, not your account password
  },
});

export async function sendEmail({ to, subject, html }) {
  await transporter.sendMail({
    from: `"PriceAm" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
}

export function verificationEmailHtml(otp) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2>Verify your PriceAm account</h2>
      <p>Enter this OTP in the app to verify your email address:</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;padding:16px 24px;background:#f4f4f4;border-radius:8px;display:inline-block">
        ${otp}
      </div>
      <p style="color:#888;margin-top:16px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
    </div>
  `;
}

export function passwordResetEmailHtml(otp) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2>Reset your PriceAm password</h2>
      <p>Enter this OTP in the app to reset your password:</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;padding:16px 24px;background:#f4f4f4;border-radius:8px;display:inline-block">
        ${otp}
      </div>
      <p style="color:#888;margin-top:16px">This code expires in <strong>1 hour</strong>. Do not share it with anyone.</p>
    </div>
  `;
}
