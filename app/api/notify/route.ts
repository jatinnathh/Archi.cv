import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      event = 'archiCV page visit',
      details = 'A visitor accessed your archiCV site.',
      scenario = 'Page Visit Alert',
      result = 'Success',
    } = body;

    const senderEmail = process.env.SMTP_USER || process.env.SMTP_EMAIL;
    const rawPassword = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    // Clean quotes if present in .env
    const senderPassword = rawPassword ? rawPassword.replace(/^"|"$/g, '') : '';
    const receiverEmail = process.env.NOTIFICATION_EMAIL || senderEmail;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 465;

    if (!senderEmail || !senderPassword || !receiverEmail) {
      console.warn('[Notify API] Missing SMTP credentials in .env. Skipping email notification.');
      return NextResponse.json(
        { status: 'skipped', reason: 'No SMTP credentials found in .env' },
        { status: 200 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: senderEmail,
        pass: senderPassword,
      },
    });

    const subject = `archiCV page visit`;
    const textBody = `Event: ${event}\nScenario Type: ${scenario}\nResult / Status: ${result}\n\nDetails:\n${details}`;

    const info = await transporter.sendMail({
      from: `"computer vusion aletrts" <${senderEmail}>`,
      to: receiverEmail,
      subject: subject,
      text: textBody,
    });

    console.log('[Notify API] Message sent: %s', info.messageId);

    return NextResponse.json({ status: 'success', messageId: info.messageId });
  } catch (error) {
    console.error('[Notify API] Failed to send email:', error);
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 });
  }
}
