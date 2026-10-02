// Build-time QR codes for UPI. Runs only while the site is built (imported from .astro frontmatter), so no QR
// library ships to the browser and no third-party QR service ever sees the UPI details.
import qrcode from 'qrcode-generator';

/** An inline SVG QR code for `text`. Medium error correction suits on-screen and printed scanning. */
export function qrSvg(text: string, label: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  const safe = label.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return svg.replace('<svg ', `<svg role="img" aria-label="${safe}" `); // screen readers announce what the QR is for
}
