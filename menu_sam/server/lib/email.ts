import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("SMTP configuration incomplete. Email functionality disabled.");
    return null;
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transport = getTransporter();
    if (!transport) {
      console.error("Email service not configured");
      return false;
    }

    const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;

    await transport.sendMail({
      from: smtpFrom,
      to: options.to,
      subject: options.subject,
      text: options.text || "",
      html: options.html,
    });

    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

export async function sendPasswordResetEmail(
  email: string,
  resetCode: string,
  establishmentName: string
): Promise<boolean> {
  const resetUrl = `${process.env.PUBLIC_APP_URL || "https://sam.ma"}/pro/reset-password?code=${resetCode}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #A3001D; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #A3001D; color: white !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
          .footer { color: #666; font-size: 12px; text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Réinitialisation du mot de passe</h1>
            <p>${establishmentName}</p>
          </div>
          <div class="content">
            <p>Bonjour,</p>
            <p>Vous avez demandé à réinitialiser votre mot de passe pour votre compte professionnel.</p>
            <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            <center>
              <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
            </center>
            <p>Ou copiez ce lien : <a href="${resetUrl}">${resetUrl}</a></p>
            <p><strong>Ce lien expire dans 24 heures.</strong></p>
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            <p>Cordialement,<br/>L'équipe Sortir Au Maroc</p>
          </div>
          <div class="footer">
            <p>© Sortir Au Maroc - Tous droits réservés</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: "Réinitialisation de votre mot de passe professionnel - Sortir Au Maroc",
    html,
    text: `Cliquez sur ce lien pour réinitialiser votre mot de passe : ${resetUrl}`,
  });
}
