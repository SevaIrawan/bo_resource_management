# Install Resource Management (Windows) — Tim Internal

Panduan singkat. Dokumen resmi lengkap: **[PROJECT.md](./PROJECT.md)**

---

## Tim IT — buat & rilis installer

**Prasyarat:** Node.js LTS, Python 3 (`py -3`), `.env` lengkap di root project

```powershell
cd "C:\Work\Resource Management"
npm install
npm run build:installer
```

Output: `release\Resource Management Setup x.x.x.exe` — **hanya file ini** yang dibagikan ke tim **Windows**.

**Mac** pakai `.dmg` dari GitHub Releases — lihat **[INSTALL-MACOS.md](./INSTALL-MACOS.md)**. Jangan kirim `.exe` ke Mac.

**Update kode (layout/logic/fix) ke semua PC:**

```powershell
# Naikkan version di package.json dulu
$env:GH_TOKEN = "ghp_..."
npm run publish:github
```

Tim: app unduh otomatis → **Restart** (bukan install ulang).

---

## Tim operasional — PC baru

1. Jalankan **Resource Management Setup … .exe** → Install
2. Buka app → login **username/password** (dari IT / tabel `users`)
3. Tambah akun → login **WhatsApp/Telegram** (QR di HP marketing asli)

**Tidak perlu** isi file `.env` — konfigurasi organisasi sudah di dalam installer (build IT).

---

## Supabase (sekali organisasi)

Ikuti **[SUPABASE_RUNBOOK.md](./SUPABASE_RUNBOOK.md)**.

Tambah user login app:

```sql
INSERT INTO public.users (username, password)
VALUES ('nama_user', 'password_rahasia');
```

---

## Lokasi data di PC user

| Path | Isi |
|------|-----|
| `%APPDATA%\Resource Management\.env` | Salinan/sync dari bundel (jangan edit kecuali IT) |
| `%APPDATA%\Resource Management\wa-sessions\` | Auth WhatsApp per akun |
| Program Files | Aplikasi terinstall |

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Layar merah "config missing" | Install **Setup terbaru** dari IT (**v1.0.35**), atau minta IT publish Release & Restart |
| Update tidak muncul | Release GitHub harus **Public**; version harus lebih tinggi dari yang terinstall |
| Telegram gagal login | Pastikan migrasi `023` sudah jalan; restart app |
| Sync WA: "Could not find Chrome" | Install **Setup 0.1.3+** dari IT (Chrome sudah dibundel). Versi lama: minta installer baru, bukan salin folder cache manual |
