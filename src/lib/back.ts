// The Back button (top left, just under the photo) shows on every page except the home page.
// Its link is the page one level up in the URL (/doctors/books/x/read/ -> /doctors/books/x/ -> /doctors/books/ -> /doctors/ -> /),
// so pressing it repeatedly always ends at the home page. In the browser it first tries the real "back" step
// (see Base.astro); the link is what runs when there is no earlier page on this site, or without JavaScript.

/** One level up. '/' has none. */
export function parentOf(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  parts.pop();
  return parts.length ? `/${parts.join('/')}/` : '/';
}
