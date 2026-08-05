import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface GeoData {
  country: string;
  region: string;
  city: string;
  postal: string;
  latitude: string | number;
  longitude: string | number;
  timezone: string;
  isp: string;
  asn: string;
}

const defaultGeo: GeoData = {
  country: "Unknown",
  region: "Unknown",
  city: "Unknown",
  postal: "Unknown",
  latitude: "Unknown",
  longitude: "Unknown",
  timezone: "Unknown",
  isp: "Unknown",
  asn: "Unknown",
};

// In-memory cache to prevent looking up the same IP repeatedly
const geoCache = new Map<string, GeoData>();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      event = 'archiCV page visit',
      details = 'A visitor accessed your archiCV site.',
      scenario = 'Page Visit Alert',
      result = 'Success',
    } = body;

    const headers = req.headers;

    // Network IP
    const ip =
      headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      headers.get("x-real-ip") ||
      "Unknown";

    let geo: GeoData = { ...defaultGeo };

    if (ip !== "Unknown" && ip !== "127.0.0.1" && ip !== "::1") {
      if (geoCache.has(ip)) {
        geo = geoCache.get(ip)!;
      } else {
        try {
          const geoResponse = await fetch(
            `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,as`,
            { signal: AbortSignal.timeout(4000) }
          );

          const data = await geoResponse.json();

          if (data.status === "success") {
            geo = {
              country: data.country ?? "Unknown",
              region: data.regionName ?? "Unknown",
              city: data.city ?? "Unknown",
              postal: data.zip ?? "Unknown",
              latitude: data.lat ?? "Unknown",
              longitude: data.lon ?? "Unknown",
              timezone: data.timezone ?? "Unknown",
              isp: data.isp ?? "Unknown",
              asn: data.as ?? "Unknown",
            };
            geoCache.set(ip, geo);
          }
        } catch (err) {
          console.error("[Notify API] Geo lookup failed:", err);
        }
      }
    }

    const visitor = {
      timestamp: new Date().toISOString(),
      event,
      scenario,
      result,
      ip,
      geo,
      userAgent: headers.get("user-agent") ?? "Unknown",
      language: headers.get("accept-language") ?? "Unknown",
      referer: headers.get("referer") ?? "None",
      secFetchSite: headers.get("sec-fetch-site") ?? "Unknown",
      secFetchMode: headers.get("sec-fetch-mode") ?? "Unknown",
      secFetchDest: headers.get("sec-fetch-dest") ?? "Unknown",
      secChUa: headers.get("sec-ch-ua") ?? "Unknown",
      secChUaPlatform: headers.get("sec-ch-ua-platform") ?? "Unknown",
      secChUaMobile: headers.get("sec-ch-ua-mobile") ?? "Unknown",
      forwarded: headers.get("forwarded") ?? "Unknown",
      host: headers.get("host") ?? "Unknown",
      origin: headers.get("origin") ?? "Unknown",
      accept: headers.get("accept") ?? "Unknown",
      acceptEncoding: headers.get("accept-encoding") ?? "Unknown",
      cacheControl: headers.get("cache-control") ?? "Unknown",
    };

    console.log('[Notify API] Visitor info:', visitor);

    const textBody = `
New archiCV Visitor

Time:
${new Date().toLocaleString()}

IP:
${ip}

Country:
${geo.country}

State:
${geo.region}

City:
${geo.city}

Postal:
${geo.postal}

Latitude:
${geo.latitude}

Longitude:
${geo.longitude}

Timezone:
${geo.timezone}

ISP:
${geo.isp}

ASN:
${geo.asn}

User-Agent:
${headers.get("user-agent") ?? "Unknown"}

Language:
${headers.get("accept-language") ?? "Unknown"}

Referer:
${headers.get("referer") ?? "None"}

Platform:
${headers.get("sec-ch-ua-platform") ?? "Unknown"}

Browser:
${headers.get("sec-ch-ua") ?? "Unknown"}

Mobile:
${headers.get("sec-ch-ua-mobile") ?? "Unknown"}

Event:
${event}

Scenario Type:
${scenario}

Result / Status:
${result}

Details:
${details}
`;

    const senderEmail = process.env.SMTP_USER || process.env.SMTP_EMAIL;
    const rawPassword = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    const senderPassword = rawPassword ? rawPassword.replace(/^"|"$/g, '') : '';
    const receiverEmail = process.env.NOTIFICATION_EMAIL || senderEmail;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 465;

    if (!senderEmail || !senderPassword || !receiverEmail) {
      console.warn('[Notify API] Missing SMTP credentials in .env. Skipping email notification.');
      return NextResponse.json(
        { status: 'skipped', reason: 'No SMTP credentials found in .env', visitor },
        { status: 200 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: senderEmail,
        pass: senderPassword,
      },
    });

    const locationInfo = [geo.city, geo.country].filter(c => c && c !== 'Unknown').join(', ') || ip;
    const subject = `archiCV Visitor Alert: ${event} (${locationInfo})`;

    const info = await transporter.sendMail({
      from: `"computer vusion aletrts" <${senderEmail}>`,
      to: receiverEmail,
      subject: subject,
      text: textBody,
    });

    console.log('[Notify API] Message sent: %s', info.messageId);

    return NextResponse.json({ status: 'success', messageId: info.messageId, visitor });
  } catch (error) {
    console.error('[Notify API] Failed to send email:', error);
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 });
  }
}
