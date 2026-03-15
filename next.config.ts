import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  
  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@heroicons/react', 
      'date-fns',
      'chart.js',
      'react-chartjs-2'
    ],
  },
  
  // Optimize images
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },
  
  // Use webpack mode when analyzing bundles
  ...(process.env.ANALYZE === 'true' && {
    webpack: (config, { isServer }) => {
      if (!isServer && process.env.ANALYZE === 'true') {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: true,
            reportFilename: 'bundle-analyzer-report.html',
          })
        )
      }
      return config
    },
  }),
  
  // Configure Turbopack for better performance in Next.js 16
  turbopack: {
    resolveAlias: {
      '@': './src',
    },
  },
};

export default nextConfig;
