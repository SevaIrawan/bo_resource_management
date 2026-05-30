const DEVTOOLS_BANNER = 'Download the React DevTools';
const ELECTRON_SECURITY_WARNING = 'Electron Security Warning';

function shouldSuppress(args: unknown[]): boolean {
  const text = args
    .map((arg) => (typeof arg === 'string' ? arg : ''))
    .join(' ');

  return text.includes(DEVTOOLS_BANNER) || text.includes(ELECTRON_SECURITY_WARNING);
}

function patchConsole(level: 'info' | 'warn' | 'error') {
  const original = console[level].bind(console);

  console[level] = (...args: unknown[]) => {
    if (shouldSuppress(args)) return;
    original(...args);
  };
}

if (import.meta.env.DEV) {
  patchConsole('info');
  patchConsole('warn');
  patchConsole('error');
}
