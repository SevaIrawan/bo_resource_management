/** Harus di-import sebelum `electron` agar warning CSP dev tidak muncul di console. */
if (process.env.VITE_DEV_SERVER_URL) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}
