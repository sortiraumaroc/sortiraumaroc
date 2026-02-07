// =============================================================================
// SAM LOYALTY - Email Templates
// =============================================================================

export type LoyaltyEmailData = {
  userName: string;
  establishmentName: string;
  programName: string;
  stampsCount?: number;
  stampsRequired?: number;
  rewardDescription?: string;
  rewardCode?: string;
  expiresAt?: string;
  conditions?: string;
  establishmentUrl?: string;
  qrCodeUrl?: string;
};

// =============================================================================
// TEMPLATE: Bienvenue au programme
// =============================================================================

export function loyaltyWelcomeEmail(data: LoyaltyEmailData): { subject: string; html: string } {
  return {
    subject: `Bienvenue au programme fidélité ${data.establishmentName} !`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue au programme fidélité</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">
                Bienvenue ! 🎉
              </h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                Vous êtes inscrit au programme fidélité
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Bonjour <strong>${data.userName}</strong>,
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Vous venez de rejoindre le programme <strong>"${data.programName}"</strong>
                de <strong>${data.establishmentName}</strong>. Félicitations !
              </p>

              <!-- Card preview -->
              <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; padding: 24px; margin: 30px 0; color: white;">
                <p style="margin: 0 0 10px; font-size: 14px; opacity: 0.9;">
                  ${data.programName}
                </p>
                <p style="margin: 0 0 15px; font-size: 18px; font-weight: bold;">
                  ${data.establishmentName}
                </p>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  ${Array.from({ length: data.stampsRequired ?? 10 })
                    .map((_, i) =>
                      `<span style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: ${i < (data.stampsCount ?? 1) ? 'white' : 'rgba(255,255,255,0.3)'}; margin: 2px;"></span>`
                    )
                    .join('')}
                </div>
                <p style="margin: 15px 0 0; font-size: 14px;">
                  ${data.stampsCount ?? 1} / ${data.stampsRequired ?? 10} tampons
                </p>
              </div>

              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                <strong>🎁 Votre récompense :</strong> ${data.rewardDescription}
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Continuez à accumuler des tampons à chaque visite pour débloquer votre cadeau !
              </p>

              <!-- CTA -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://sam.ma/profile?tab=fidelite"
                   style="display: inline-block; background: #6366f1; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                  Voir ma carte
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f1f5f9; padding: 24px 30px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #64748b;">
                Cet email a été envoyé par <a href="https://sam.ma" style="color: #6366f1;">SAM.ma</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
}

// =============================================================================
// TEMPLATE: Tampon ajouté
// =============================================================================

export function loyaltyStampAddedEmail(data: LoyaltyEmailData): { subject: string; html: string } {
  const remaining = (data.stampsRequired ?? 10) - (data.stampsCount ?? 0);

  return {
    subject: `+1 tampon chez ${data.establishmentName} !`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: white; border-radius: 16px; overflow: hidden;">

          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px;">✓ Tampon ajouté !</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Bonjour ${data.userName},
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Vous avez reçu un nouveau tampon chez <strong>${data.establishmentName}</strong> !
              </p>

              <div style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px; margin: 20px 0;">
                <p style="margin: 0; font-size: 36px; font-weight: bold; color: #6366f1;">
                  ${data.stampsCount} / ${data.stampsRequired}
                </p>
                <p style="margin: 10px 0 0; font-size: 14px; color: #64748b;">
                  ${remaining > 0 ? `Plus que ${remaining} tampon${remaining > 1 ? 's' : ''} !` : 'Carte complète !'}
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://sam.ma/profile?tab=fidelite"
                   style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Voir ma progression
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: #f1f5f9; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                <a href="https://sam.ma" style="color: #6366f1;">SAM.ma</a> - Sortir au Maroc
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
}

// =============================================================================
// TEMPLATE: Carte complète / Récompense débloquée
// =============================================================================

export function loyaltyRewardUnlockedEmail(data: LoyaltyEmailData): { subject: string; html: string } {
  return {
    subject: `🎁 Félicitations ! Votre récompense est prête - ${data.establishmentName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: white; border-radius: 16px; overflow: hidden;">

          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); padding: 40px; text-align: center;">
              <p style="font-size: 48px; margin: 0;">🎉</p>
              <h1 style="margin: 15px 0 0; color: white; font-size: 28px;">Félicitations !</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                Votre carte fidélité est complète
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Bonjour ${data.userName},
              </p>

              <p style="margin: 0 0 30px; font-size: 16px; color: #334155;">
                Vous avez complété votre carte fidélité chez <strong>${data.establishmentName}</strong> !
                Votre récompense vous attend.
              </p>

              <!-- Reward Card -->
              <div style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-radius: 16px; padding: 30px; text-align: center; color: white; margin: 20px 0;">
                <p style="font-size: 48px; margin: 0;">🎁</p>
                <h2 style="margin: 15px 0; font-size: 24px;">${data.rewardDescription}</h2>
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">
                  ${data.establishmentName}
                </p>
                ${data.rewardCode ? `
                <div style="background: rgba(255,255,255,0.2); border-radius: 8px; padding: 12px; margin-top: 20px;">
                  <p style="margin: 0; font-size: 12px; opacity: 0.8;">Code du bon</p>
                  <p style="margin: 5px 0 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
                    ${data.rewardCode}
                  </p>
                </div>
                ` : ''}
              </div>

              ${data.expiresAt ? `
              <p style="margin: 0 0 20px; font-size: 14px; color: #ef4444; text-align: center;">
                ⏱️ Valable jusqu'au ${new Date(data.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              ` : ''}

              ${data.conditions ? `
              <p style="margin: 0 0 20px; font-size: 14px; color: #64748b;">
                <strong>Conditions :</strong> ${data.conditions}
              </p>
              ` : ''}

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://sam.ma/profile?tab=qrcode"
                   style="display: inline-block; background: #f59e0b; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                  Utiliser ma récompense
                </a>
              </div>

              <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin-top: 20px;">
                <p style="margin: 0; font-size: 14px; color: #3b82f6;">
                  <strong>Comment ça marche ?</strong><br>
                  Présentez votre QR code au personnel de l'établissement pour profiter de votre récompense.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: #f1f5f9; padding: 24px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #64748b;">
                <a href="https://sam.ma" style="color: #6366f1;">SAM.ma</a> - Votre guide pour sortir au Maroc
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
}

// =============================================================================
// TEMPLATE: Récompense bientôt expirée
// =============================================================================

export function loyaltyRewardExpiringSoonEmail(data: LoyaltyEmailData): { subject: string; html: string } {
  return {
    subject: `⏰ Votre récompense expire bientôt - ${data.establishmentName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: white; border-radius: 16px; overflow: hidden;">

          <tr>
            <td style="background: #fef3c7; padding: 30px; text-align: center;">
              <p style="font-size: 40px; margin: 0;">⏰</p>
              <h1 style="margin: 10px 0 0; color: #92400e; font-size: 24px;">Récompense bientôt expirée</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Bonjour ${data.userName},
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                N'oubliez pas votre récompense chez <strong>${data.establishmentName}</strong> !
                Elle expire bientôt.
              </p>

              <div style="background: #fef9c3; border: 2px solid #fbbf24; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                <p style="margin: 0 0 10px; font-size: 18px; font-weight: bold; color: #92400e;">
                  ${data.rewardDescription}
                </p>
                <p style="margin: 0; font-size: 14px; color: #a16207;">
                  Expire le <strong>${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('fr-FR') : 'bientôt'}</strong>
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://sam.ma/profile?tab=fidelite"
                   style="display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Utiliser ma récompense
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: #f1f5f9; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                <a href="https://sam.ma" style="color: #6366f1;">SAM.ma</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
}

// =============================================================================
// TEMPLATE: Tampons bientôt expirés
// =============================================================================

export function loyaltyStampsExpiringSoonEmail(data: LoyaltyEmailData): { subject: string; html: string } {
  return {
    subject: `⚠️ Vos tampons vont bientôt expirer - ${data.establishmentName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: white; border-radius: 16px; overflow: hidden;">

          <tr>
            <td style="background: #fee2e2; padding: 30px; text-align: center;">
              <p style="font-size: 40px; margin: 0;">⚠️</p>
              <h1 style="margin: 10px 0 0; color: #991b1b; font-size: 24px;">Vos tampons vont expirer</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Bonjour ${data.userName},
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Vos <strong>${data.stampsCount} tampons</strong> chez <strong>${data.establishmentName}</strong>
                vont expirer si vous ne passez pas bientôt !
              </p>

              <div style="background: #fef2f2; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                <p style="margin: 0; font-size: 32px; font-weight: bold; color: #dc2626;">
                  ${data.stampsCount} / ${data.stampsRequired}
                </p>
                <p style="margin: 10px 0 0; font-size: 14px; color: #b91c1c;">
                  Plus que ${(data.stampsRequired ?? 10) - (data.stampsCount ?? 0)} pour votre récompense !
                </p>
              </div>

              <p style="margin: 0 0 20px; font-size: 14px; color: #64748b;">
                Passez chez ${data.establishmentName} pour ne pas perdre votre progression et
                débloquer votre récompense : <strong>${data.rewardDescription}</strong>
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://sam.ma/profile?tab=fidelite"
                   style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Voir ma carte
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: #f1f5f9; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                <a href="https://sam.ma" style="color: #6366f1;">SAM.ma</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
}

// =============================================================================
// TEMPLATE: Mi-parcours
// =============================================================================

export function loyaltyHalfwayEmail(data: LoyaltyEmailData): { subject: string; html: string } {
  return {
    subject: `Vous êtes à mi-chemin chez ${data.establishmentName} ! 🚀`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: white; border-radius: 16px; overflow: hidden;">

          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
              <p style="font-size: 40px; margin: 0;">🚀</p>
              <h1 style="margin: 10px 0 0; color: white; font-size: 24px;">À mi-chemin !</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Bonjour ${data.userName},
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #334155;">
                Bravo ! Vous avez atteint la moitié de votre carte fidélité chez
                <strong>${data.establishmentName}</strong> !
              </p>

              <div style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px; margin: 20px 0;">
                <p style="margin: 0; font-size: 36px; font-weight: bold; color: #6366f1;">
                  ${data.stampsCount} / ${data.stampsRequired}
                </p>
                <p style="margin: 10px 0 0; font-size: 14px; color: #64748b;">
                  Plus que ${(data.stampsRequired ?? 10) - (data.stampsCount ?? 0)} tampons pour votre cadeau !
                </p>
              </div>

              <p style="margin: 0 0 20px; font-size: 14px; color: #64748b; text-align: center;">
                🎁 <strong>${data.rewardDescription}</strong>
              </p>

              <div style="text-align: center;">
                <a href="https://sam.ma/profile?tab=fidelite"
                   style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Voir ma carte
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: #f1f5f9; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                <a href="https://sam.ma" style="color: #6366f1;">SAM.ma</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
}
