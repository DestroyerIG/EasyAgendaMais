const path = require('path');

const PRODUCTION_BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN || 'https://easybarber-backend.onrender.com';

// Pixel da Meta (conjunto de dados "EasyAgenda+ Site"). Em produção vale este ID, a menos
// que NEXT_PUBLIC_META_PIXEL_ID esteja definida (vazia = pixel desligado). Fora de produção
// fica desligado, para o desenvolvimento local não mandar eventos ao pixel real.
const META_PIXEL_ID = (
  process.env.NEXT_PUBLIC_META_PIXEL_ID ??
  (process.env.NODE_ENV === 'production' ? '2166081767603206' : '')
).trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_META_PIXEL_ID: META_PIXEL_ID },
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),

  async headers() {
    const getOrigin = (value, fallback) => {
      try {
        return new URL(value || fallback).origin;
      } catch {
        return fallback;
      }
    };

    // Extrair somente a origem (scheme+host+port) das URLs permitidas para o CSP
    const apiOrigin = getOrigin(
      process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL,
      'http://localhost:5000'
    );
    const supabaseOrigin = getOrigin(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      'https://beiovtfhdpybinkxtqlb.supabase.co'
    );
    // wss:// para Supabase Realtime
    const supabaseWssOrigin = supabaseOrigin.replace(/^https:/, 'wss:');

    const isProd = process.env.NODE_ENV === 'production';

    // Pixel da Meta: só libera os domínios dela quando o pixel está configurado.
    const pixelAtivo = /^\d{8,20}$/.test(META_PIXEL_ID);
    const metaScript = pixelAtivo ? ' https://connect.facebook.net' : '';
    const metaConnect = pixelAtivo ? ' https://www.facebook.com https://connect.facebook.net' : '';

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-eval apenas em dev (Next.js HMR)
              `script-src 'self' 'unsafe-inline'${metaScript}${isProd ? '' : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              `connect-src 'self' ${apiOrigin} ${PRODUCTION_BACKEND_ORIGIN} ${supabaseOrigin} ${supabaseWssOrigin}${metaConnect}`,
              // Mapa de localização na vitrine pública (/agendar/:slug) via iframe do Google Maps.
              "frame-src 'self' https://www.google.com https://maps.google.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
