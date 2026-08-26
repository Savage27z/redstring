/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `images` block on purpose: next/image is not used anywhere, and the
  // previous config allowed remote images from any HTTPS host. If image
  // optimisation is added later, allowlist the specific hosts.
  reactStrictMode: true,
};

export default nextConfig;
