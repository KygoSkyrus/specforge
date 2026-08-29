/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@specforge/ui', '@specforge/schemas'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
