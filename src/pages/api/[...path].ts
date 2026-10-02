// The only server-rendered route: everything under /api/ (see src/server/api.ts). All pages stay static.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleApi, type Env } from '../../server/api';

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleApi(request, env as unknown as Env);
