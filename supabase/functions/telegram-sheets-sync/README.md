# telegram-sheets-sync

Sync data alignment Telegram (Full Group, Full Admin, Junk) dari Supabase ke
Google Sheets, per brand (JMMY, STMY).

## 1. Install Supabase CLI (kalau belum ada)

```bash
npm install -g supabase
```

## 2. Login & link ke project Supabase

```bash
supabase login
supabase link --project-ref <PROJECT_REF_SUPABASE>
```

`PROJECT_REF` bisa dilihat di Supabase Dashboard > Settings > General.

## 3. Set secrets

```bash
supabase secrets set GOOGLE_CLIENT_EMAIL="gm-apps-sheets-sync@gm-apps-telegram-sync.iam.gserviceaccount.com"
supabase secrets set GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nISI_PRIVATE_KEY_DISINI\n-----END PRIVATE KEY-----\n"
supabase secrets set SHEET_ID_JMMY="1u_DrO0XVpIah3KkdE02Dy9H5INVxq8CAgAdqKv6j1RI"
supabase secrets set SHEET_ID_STMY="13Dzdd4e_ZZV8R4TX3TVlhul-dZmulbLI6dWlt_nGlMg"
```

Catatan `GOOGLE_PRIVATE_KEY`:
- Ambil persis dari field `private_key` di file JSON service account
- Kalau lewat CLI dan isinya ada karakter `\n` literal (bukan newline asli),
  itu sudah otomatis di-handle oleh kode (`index.ts` replace `\\n` jadi newline)
- Paling aman: paste dalam tanda kutip ganda, jangan diedit manual

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` **tidak perlu di-set manual**,
otomatis tersedia di environment Edge Function.

## 4. Deploy

```bash
supabase functions deploy telegram-sheets-sync
```

## 5. Test manual (sebelum pasang webhook)

```bash
curl -X POST \
  "https://<PROJECT_REF>.supabase.co/functions/v1/telegram-sheets-sync" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

Cek response JSON-nya, lalu cek langsung ke Google Sheets JMMY/STMY apakah
tab Full Group / Full Admin / Junk sudah terisi.

## 6. Pasang Database Webhook (trigger otomatis)

Di Supabase Dashboard > Database > Webhooks > Create a new hook, buat 2 webhook:

**Webhook 1:**
- Table: `resource_management_group_scrape_daily`
- Events: Insert, Update, Delete
- Type: Supabase Edge Functions
- Edge Function: `telegram-sheets-sync`

**Webhook 2:**
- Table: `resource_management_groups_master`
- Events: Insert, Update, Delete
- Type: Supabase Edge Functions
- Edge Function: `telegram-sheets-sync`

Setelah ini aktif, setiap ada perubahan data scrape atau master, Google
Sheets JMMY & STMY otomatis ke-update.

## Catatan penting

- Kolom **Remark** (paling kanan tiap tab) tidak pernah ditimpa oleh sync.
  Kalau ada baris yang key-nya (Group ID, atau Group ID+Account untuk Junk)
  sudah tidak muncul lagi di hasil hitung (misal group sudah align), baris
  itu otomatis hilang dari sheet — remark-nya ikut hilang (sudah dikonfirmasi
  ke Bambang, ini memang perilaku yang diinginkan).
- Daftar akun per brand di-hardcode di `index.ts` (`loadBrandConfigs`).
  Kalau ada akun baru/akun keluar, update array `accounts` di situ (urutan
  harus sama persis dengan urutan kolom header di sheet).
- Setelah setup selesai dan berjalan lancar, disarankan generate ulang
  Google Service Account key yang baru dan hapus key lama di Google Cloud
  Console, karena key yang dipakai development sempat tercatat di chat.
