type SendResult = { sent: boolean; error?: string };

/**
 * E-mail transacional via Resend. Sem RESEND_API_KEY, apenas registra
 * no log (útil em dev) e retorna sent=false.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.log(`[email:dev] to=${input.to} subject=${input.subject}`);
    return { sent: false, error: "RESEND_API_KEY não configurada." };
  }

  try {
    const from = process.env.RESEND_FROM?.trim() || "Hexavante <seguranca@hexavante.com.br>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend falhou (${res.status}): ${body.slice(0, 300)}`);
      return { sent: false, error: `Falha no envio (${res.status}).` };
    }
    return { sent: true };
  } catch (error) {
    console.error("[email] Erro de rede ao enviar:", error);
    return { sent: false, error: "Falha de rede no envio." };
  }
}

export function deviceCodeEmailHtml(code: string, deviceName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a14; color: #f1f5f9; border-radius: 12px; padding: 32px;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">Novo dispositivo detectado</h1>
      <p style="font-size: 14px; color: #94a3b8;">Um acesso à sua conta Hexavante foi feito de <strong>${deviceName}</strong>. Use o código abaixo para confirmar que é você. Expira em 10 minutos.</p>
      <div style="margin: 24px 0; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #22d3ee;">${code}</div>
      <p style="font-size: 12px; color: #64748b;">Se não foi você, ignore este e-mail e troque sua senha imediatamente.</p>
    </div>
  `;
}

export function emailVerifyHtml(code: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a14; color: #f1f5f9; border-radius: 12px; padding: 32px;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">Confirme seu e-mail</h1>
      <p style="font-size: 14px; color: #94a3b8;">Para ativar sua conta Hexavante, confirme que este e-mail é seu com o código abaixo. Expira em 10 minutos.</p>
      <div style="margin: 24px 0; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #22d3ee;">${code}</div>
      <p style="font-size: 12px; color: #64748b;">Se você não criou uma conta, ignore este e-mail.</p>
    </div>
  `;
}

export function twoFactorEmailHtml(code: string): string {  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a14; color: #f1f5f9; border-radius: 12px; padding: 32px;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">Código de verificação</h1>
      <p style="font-size: 14px; color: #94a3b8;">Use o código abaixo para concluir seu login na Hexavante. Expira em 10 minutos.</p>
      <div style="margin: 24px 0; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #22d3ee;">${code}</div>
      <p style="font-size: 12px; color: #64748b;">Se não foi você, ignore este e-mail e troque sua senha imediatamente.</p>
    </div>
  `;
}
