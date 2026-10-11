// Words for page scripts (a calculator's results, written in the browser). A translated page carries the words its scripts
// use in <script type="application/json" id="i18n-words"> (src/components/ClientWords.astro); English pages carry none,
// so w() gives back the English. Write every sentence a script shows as w('English with {placeholders}', { placeholders }):
// ClientWords finds the w('...') calls in the page's source and sends their translations.
let words: Record<string, string> | null = null;

export function w(en: string, vars?: Record<string, string | number>): string {
  if (!words) {
    try { words = JSON.parse(document.getElementById('i18n-words')?.textContent || '{}'); } catch { words = {}; }
  }
  const s = words![en] ?? en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
