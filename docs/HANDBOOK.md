# Handbook — Panduan Penggunaan Resource Management

| | |
|---|---|
| **Produk** | Backend Operation — Resource Management |
| **Versi app** | 1.0.31 |
| **Audiens** | Tim operasional internal (marketing / monitoring grup WA & Telegram) |
| **Platform** | Desktop Windows / macOS / Linux (installer per OS) |
| **Bahasa UI** | English / 中文 (Settings → Language) |

Dokumen ini adalah **referensi internal (Bahasa Indonesia)**.  

**Untuk tim operasional:** bagikan **PDF atau Word** dari [docs/guides/documents/](guides/documents/) — **bukan** file Markdown. Lihat [docs/guides/README.md](guides/README.md).

Untuk arsitektur & rilis IT, lihat [PROJECT.md](../PROJECT.md).

---

## Daftar isi

1. [Gambaran umum](#1-gambaran-umum)
2. [Memulai aplikasi](#2-memulai-aplikasi)
3. [Navigasi & tata letak](#3-navigasi--tata-letak)
4. [Tab Account — monitoring akun](#4-tab-account--monitoring-akun)
5. [Issue grup & admin (in-memory)](#5-issue-grup--admin-in-memory)
6. [Group matrix — join/admin (Account header)](#6-group-matrix--joinadmin-account-header)
7. [Halaman Settings](#7-halaman-settings)
8. [Sinkronisasi data (realtime)](#8-sinkronisasi-data-realtime)
9. [Alur kerja harian (disarankan)](#9-alur-kerja-harian-disarankan)
10. [Glosarium](#10-glosarium)
11. [FAQ](#11-faq)

---

## 1. Gambaran umum

### 1.1 Apa fungsi aplikasi ini?

Aplikasi membantu tim:

- Mendaftarkan banyak akun **WhatsApp** dan **Telegram** per **brand** (mis. SBMY)
- Mengecek apakah akun masih **login** di HP/PC (session)
- Membandingkan **grup di device** vs **standar brand** (master list)
- Menjalankan **scraper** untuk menyimpan daftar grup ke database
- Melihat **selisih grup/admin** (issue in-memory — bukan tab Ticket) yang perlu diperbaiki
- Mengekspor data ke **Excel** untuk operasi lapangan

### 1.2 Dua jenis “login”

| Jenis | Untuk apa | Cara |
|-------|---------|------|
| **Login dashboard** | Masuk ke aplikasi | Username + password (dari IT, tabel `users`) |
| **Login platform** | Hubungkan WA/TG ke akun marketing | Tombol **Sync (↻)** → modal QR / nomor HP |

Jangan dicampur: password dashboard **bukan** password Telegram/WhatsApp.

### 1.3 Apa yang **bukan** issue?

Perubahan **session login/logout** di kolom Session **tidak** masuk issue. Issue hanya untuk masalah **grup & admin** terhadap standar brand.

---

## 2. Memulai aplikasi

### 2.1 Instal (sekali per PC)

1. Jalankan file **`Resource Management Setup x.x.x.exe`** dari IT
2. Ikuti wizard Install → buka dari shortcut desktop
3. **Tidak perlu** mengisi file `.env` — konfigurasi organisasi sudah di dalam installer

### 2.2 Login dashboard

1. Masukkan **Username** dan **Password**
2. Klik **Login**
3. Jika gagal: hubungi IT (akun belum ada di database)

### 2.3 Setelah login

Anda langsung masuk ke **Group Monitoring** (halaman utama).

---

## 3. Navigasi & tata letak

### 3.1 Sidebar (kiri)

| Ikon / menu | Fungsi |
|-------------|--------|
| **Logo** | Brand aplikasi (NEXMAX / Backend Operation) |
| **Group Monitoring** | Halaman utama — tabs **Account** \| **Operations** saja |
| **Settings** | Preferensi, Automatic account scrape, worker defaults (`/settings`; `/admin` → `/settings`) |
| **Logout (Power)** | Keluar dari dashboard (tidak logout WA/TG otomatis) |

**Tips:** Sidebar bisa **diperkecil** (hanya ikon) — klik tombol toggle di header.

### 3.2 Header (atas)

| Elemen | Fungsi |
|--------|--------|
| Judul halaman | Menunjukkan modul aktif |
| **Welcome + nama user** | User yang sedang login |
| **Logout** | Keluar dashboard |

### 3.3 Sub-header (hanya di Group Monitoring)

| Tab | Fungsi |
|-----|--------|
| **Account** | Brand card, grid akun WA/TG, KPI issue, sync/scrape, **stock chips** + **Group matrix** (header kartu) |
| **Operations** | **Job Queue** saja — antrian join / create group / set admin / exit & delete / set photo |

> Stock overview dan Reporting tab shell **tidak** ada. Stock = chips di header Account. Matrix join/admin = modal dari badge grup.

### 3.4 KPI (kartu angka di atas)

Angka berubah sesuai tab aktif.

**Tab Account:**

| KPI | Arti |
|-----|------|
| Brands | Jumlah brand card |
| Accounts | Jumlah akun terisi |
| Online | Akun dengan session **Active** |
| Aligned | Akun Remark **Aligned** (tanpa gap Junk/Missing/Not admin) |

**Tab Operations (Job Queue):** antrian task per akun — Join missing / Create group / Set admin / Leave group (+ set photo & delete chat otomatis). SETUP modal create group (batch + permission + foto wajib); VIEW create → Queue Set Photo. **v1.0.31:** batch besar auto-split 30 grup per job; VIEW join status/remark per grup. Execute slots max **10**/platform; auto scrape brands max **6**.

> Tidak ada tab Ticket / Reporting di shell. Issue = KPI Account + gap kolom + Remark. Matrix = modal dari badge grup.

---

## 4. Tab Account — monitoring akun

### 4.1 Toolbar filter & tools (slicer bar)

| Tool | Lokasi | Fungsi |
|------|--------|--------|
| **Kotak pencarian** | Kiri | Cari nama akun atau nomor telepon |
| **Search** | Di samping kotak | Tombol cari (Enter juga bisa) |
| **Filter Brand** | Kanan | Tampilkan satu brand atau **All brands** |
| **Filter Platform** | Kanan | WhatsApp / Telegram / All |
| **Filter Status** | Kanan | Session Active / Logout **atau** Status Aligned / Not Aligned (ikuti slicer UI) |
| **Card view / Table view** | Kanan | Tampilan kartu per brand atau satu tabel gabungan |
| **Export (ikon unduh)** | Kanan | Excel semua akun yang **lolos filter** |

### 4.2 Brand card (tampilan Card view)

Setiap brand (mis. **Brand : SBMY**) punya satu kartu.

**Header brand:**

| Elemen | Fungsi |
|--------|--------|
| **Panah** | Lipat / buka tabel akun |
| **Judul brand** | Nama brand |
| **Badge jumlah akun** | Total akun di card ini |
| **WA n Group / TG n Group** (klik) | Buka **Group matrix** |
| **Avg ND** / **To prep** | Meta stock; To prep klikable hanya jika **> 1** |
| Chips **Ready** / **Recycle** / **Review** | Klik → daftar grup bucket |
| **All aligned** / **N accounts not aligned** | Ringkasan kesehatan data |
| **+Add** | Tambah akun baru (pilih WA atau TG) |
| **X (Dismiss)** | Hapus brand dari database (modal konfirmasi) — bukan sekadar sembunyikan UI |

**Tombol + Add:**

1. Klik **+Add**
2. Pilih **WhatsApp** atau **Telegram**
3. Isi **nama akun** (label tim, mis. nama marketing)
4. Isi **nomor HP** (disarankan; bisa @username untuk TG)
5. **Save**

**Slot kosong:** Baris “Empty account slot” → **Add account** untuk mengisi slot tanpa menambah baris di luar slot.

### 4.3 Kolom tabel akun

| Kolom | Arti | Cara baca |
|-------|------|-----------|
| **Account** | Platform + nama + nomor | Ikon WA/TG, nama, nomor di bawah |
| **Role** | Master / GCS | Create group butuh **Master** |
| **Location** | Label lokasi device | Bukan nama brand card |
| **Session** | **Active** / **Logout** | Logout = Sync + QR; **X (hover)** saat Active = **Clear Session** |
| **On device** | Angka | Total grup di HP (klik jika > 0 → list On Device) |
| **Junk** | Angka gap | Di luar master (klik → list + **Leave**) |
| **Missing** | Angka gap | Belum join master (klik → list + **Join missing**) |
| **Not admin** | Angka gap | Sudah join belum admin (klik → list + **Set admin**) |
| **Last update** | Waktu / progress scrape | Read-only — scrape via **Sync → Scrape now** |
| **Remark** | Aligned / Not Aligned | Atau Cancel scrape saat scrape jalan |

### 4.4 Tombol & ikon di baris akun

| Kontrol | Fungsi |
|---------|--------|
| **↻ (Sync)** | Cek session device (timeout ~20 detik) + pintu Scrape now/Later; busy → alert, bukan modal login |
| **X (hover, kanan nama)** | **Remove from slot** — hapus akun dari slot + rebuild master brand (konfirmasi modal) |
| **X (hover, kolom Session, hanya Active)** | **Clear Session** — logout di PC ini + database; Sync berikutnya buka QR bersih |
| Klik angka gap | Buka daftar grup (On Device / Not in Master / Missing / Not admin) — **bukan** tombol Group link |

### 4.5 Alur **Sync (↻)** — sangat penting

Sync mengikuti nilai kolom **Session**:

#### Session = **Logout**

1. Klik **↻**
2. Modal login terbuka (QR default, atau login nomor HP)
3. Scan QR di HP marketing (WA: Linked devices; TG: Link Desktop Device)
4. Setelah sukses: session **Active**, mungkin prompt **Scrape now / Later**

#### Session = **Active**

1. Klik **↻**
2. App mengecek apakah WA/TG masih aktif di device **PC ini**
3. Jika OK: lanjut (prompt scrape bila perlu)
4. Jika gagal: diminta login ulang

> **Catatan:** Login platform hanya lewat desktop app (bukan browser web saja).

### 4.6 Kolom **Last update** (scrape penuh via Sync)

| Kondisi | Tampilan | Tindakan |
|---------|----------|----------|
| Session Logout | “Use Sync (↻) to log in first” | Sync dulu |
| Standby | Waktu **last update** | Scrape penuh lewat **Sync → Scrape now** bila perlu |
| Sedang jalan | Progress / “Reading groups…” + **Cancel scrape** di Remark | Tunggu (bisa beberapa menit untuk banyak grup) |

**Scrape penuh** = baca semua grup ke DB (**Scrape now** atau auto-scrape Settings). **Sync** = cek session + pintu scrape. **Tidak ada tombol Run** di kolom ini.

### 4.7 Daftar grup dari kolom Account

Buka dengan **klik angka** kolom (bukan tombol Group link):

| Daftar | Cara buka |
|--------|-----------|
| **On Device** | Klik **On device** (jika > 0) |
| **Not in Master** | Klik **Junk** (jika > 0) |
| **Missing** | Klik **Missing** (jika > 0) |
| **Not admin** | Klik **Not admin** (jika > 0) |

Dari list gap: tombol **Join missing** / **Set admin** / **Leave** membuka SETUP Job Queue. Kosong? **Sync** → **Scrape now** dulu.
### 4.8 Lepas akun dari slot (Remove)

1. Arahkan mouse ke baris akun → ikon **X**
2. Konfirmasi **Remove**
3. Efek: baris akun dihapus (CASCADE daily/session), purge WA di PC ini, **master brand** dihitung ulang dari akun tersisa

Gunakan ini sebelum ganti akun test ke akun marketing — atau biarkan IT hapus dari database (lihat [§8](#8-sinkronisasi-data-realtime)).

### 4.9 Tambah brand card

Di ujung daftar card: **Add Card View** → masukkan nama brand → **Create card**.

### 4.10 Tampilan **Table view**

Semua brand dalam **satu tabel** dengan kolom sama. Filter & export di toolbar tetap berlaku.

### 4.11 Modal login platform (ringkas)

| Mode | WhatsApp | Telegram |
|------|----------|----------|
| QR | Scan Linked devices | Scan Link Desktop |
| Phone | Pairing code | Kode SMS / 2FA password |

Tombol di modal: tutup, ganti QR/phone, lanjut setelah kode.

**Jika QR tidak muncul dalam ~10 detik:** tutup modal, tunggu beberapa detik, Sync lagi.

---

## 5. Issue grup & admin (in-memory)

> **Tidak ada tab Ticket.** Issue dihitung in-memory (`accountMasterDailyCompare` → `computeAccountTicketBreakdown`); lihat badge **not aligned**, kolom **Junk** / **Missing** / **Not admin**, **Remark**, KPI Account, dan **Group matrix**.

### 5.1 Jenis selisih (5 tipe saja)

| Tipe | Arti singkat | Tindakan lapangan umum |
|------|--------------|------------------------|
| **Missing group** | Grup ada di master brand tapi tidak ada di akun ini | Join grup (pakai link export) |
| **Not admin** | Sudah di grup tapi belum admin | Minta jadi admin |
| **Duplicate group ID** | ID grup bentrok antar nama | Audit data master |
| **Duplicate group name** | Nama sama, ID beda | Audit data master |
| **Device junk group** | Grup di HP tidak ada di master | Bersihkan di HP / keluar grup sampah |

Tidak ada `group_count_mismatch`. Login/logout session **tidak** membuat issue. Tidak ada Ticket DB / `reconcileTickets`.

### 5.2 Di mana melihat & menangani

| Selisih | Lihat di | Tindakan |
|---------|----------|----------|
| Missing group | Kolom **Missing** | Klik → **Join missing** → Queue |
| Not admin | Kolom **Not admin** | Klik → **Set admin** → Queue |
| Junk device | Kolom **Junk** | Klik → **Leave** → Queue |
| Duplikat ID/nama | Modal master brand / Group matrix | Audit master |

### 5.3 Setelah perbaikan

- **Sync** → **Scrape now** di akun terkait
- Grid & Group matrix refresh realtime setelah scrape sukses

---

## 6. Group matrix — join/admin (Account header)

Tidak ada tab **Reporting**. Matrix join/admin = **modal** dari badge jumlah grup di header brand card (tab Account) — hanya **baca data**. Stock chips = header brand Account (bukan tab Operations Overview).

### 6.1 Cara buka & isi

| Elemen | Fungsi |
|--------|--------|
| Entry | Account → header brand card → klik jumlah grup (badge platform) |
| **Full Group / Full Admin** | Join status atau admin status vs master (semua akun brand+platform) |
| **Search / Status** | Filter nama grup / stock status |
| Filter kolom akun | Yes / No / All di header kolom |

Data diperbarui otomatis setelah scrape atau perubahan di Supabase (event `rm-reporting-reload`).

Komponen: `BrandMasterGroupsModal` → `ReportingJoinMatrixTable`.

---

## 7. Halaman Settings

Buka dari sidebar: **Settings** (`/settings`). Legacy `/admin` redirect ke `/settings`.

### 7.1 System status & tools IT

| Kartu / tombol | Arti |
|----------------|------|
| **Supabase** | Connected = database OK |
| **Open configuration folder** | Buka folder AppData (`.env`, wa-sessions) — IT |
| **Check for app updates** | Cek update GitHub manual |

### 7.2 Automatic account scrape

| Kontrol | Fungsi |
|---------|--------|
| **On Scheduled** | Jadwal harian (default **On**, jam **12:00 PM**) |
| **Scrape Now** | Jalankan scrape sekali untuk brand terpilih (default **Off**) |
| Brand checklist | Default On: FWSG, JMMY, M24SG, SBMY, STMY, WBSG (max 6/platform) |
| **Save / Cancel** | Saat Scrape Now **Off** (edit jadwal/brand) |
| **Execute / Discard** | Saat Scrape Now **On** |
| Setelah **Execute** | Factory reset ke default idle |
| Scrape Now **On** (siap) | Status **standby**, Time **"-"** |

App harus terbuka agar jadwal jalan. Tidak menggantikan scrape manual lewat **Sync → Scrape now**.

### 7.3 Language & worker

- **English** / **中文** — teks UI
- **Worker platform settings** (WA/TG) — default delay / create / invite — enqueue memakai `toTelegramWorkerConfigShape` / WA shape

---

## 8. Sinkronisasi data (realtime)

### 8.1 Perubahan di database → app tim

Jika IT atau sistem mengubah data di **Supabase** (akun, master grup, session flag, daily):

- App yang **sedang terbuka** akan ikut update (detik–menit)
- Tidak perlu install ulang

Contoh: hapus akun test di database → baris hilang di dashboard semua orang.

### 8.2 Perubahan kode / layout → update app

Hanya lewat **versi baru** (auto-update + **Restart**). Lihat [PROJECT.md §4.4](../PROJECT.md).

### 8.3 Yang tersimpan di PC vs cloud

| Lokasi | Isi |
|--------|-----|
| **Cloud (Supabase)** | Brand, akun, grup, session flag (bukan tabel ticket) |
| **PC (AppData)** | Auth WhatsApp per akun (**hanya di PC yang scan QR**), preferensi auto-scrape, bahasa |

**WhatsApp multi-PC:** Session WA tidak pindah antar PC. Serah akun ke operator lain → **Clear Session** di PC lama (opsional) → operator baru **Sync** + scan QR di PC-nya.

**Telegram multi-PC:** Session string tersimpan di cloud — PC lain bisa Sync/scrape selama Session masih **Active**. Serah akun ke operator lain → **Clear Session** (wajib) supaya mereka scan QR sendiri.

---

## 9. Alur kerja harian (disarankan)

### 9.1 Setup akun marketing baru (setelah data test dibersihkan)

1. Login dashboard
2. Buka brand (atau buat brand card)
3. **+Add** → pilih WA/TG → nama + nomor marketing
4. Klik **↻ Sync** → scan QR di HP marketing
5. Jika diminta → **Scrape now**
6. Cek Remark **Not Aligned** / gap kolom / Group matrix
7. Ulangi untuk setiap akun

### 9.2 Pemeriksaan rutin

1. Tab **Account** — filter brand/platform
2. Perhatikan **not aligned** di header brand
3. **Sync** akun yang Session **Logout**
4. **Sync → Scrape now** pada akun yang perlu refresh data penuh
5. Pantau Job Queue **Failed**

### 9.3 Ganti akun test ke akun asli

**Opsi A (disarankan):** Remove tiap akun test dari app → IT bersihkan database  

**Opsi B:** IT hapus langsung di Supabase → dashboard kosong (realtime) → tim Add + login akun baru

---

## 10. Glosarium

| Istilah | Arti |
|---------|------|
| **Brand** | Nama operasi (mis. SBMY) — punya master list grup per WA/TG |
| **Account / slot** | Satu baris akun WA atau TG di bawah brand |
| **Master / std** | Daftar grup standar brand (`groups_master`) |
| **Daily** | Snapshot grup dari device hari ini |
| **Aligned** | Remark Aligned — tanpa gap Junk/Missing/Not admin |
| **Session Active** | Session terhubung di PC ini (label UI; bukan “Valid”) |
| **Session Logout** | Belum login / putus — Sync + QR |
| **Sync** | Tombol ↻ — login atau cek device + pintu Scrape now |
| **Scrape / Last update** | Baca semua grup dari HP → simpan DB (via Sync → Scrape now); kolom read-only |
| **Issue / selisih** | Perbedaan daily vs master (in-memory; bukan tab Ticket) |
| **Slicer** | Bar filter & tools di atas tabel/kartu |

---

## 11. FAQ

**Apakah saya perlu install ulang saat ada update app?**  
Tidak. Restart saja setelah notifikasi update (jika IT sudah publish ke GitHub).

**Apakah hapus data di Supabase menghapus installer?**  
Tidak. Hanya data di dashboard.

**Kenapa Session Active tapi scrape minta login?**  
Device di PC ini mungkin sudah logout — klik Sync untuk cek ulang, atau **Clear Session** lalu Sync lagi.

**Kenapa QR error "still starting from previous attempt"?**  
Session WA stuck di PC ini — tunggu beberapa detik, atau **Clear Session** (X di kolom Session saat Active) lalu Sync.

**Operator lain tidak bisa Sync akun yang saya login?**  
Normal untuk WA — auth ada di PC Anda. Clear Session + mereka scan QR di PC mereka.

**Kenapa Missing / Not admin / Junk > 0?**  
Gap daily vs master. Klik angka kolom → perbaiki lewat Join missing / Set admin / Leave → lalu **Sync → Scrape now**.

**Bisakah satu PC untuk banyak akun WA?**  
Ya, sampai ratusan akun — tapi scan QR per akun; execute slots max **10** Chrome user bersamaan per platform (+ auto scrape max **6**).

**Angka tidak berubah padahal sudah diperbaiki di HP?**  
**Sync** → **Scrape now** agar data device terbaru masuk database.

**Siapa hubungi jika login dashboard gagal?**  
IT — perlu akun di tabel `users`.

**Siapa hubungi jika QR Telegram error?**  
IT — cek API Telegram & migrasi database `023`.

---

## Lampiran — Peta fitur cepat

```
Login
  └─ Group Monitoring
        ├─ [Tab Account]
        │     ├─ KPI (Brands / Accounts / Online / Aligned)
        │     ├─ Filter / Search / Export / Card|Table
        │     ├─ Stock chips Ready/Recycle/Review (header brand)
        │     └─ Per Brand Card → Sync | Scrape via Sync | klik gap | Group matrix badge
        └─ [Tab Operations]
              └─ Job Queue — Join missing, Create group, Set admin, Leave group
  └─ Settings (/settings; /admin → /settings)
        ├─ Automatic account scrape (Scheduled + Scrape Now)
        ├─ Worker settings (defaults) + Language
        └─ Config folder / Check updates (IT)
```

---

*Handbook ini selaras dengan aplikasi versi **1.0.31**.*
