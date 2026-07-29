/**
 * Ambient typing untuk global yang di-inject whatsapp-web.js ke dalam konteks
 * browser (window) Puppeteer — dipakai di dalam callback `page.evaluate(...)`.
 * Callback tersebut dieksekusi oleh Chromium, bukan Node, jadi properti ini
 * tidak ada di lib DOM standar maupun @types/node.
 */
export {};

declare global {
  interface Window {
    WWebJS?: {
      getChat?: (...args: unknown[]) => unknown;
      [key: string]: unknown;
    };
    /** Webpack internal module loader dari WA Web — bentuk modul dinamis, sengaja `any`. */
    require?: (...args: unknown[]) => any;
  }
}
