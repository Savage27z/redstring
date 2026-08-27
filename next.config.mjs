/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `images` block on purpose: next/image is not used anywhere, and an
  // earlier config allowed remote images from any HTTPS host. If image
  // optimisation is added later, allowlist the specific hosts.
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // A site that takes payments should not be loadable inside someone
          // else's frame, where a fake overlay could sit on top of the real
          // pay button.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },

          // Stop browsers guessing a different content type than we sent.
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Never leak the full URL to the sites people click through to.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // Nothing here needs a camera, a microphone or a location.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },

          // Once a browser has seen this, it refuses to talk to the site over
          // plain HTTP. Deliberately no `preload`: that is effectively
          // irreversible and should be a considered decision, not a default.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
