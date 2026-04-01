/* =============================================================
   CloudPDF Email Service — Resend integration
   Sends transactional emails for payment confirmation, etc.
   ============================================================= */

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Sender address — use onboarding@resend.dev for testing,
// change to a verified domain address in production
const FROM_ADDRESS = "CloudPDF <onboarding@resend.dev>";

/**
 * Send a payment confirmation email after a successful subscription
 */
export async function sendPaymentConfirmationEmail({
  to,
  name,
  trialEndDate,
  monthlyPrice = "49,90€",
  trialPrice = "0,50€",
  cancelUrl,
}: {
  to: string;
  name: string;
  trialEndDate: Date;
  monthlyPrice?: string;
  trialPrice?: string;
  cancelUrl: string;
}): Promise<boolean> {
  const formattedDate = trialEndDate.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmación de pago — CloudPDF</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a3c6e;padding:32px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                edit<span style="color:#60a5fa;">PDF</span>
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h1 style="margin:0 0 8px;font-size:22px;color:#1a3c6e;font-weight:700;">
                ✅ ¡Pago confirmado!
              </h1>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Hola <strong>${name}</strong>, tu período de prueba de 7 días ha comenzado. Ya tienes acceso completo a todas las funciones de CloudPDF.
              </p>

              <!-- Summary box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Resumen de tu suscripción</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#475569;font-size:14px;">Cargo inicial (prueba 7 días)</td>
                        <td align="right" style="padding:6px 0;color:#1a3c6e;font-size:14px;font-weight:600;">${trialPrice}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#475569;font-size:14px;">Precio mensual tras el período de prueba</td>
                        <td align="right" style="padding:6px 0;color:#1a3c6e;font-size:14px;font-weight:600;">${monthlyPrice}/mes</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top:12px;border-top:1px solid #e2e8f0;"></td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#475569;font-size:14px;">Fin del período de prueba</td>
                        <td align="right" style="padding:6px 0;color:#1a3c6e;font-size:14px;font-weight:600;">${formattedDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Important notice -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                      <strong>⚠️ Recuerda:</strong> Si no cancelas antes del <strong>${formattedDate}</strong>, se te cobrarán automáticamente <strong>${monthlyPrice}/mes</strong> hasta que canceles. Puedes cancelar en cualquier momento desde tu cuenta.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Puedes cancelar tu suscripción en cualquier momento antes de que finalice el período de prueba sin ningún coste adicional.
              </p>

              <!-- CTA buttons -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding-right:12px;">
                    <a href="https://cloud-pdf.net/es/dashboard" style="display:inline-block;background:#1a3c6e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                      Ir a mi panel
                    </a>
                  </td>
                  <td>
                    <a href="${cancelUrl}" style="display:inline-block;background:#ffffff;color:#1a3c6e;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;border:1.5px solid #1a3c6e;">
                      Cancelar suscripción
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8faff;padding:24px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;line-height:1.6;">
                Has recibido este email porque completaste una compra en <a href="https://cloud-pdf.net" style="color:#1a3c6e;">cloud-pdf.net</a>. Si no reconoces esta compra, contacta con nosotros en <a href="mailto:support@cloud-pdf.net" style="color:#1a3c6e;">support@cloud-pdf.net</a>.
              </p>
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                © 2026 CloudPDF — <a href="https://cloud-pdf.net/es/terms" style="color:#94a3b8;">Términos de uso</a> · <a href="https://cloud-pdf.net/es/privacy" style="color:#94a3b8;">Privacidad</a> · <a href="${cancelUrl}" style="color:#94a3b8;">Cancelar suscripción</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (!resend) {
    console.warn("[Email] Resend not configured, skipping confirmation email");
    return false;
  }

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "✅ Confirmación de pago — CloudPDF (prueba 7 días)",
      html,
    });

    if (result.error) {
      console.error("[Email] Failed to send confirmation email:", result.error);
      return false;
    }

    console.log("[Email] Confirmation email sent to:", to, "id:", result.data?.id);
    return true;
  } catch (err) {
    console.error("[Email] Error sending confirmation email:", err);
    return false;
  }
}

/**
 * Send a cancellation confirmation email when user cancels their subscription
 */
export async function sendCancellationEmail({
  to,
  name,
  accessUntilDate,
  reactivateUrl,
}: {
  to: string;
  name: string;
  accessUntilDate: Date;
  reactivateUrl: string;
}): Promise<boolean> {
  const formattedDate = accessUntilDate.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Suscripción cancelada — CloudPDF</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a3c6e;padding:32px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                edit<span style="color:#60a5fa;">PDF</span>
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h1 style="margin:0 0 8px;font-size:22px;color:#1a3c6e;font-weight:700;">
                Suscripción cancelada
              </h1>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Hola <strong>${name}</strong>, hemos recibido tu solicitud de cancelación. Tu suscripción ha sido cancelada correctamente.
              </p>

              <!-- Access info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">✅ Tu acceso continúa</p>
                    <p style="margin:0;color:#15803d;font-size:15px;line-height:1.6;">
                      Aunque has cancelado, seguirás teniendo acceso completo a todas las funciones de CloudPDF hasta el <strong>${formattedDate}</strong>. No se realizará ningún cargo adicional.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Si cambias de opinión, puedes reactivar tu suscripción en cualquier momento antes del <strong>${formattedDate}</strong> sin perder el acceso ni pagar de nuevo.
              </p>

              <!-- CTA buttons -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding-right:12px;">
                    <a href="${reactivateUrl}" style="display:inline-block;background:#1a3c6e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                      Reactivar suscripción
                    </a>
                  </td>
                  <td>
                    <a href="https://cloud-pdf.net/es/dashboard" style="display:inline-block;background:#ffffff;color:#1a3c6e;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;border:1.5px solid #1a3c6e;">
                      Ir a mi panel
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;line-height:1.6;">
                ¿Tuviste algún problema o quieres contarnos por qué cancelaste? Escríbenos a <a href="mailto:support@cloud-pdf.net" style="color:#1a3c6e;">support@cloud-pdf.net</a> — tu opinión nos ayuda a mejorar.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8faff;padding:24px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                © 2026 CloudPDF — <a href="https://cloud-pdf.net/es/terms" style="color:#94a3b8;">Términos de uso</a> · <a href="https://cloud-pdf.net/es/privacy" style="color:#94a3b8;">Privacidad</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (!resend) {
    console.warn("[Email] Resend not configured, skipping cancellation email");
    return false;
  }

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Tu suscripción a CloudPDF ha sido cancelada",
      html,
    });

    if (result.error) {
      console.error("[Email] Failed to send cancellation email:", result.error);
      return false;
    }

    console.log("[Email] Cancellation email sent to:", to, "id:", result.data?.id);
    return true;
  } catch (err) {
    console.error("[Email] Error sending cancellation email:", err);
    return false;
  }
}
