import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Adds the Supabase project's own origin (REST + Realtime websocket) to
 * connect-src, since the browser talks to it directly for reads/realtime.
 * Derives the scheme from the configured URL rather than assuming https —
 * the local Supabase stack (used by tests) is plain http/ws. */
function supabaseConnectOrigins(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    const { host, protocol } = new URL(url);
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${host} ${wsProtocol}//${host}`;
  } catch {
    return "";
  }
}

function cspHeaderValue(): string {
  const supabaseOrigins = supabaseConnectOrigins();
  return [
    `default-src 'self'`,
    // Next.js embeds inline hydration/flight data scripts; without a
    // per-request nonce (which would force this app into fully dynamic
    // rendering) 'unsafe-inline' is the documented non-nonce approach.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    // Article images come from many Wikimedia subdomains (upload.wikimedia.org
    // and friends), so this allows any https host rather than an allowlist.
    `img-src 'self' https: data:`,
    `font-src 'self' data:`,
    `connect-src 'self'${supabaseOrigins ? ` ${supabaseOrigins}` : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

const nextConfig: NextConfig = {
  // The E2E suite drives the dev server via 127.0.0.1 rather than localhost
  // (see playwright.config.ts) — without this, Next.js blocks cross-origin
  // dev resource requests (HMR, etc.) from that host.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeaderValue() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
