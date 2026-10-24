import cors from 'cors';
import { env } from './env.js';

/**
 * Hardcoded production deployment origins that are always permitted.
 */
export const KNOWN_PRODUCTION_ORIGINS: readonly string[] = [
  'https://campusbite112.netlify.app',
  'https://cafee47.netlify.app'
];

/**
 * Normalizes an origin string by trimming whitespace, removing enclosing quotes,
 * and stripping any trailing slashes (e.g. 'https://app.netlify.app/' -> 'https://app.netlify.app').
 */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
}

/**
 * Returns a deduplicated array of all allowed origins, combining configured
 * environment variables and known production origins, normalized without trailing slashes.
 */
export function getAllowedOrigins(): string[] {
  const configured = (env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);

  const combined = new Set([
    ...KNOWN_PRODUCTION_ORIGINS.map(normalizeOrigin),
    ...configured
  ]);

  return Array.from(combined);
}

/**
 * Determines whether a given Origin header is permitted.
 * - Missing/empty origin (e.g. mobile apps, curl, server-to-server) is allowed.
 * - Localhost origins are allowed in non-production environments.
 * - Exact match against normalized allowed origins is allowed.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true; // Non-browser / same-origin requests
  }

  const normalized = normalizeOrigin(origin);
  const allowed = getAllowedOrigins();

  if (allowed.includes(normalized)) {
    return true;
  }

  // Allow localhost & loopback in non-production environments
  if (
    env.NODE_ENV !== 'production' &&
    (normalized.startsWith('http://localhost:') || normalized.startsWith('http://127.0.0.1:'))
  ) {
    return true;
  }

  return false;
}

/**
 * Standard CORS configuration for Express.
 * Implements origin validation without throwing errors, preserving credential support
 * and handling OPTIONS preflight cleanly.
 */
export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      // Return true to reflect the allowed origin in Access-Control-Allow-Origin
      callback(null, true);
    } else {
      // Disallow origin gracefully by passing false instead of throwing an Error.
      // Passing an Error triggers next(err), skipping preflight response headers and breaking browser checks.
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Idempotency-Key',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400, // 24 hours preflight cache
  optionsSuccessStatus: 204
};
