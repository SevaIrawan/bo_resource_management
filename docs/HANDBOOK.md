# Handbook — Panduan Penggunaan Resource Management

| | |
|---|---|
| **Produk** | Backend Operation — Resource Management |
| **Versi app** | 1.0.11 |
| **Audiens** | Tim operasional internal (marketing / monitoring grup WA & Telegram) |
| **Platform** | Windows desktop (`.exe`) |
| **Bahasa UI** | English / 中文 (Admin → Language) |

Dokumen ini adalah **referensi internal (Bahasa Indonesia)**.  

**Untuk tim operasional:** bagikan **PDF atau Word** dari [docs/guides/documents/](guides/documents/) — **bukan** file Markdown. Lihat [docs/guides/README.md](guides/README.md).

Untuk arsitektur & rilis IT, lihat [PROJECT.md](../PROJECT.md).

---

## Daftar isi

1. [Gambaran umum](#1-gambaran-umum)
2. [Memulai aplikasi](#2-memulai-aplikasi)
3. [Navigasi & tata letak](#3-navigasi--tata-letak)
4. [Tab Account — monitoring akun](#4-tab-account--monitoring-akun)
5. [Tab Ticket — issue & perbaikan](#5-tab-ticket--issue--perbaikan)
6. [Halaman Admin](#6-halaman-admin)
7. [Sinkronisasi data (realtime)](#7-sinkronisasi-data-realtime)
8. [Alur kerja harian (disarankan)](#8-alur-kerja-harian-disarankan)
9. [Glosarium](#9-glosarium)
10. [FAQ](#10-faq)

---

## 1. Gambaran umum

### 1.1 Apa fungsi aplikasi ini?

Aplikasi membantu tim:

- Mendaftarkan banyak akun **WhatsApp** dan **Telegram** per **brand** (mis. SBMY)
- Mengecek apakah akun masih **login** di HP/PC (session)
- Membandingkan **grup di device** vs **standar brand** (master list)
- Menjalankan **scraper** untuk menyimpan daftar grup ke database
- Melihat **ticket/issue** yang harus diperbaiki (grup kurang, bukan admin, duplikat, dll.)
- Mengekspor data ke **Excel** untuk operasi lapangan

### 1.2 Dua jenis “login”

| Jenis | Untuk apa | Cara |
|-------|---------|------|
| **Login dashboard** | Masuk ke aplikasi | Username + password (dari IT, tabel `users`) |
| **Login platform** | Hubungkan WA/TG ke akun marketing | Tombol **Sync (↻)** → modal QR / nomor HP |

Jangan dicampur: password dashboard **bukan** password Telegram/WhatsApp.

### 1.3 Apa yang **bukan** ticket?

Perubahan **session login/logout** di kolom Session **tidak** masuk daftar Ticket. Ticket hanya untuk masalah **grup & admin** terhadap standar brand.

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
| **Group Monitoring** | Halaman utama — akun & ticket |
| **Admin** | Pengaturan sistem & preferensi |
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
| **Account** | Daftar brand & akun WA/TG |
| **Ticket** | Daftar issue yang harus ditangani (angka = jumlah issue terbuka) |

### 3.4 KPI (kartu angka di atas)

Angka berubah sesuai tab aktif.

**Tab Account:**

| KPI | Arti |
|-----|------|
| Brands | Jumlah brand card |
| Accounts | Jumlah akun terisi |
| Online | Akun dengan session **VALID** |
| Aligned | Akun sudah sync & selaras dengan standar |
| Issue | Akun **not aligned** |
| Open issues | Jumlah issue ticket terbuka (ringkasan) |

**Tab Ticket:**

| KPI | Arti |
|-----|------|
| Open issues | Jumlah kartu issue |
| Missing groups | Issue tipe grup hilang di master |
| Not admin | Issue belum admin |
| Groups to handle | Total baris grup di semua issue |
| Accounts involved | Banyak akun terlibat |
| Brands involved | Banyak brand terlibat |

---

## 4. Tab Account — monitoring akun

### 4.1 Toolbar filter & tools (slicer bar)

| Tool | Lokasi | Fungsi |
|------|--------|--------|
| **Kotak pencarian** | Kiri | Cari nama akun atau nomor telepon |
| **Search** | Di samping kotak | Tombol cari (Enter juga bisa) |
| **Filter Brand** | Kanan | Tampilkan satu brand atau **All brands** |
| **Filter Platform** | Kanan | WhatsApp / Telegram / All |
| **Filter Status** | Kanan | Active / Logout / All |
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
| **WA x std / TG x std** | Jumlah grup **standar** master per platform |
| **All aligned** / **N accounts not aligned** | Ringkasan kesehatan data |
| **+Add** | Tambah akun baru (pilih WA atau TG) |
| **X (Dismiss)** | Sembunyikan card dari tampilan **sesi ini saja** (tidak hapus database) |

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
| **Brand** | Nama brand | Sama untuk semua baris di card |
| **Status** | **Active** = session valid; **Logout** = tidak valid | Titik hijau / merah |
| **Session** | **VALID** / **INVALID** | INVALID = harus login platform dulu |
| **Groups** | `Y/X` | Y = grup di device hari ini; X = standar brand (platform sama) |
| **Admin** | Bar + `a/X` | Berapa grup Anda admin vs standar |
| **Scraper** | **Run** + waktu / progress | Jalankan baca ulang grup ke database |
| **Action** | **Group link** | Buka daftar grup + link invite |

### 4.4 Tombol & ikon di baris akun

| Kontrol | Fungsi |
|---------|--------|
| **↻ (Sync)** | Alur utama: login platform atau cek session + update angka |
| **X (hover, kanan nama)** | **Remove from slot** — lepas akun dari slot (konfirmasi modal) |
| **Group link** | Modal daftar grup (nama, ID, link, admin) — perlu data scrape |

### 4.5 Alur **Sync (↻)** — sangat penting

Sync mengikuti nilai kolom **Session**:

#### Session = **INVALID**

1. Klik **↻**
2. Modal login terbuka (QR default, atau login nomor HP)
3. Scan QR di HP marketing (WA: Linked devices; TG: Link Desktop Device)
4. Setelah sukses: session tersimpan, angka grup diperbarui
5. Mungkin muncul prompt **Run scraper** untuk simpan daftar grup lengkap ke DB

#### Session = **VALID**

1. Klik **↻**
2. App mengecek apakah WA/TG masih aktif di device **PC ini**
3. Jika OK: angka Groups/Admin diperbarui
4. Jika gagal: diminta login ulang

> **Catatan:** Login platform hanya lewat desktop app (bukan browser web saja).

### 4.6 Kolom **Scraper** — tombol **Run**

| Kondisi | Tampilan | Tindakan |
|---------|----------|----------|
| Session invalid | “Use Sync (↻) to log in first” | Sync dulu |
| Sudah aligned | Waktu **last update** saja | Tidak perlu Run |
| **Not aligned** | Tombol **Run** + waktu | Klik **Run** → baca semua grup dari HP → simpan ke DB → ticket diperbarui |
| Sedang jalan | Progress / “Reading groups…” | Tunggu (bisa beberapa menit untuk banyak grup) |

**Run** = scrape penuh. **Sync** = cek session + hitung ringkas (bukan selalu scrape penuh).

### 4.7 Modal **Group link**

Buka dari **Action → Group link**. Pilih mode:

| Mode | Isi daftar |
|------|------------|
| **Groups on this account** | Semua grup di device akun (Y) — hasil scrape daily |
| **Admin vs master list** | Hanya grup **master brand** (X) + status admin dari akun ini |

| Fitur | Fungsi |
|-------|--------|
| Tabel grup | Nama, Group ID, invite link, Admin (Yes/No) |
| Filter Admin | All / hanya admin / non-admin |
| Pagination | Navigasi halaman jika grup banyak |

Total di mode **Admin vs master** sama dengan denominator kolom Groups/Admin (`Y/X`) dan badge **WA x Group** di header card — **bukan** termasuk grup junk di device (junk hanya di tab Ticket).

Kosong? Jalankan **Run** scraper dulu.

### 4.8 Lepas akun dari slot (Remove)

1. Arahkan mouse ke baris akun → ikon **X**
2. Konfirmasi **Remove**
3. Efek: akun nonaktif di database, session device dicabut (WA: hapus auth disk di PC ini)

Gunakan ini sebelum ganti akun test ke akun marketing — atau biarkan IT hapus dari database (lihat [§7](#7-sinkronisasi-data-realtime)).

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

## 5. Tab Ticket — issue & perbaikan

### 5.1 Kapan ticket muncul?

Setelah akun punya data scrape/sync, sistem membandingkan **grup di device (daily)** vs **master brand**. Jika ada selisih, ticket dibuat otomatis.

Angka di kartu tab Ticket memakai **engine yang sama** dengan kolom Groups/Admin di tab Account — bukan hitungan baris database mentah.

**Jenis issue (filter Type):**

| Tipe | Arti singkat | Tindakan lapangan umum |
|------|--------------|------------------------|
| **Missing group** | Grup ada di master brand tapi tidak ada di akun ini | Join grup (pakai link export) |
| **Not admin** | Sudah di grup tapi belum admin | Minta jadi admin |
| **Group count mismatch** | Jumlah grup device ≠ standar brand | Audit & selaraskan |
| **Duplicate group ID** | ID grup bentrok antar nama | Audit data master |
| **Duplicate group name** | Nama sama, ID beda | Audit data master |
| **Device junk group** | Grup di HP tidak ada di master | Bersihkan di HP / keluar grup sampah |

Login/logout session **tidak** membuat ticket.

### 5.2 Toolbar Ticket

| Tool | Fungsi |
|------|--------|
| Pencarian | Cari akun / grup |
| Filter Brand / Platform / Type | Persempit daftar |
| **Bookmark: In Progress** | Hanya issue yang sedang ditangani |
| **Bookmark: Completed** | Hanya issue yang sudah ditandai selesai |
| **Export (unduh)** | Excel semua issue yang **lolos filter** |

### 5.3 Kartu issue

Setiap kartu = **satu masalah** per kombinasi: akun + brand + jenis issue.

| Bagian | Isi |
|--------|-----|
| Judul | Nama akun |
| Badge | Jenis issue (warna) |
| WA/TG | Platform |
| Meta | Nomor · brand |
| Deskripsi | Ringkasan (berapa grup, dll.) |
| **Process / New / status** | Workflow penanganan — **klik** untuk buka form |
| **Double-click kartu** | Buka **detail** (tabel semua baris grup) |

### 5.4 Modal **Process** (workflow)

| Field | Fungsi |
|-------|--------|
| **Task status** | Todo → In progress → Complete / Interrupted |
| Catatan / penanggung jawab | Disimpan ke database (`ticket_issue_handles`) |
| **Save** | Simpan & tutup |
| **Export issue** | Excel untuk issue ini saja |

Bookmark **In Progress** / **Completed** mengikuti status yang Anda simpan.

### 5.5 Modal **Detail** (double-click)

- Tabel lengkap grup yang terlibat
- **Export** acuan perbaikan per issue
- **Esc** atau klik luar untuk tutup

### 5.6 Hubungan Ticket ↔ Account

- Perbaiki grup di lapangan (join, admin, bersihkan sampah)
- Di akun terkait: **Sync** atau **Run** ulang
- Ticket hilang/berkurang ketika data sudah selaras (realtime setelah DB update)

---

## 6. Halaman Admin

Buka dari sidebar: **Admin**.

### 6.1 System status

| Kartu | Arti |
|-------|------|
| **Supabase** | Connected = database OK |
| **Active sessions** | Placeholder (bukan hitungan live) |
| **Platform** | Desktop / Web |
| **Session tables** | Jumlah tabel RM aktif |

### 6.2 Tools IT (desktop saja)

| Tombol | Fungsi | Siapa |
|--------|--------|-------|
| **Open configuration folder** | Buka folder AppData (`.env`, wa-sessions) | IT |
| **Check for app updates** | Cek update GitHub manual | IT / user |

User operasional **biasanya tidak perlu** folder config jika installer dari IT sudah benar.

### 6.3 Preferences

#### Automatic account sync

| Opsi | Fungsi |
|------|--------|
| Enabled | Jalan otomatis di background saat app terbuka |
| Interval (menit) | Seberapa sering (sama seperti tekan Sync per akun) |

Mencatat aktivitas ke database. Tidak menggantikan **Run** scraper penuh saat data belum pernah ada.

#### Language

- **English** / **中文** — mengubah teks UI (label, modal, KPI)

---

## 7. Sinkronisasi data (realtime)

### 7.1 Perubahan di database → app tim

Jika IT atau sistem mengubah data di **Supabase** (akun, ticket, master grup, session flag):

- App yang **sedang terbuka** akan ikut update (detik–menit)
- Tidak perlu install ulang

Contoh: hapus akun test di database → baris hilang di dashboard semua orang.

### 7.2 Perubahan kode / layout → update app

Hanya lewat **versi baru** (auto-update + **Restart**). Lihat [PROJECT.md §4.4](../PROJECT.md).

### 7.3 Yang tersimpan di PC vs cloud

| Lokasi | Isi |
|--------|-----|
| **Cloud (Supabase)** | Brand, akun, grup, ticket, session flag |
| **PC (AppData)** | Auth WhatsApp per akun, preferensi auto-sync, bahasa |

---

## 8. Alur kerja harian (disarankan)

### 8.1 Setup akun marketing baru (setelah data test dibersihkan)

1. Login dashboard
2. Buka brand (atau buat brand card)
3. **+Add** → pilih WA/TG → nama + nomor marketing
4. Klik **↻ Sync** → scan QR di HP marketing
5. Jika diminta → **Run** scraper
6. Buka tab **Ticket** → tangani issue → export Excel jika perlu
7. Ulangi untuk setiap akun

### 8.2 Pemeriksaan rutin

1. Tab **Account** — filter brand/platform
2. Perhatikan **not aligned** di header brand
3. **Sync** akun yang Session INVALID
4. **Run** pada akun yang perlu refresh data
5. Tab **Ticket** — bookmark **In Progress** → selesaikan → tandai **Complete**

### 8.3 Ganti akun test ke akun asli

**Opsi A (disarankan):** Remove tiap akun test dari app → IT bersihkan database  

**Opsi B:** IT hapus langsung di Supabase → dashboard kosong (realtime) → tim Add + login akun baru

---

## 9. Glosarium

| Istilah | Arti |
|---------|------|
| **Brand** | Nama operasi (mis. SBMY) — punya master list grup per WA/TG |
| **Account / slot** | Satu baris akun WA atau TG di bawah brand |
| **Master / std** | Daftar grup standar brand (`groups_master`) |
| **Daily** | Snapshot grup dari device hari ini |
| **Aligned** | Device & master sudah cocok untuk platform itu |
| **Session VALID** | Ada session aktif di database (belum tentu dicek device hari ini) |
| **Sync** | Tombol ↻ — login atau cek device |
| **Run / Scraper** | Baca semua grup dari HP → simpan DB |
| **Ticket / Issue** | Tugas perbaikan data grup |
| **Bookmark** | Filter In Progress / Completed di tab Ticket |
| **Slicer** | Bar filter & tools di atas tabel/kartu |

---

## 10. FAQ

**Apakah saya perlu install ulang saat ada update app?**  
Tidak. Restart saja setelah notifikasi update (jika IT sudah publish ke GitHub).

**Apakah hapus data di Supabase menghapus installer?**  
Tidak. Hanya data di dashboard.

**Kenapa Session VALID tapi Run tetap minta login?**  
Device di PC ini mungkin sudah logout — klik Sync untuk cek ulang.

**Kenapa Groups 12/21?**  
12 grup terdeteksi di device; 21 = standar brand untuk platform itu (WA terpisah dari TG).

**Bisakah satu PC untuk banyak akun WA?**  
Ya, sampai ratusan akun — tapi scan QR per akun; Chrome dibatasi ~4 proses bersamaan.

**Ticket tidak hilang padahal sudah diperbaiki di HP?**  
Klik **Run** atau **Sync** agar data device terbaru masuk database.

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
        │     ├─ KPI
        │     ├─ Filter / Search / Export / Card|Table
        │     └─ Per Brand Card
        │           ├─ +Add account (WA/TG)
        │           ├─ Row: Sync ↻ | Remove X | Group link
        │           └─ Scraper: Run
        └─ [Tab Ticket]
              ├─ KPI
              ├─ Filter / Bookmark / Export
              └─ Card issue → Process | Double-click Detail
  └─ Admin
        ├─ System status
        ├─ Config folder / Check updates (IT)
        └─ Auto-sync + Language
```

---

*Handbook ini selaras dengan aplikasi versi **1.0.11**. Jika fitur baru ditambahkan, perbarui dokumen ini setelah rilis.*
