/** @type {import('next').NextConfig} */

const remotePatterns = [
  {
    protocol: 'https',
    hostname: 'wvfuvzyoxxtzrsqoogzk.supabase.co',
  },
  {
    protocol: 'https',
    hostname: 'images.unsplash.com',
  },
];

// Defensively extract dynamic Supabase hostname if NEXT_PUBLIC_SUPABASE_URL is defined
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const dynamicHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
    if (dynamicHost && !remotePatterns.some((p) => p.hostname === dynamicHost)) {
      remotePatterns.push({
        protocol: 'https',
        hostname: dynamicHost,
      });
    }
  } catch (err) {
    console.warn("Invalid NEXT_PUBLIC_SUPABASE_URL format in next.config.mjs, ignoring dynamic pattern.");
  }
}

const nextConfig = {
  images: {
    remotePatterns,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
