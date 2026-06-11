// client/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
    },
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            // Empêche le navigateur d'envoyer l'URL complète dans le header Referer lors de navigations externes
            { key: 'Referrer-Policy', value: 'strict-origin' },
            // Empêche le clickjacking
            { key: 'X-Frame-Options', value: 'DENY' },
            // Empêche le MIME sniffing
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            // Force HTTPS pendant 1 an. Sans `preload` pour rester réversible.
            { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          ],
        },
      ];
    },
  };
  
  export default nextConfig;