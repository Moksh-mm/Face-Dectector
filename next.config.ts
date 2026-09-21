import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Don't advertise the framework in every response.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The scan page uses the camera, so it must not be framable by others.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          // Only the directives that cannot break Next's inline scripts. A full
          // script-src would need per-request nonces; frame-ancestors is the
          // modern form of X-Frame-Options, and the rest close common injection
          // routes (a rewritten <base>, a hijacked form, plugin content).
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          // Keeps other sites from holding a reference to this window.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Production only: browsers ignore HSTS over plain HTTP, and sending it
          // in development could pin https://localhost for your other projects.
          ...(production
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=15552000",
                },
              ]
            : []),
        ],
      },
      {
        // Photos and JSON are for this site's own pages only.
        source: "/api/:path*",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "same-origin" }],
      },
    ];
  },
};

export default nextConfig;
