// Lets Node's test runner import the site's TypeScript directly: Node strips the types itself, and this
// hook adds the ".ts" that the source's extensionless relative imports leave out.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(spec, ctx, next) {
    // The source imports JSON the Vite way (no `with { type: 'json' }`); Node needs the attribute.
    if (spec.endsWith('.json') && ctx.parentURL?.endsWith('.ts')) return next(spec, { ...ctx, importAttributes: { ...ctx.importAttributes, type: 'json' } });
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.[cm]?[jt]s$/.test(spec) && ctx.parentURL?.endsWith('.ts')) {
      const url = new URL(spec + '.ts', ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});
