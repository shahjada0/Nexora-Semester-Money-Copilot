/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a production build run alongside `next dev` (NEXT_DIST_DIR=.next-build npm run build).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Native module and PDF reader must stay on the server, unbundled.
    serverComponentsExternalPackages: ['better-sqlite3', 'unpdf'],
    // Ship the invoice/message fixtures and FX snapshot with the serverless bundle (Vercel).
    outputFileTracingIncludes: {
      '/**': ['./fixtures/**/*', './data/fx-snapshot.json'],
    },
  },
};

export default nextConfig;
