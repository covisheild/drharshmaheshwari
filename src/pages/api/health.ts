// Server-rendered on purpose: with at least one route running on the server, the build deploys a real Worker
// (static assets + a runtime) instead of an assets-only upload, so the Worker can have secrets and D1.
// Reports which settings exist (yes/no only, never values).
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = () => {
  const e = env as unknown as Record<string, unknown>;
  const has = { db: !!e.DB, googleClientId: !!e.GOOGLE_CLIENT_ID, googleClientSecret: !!e.GOOGLE_CLIENT_SECRET };
  return new Response(JSON.stringify({ worker: true, ...has, accounts: false }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
