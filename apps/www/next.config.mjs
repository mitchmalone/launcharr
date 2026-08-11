/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@launcharr/core'],
  typedRoutes: true,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
