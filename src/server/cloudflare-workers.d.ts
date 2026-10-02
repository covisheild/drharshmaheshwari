// The Worker's bindings, as the Cloudflare runtime exposes them to the /api/ route.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
