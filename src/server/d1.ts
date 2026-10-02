// The small part of Cloudflare's D1 API this site uses (kept here instead of the full workers-types package).

declare global {
  interface D1Result<T = Record<string, unknown>> { results: T[]; success: boolean; meta: { changes?: number } }
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    run(): Promise<D1Result>;
  }
  interface D1Database {
    prepare(sql: string): D1PreparedStatement;
    batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  }
}

export {};
