# Handbook — Panduan Penggunaan Resource Management

| | |
|---|---|
| **Produk** | Backend Operation — Resource Management |
| **Versi app** | 1.0.30 |
| **Audiens** | Tim operasional internal (marketing / monitoring grup WA & Telegram) |
| **Platform** | Desktop Windows / macOS / Linux (installer per OS) |
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
5. [Issue grup & admin (Ticket dihapus)](#5-issue-grup--admin-tab-ticket-dihapus-v1024)
6. [Tab Reporting — matrix join/admin](#6-tab-reporting--matrix-joinadmin)
7. [Halaman Admin](#7-halaman-admin)
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
| **Group Monitoring** | Halaman utama — Account, Operations, Reporting |
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
| **Account** | Brand card, grid akun WA/TG, KPI issue, sync/scrape |
| **Operations** | **Overview** — stock opname; **Job Queue** — antrian join / create group / set admin / exit & delete / set photo |
| **Reporting** | Laporan read-only join/admin grup per brand (matrix atau per akun) |

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
| Open issues | Ringkasan mismatch grup/admin (engine sama dengan kolom Groups/Admin) |

**Tab Operations (Job Queue):** antrian task per akun — SETUP modal untuk create group (batch + permission per job), VIEW hasil create → tab Set Photo (satu foto per brand). **v1.0.30:** batch besar auto-split 30 grup per job; VIEW join menampilkan status/remark per grup.

**Tab Ticket (historis — dihapus v1.0.24):**

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
| **Location** | Label lokasi device | Bukan nama brand card |
| **Status** | **Active** = session valid; **Logout** = tidak valid | Titik hijau / merah |
| **Session** | **VALID** / **INVALID** | INVALID = harus login platform dulu; **X (hover)** saat Valid = **Clear Session** |
| **On device** | Angka tunggal | Total grup di HP/PC (daily) |
| **In brand** | `y/x` | Grup master brand yang sudah join di akun ini / total master |
| **Admin** | Bar + `a/X` | Berapa grup Anda admin vs standar |
| **Last update** | Waktu / progress scrape | Bukan tombol Run — scrape via **Sync → Scrape now** |
| **Action** | **Group link** | Buka daftar grup + link invite |

### 4.4 Tombol & ikon di baris akun

| Kontrol | Fungsi |
|---------|--------|
| **↻ (Sync)** | Cek session device (timeout ~20 detik) + update angka; busy → alert, bukan modal login |
| **X (hover, kanan nama)** | **Remove from slot** — hapus akun dari slot + rebuild master brand (konfirmasi modal) |
| **X (hover, kolom Session, hanya Valid)** | **Clear Session** — logout di PC ini + database; Sync berikutnya buka QR bersih |
| **Group link** | Modal daftar grup — mode daily 7 kolom atau admin vs master — perlu data scrape |

### 4.5 Alur **Sync (↻)** — sangat penting

Sync mengikuti nilai kolom **Session**:

#### Session = **INVALID**

1. Klik **↻**
2. Modal login terbuka (QR default, atau login nomor HP)
3. Scan QR di HP marketing (WA: Linked devices; TG: Link Desktop Device)
4. Setelah sukses: session tersimpan, angka grup diperbarui
5. Mungkin muncul prompt **Scrape now / Later** untuk simpan daftar grup lengkap ke DB

#### Session = **VALID**

1. Klik **↻**
2. App mengecek apakah WA/TG masih aktif di device **PC ini**
3. Jika OK: angka On device / In brand / Admin diperbarui
4. Jika gagal: diminta login ulang

> **Catatan:** Login platform hanya lewat desktop app (bukan browser web saja).

### 4.6 Kolom **Last update** (scrape penuh via Sync)

| Kondisi | Tampilan | Tindakan |
|---------|----------|----------|
| Session invalid | “Use Sync (↻) to log in first” | Sync dulu |
| Standby | Waktu **last update** | Scrape penuh lewat **Sync → Scrape now** bila perlu |
| Sedang jalan | Progress / “Reading groups…” + **Cancel scrape** | Tunggu (bisa beberapa menit untuk banyak grup) |

**Scrape penuh** = baca semua grup ke DB (**Scrape now** atau auto-scrape Settings). **Sync** = cek session + hitung ringkas. **Tidak ada tombol Run** di kolom ini.

### 4.7 Modal **Group link**

Buka dari **Action → Group link**. Pilih mode:

| Mode | Isi daftar |
|------|------------|
| **Groups on this account** | Semua grup di device akun (Y) — hasil scrape daily |
| **Admin vs master list** | Hanya grup **master brand** (X) + status admin dari akun ini |

| Fitur | Fungsi |
|-------|--------|
| Tabel grup (mode daily) | No, Group Name, Group ID, Member Count, Admin Count, Is Admin, Invite Link |
| Export Excel | `RM-[nama akun]-YYYYMMDD.xlsx` |
| Filter Admin | All / hanya admin / non-admin |
| Pagination | Navigasi halaman jika grup banyak |

Total di mode **Admin vs master** sama dengan denominator kolom In brand/Admin (`y/x`) dan badge **WA x Group** di header card — junk device ada di mode **Junk groups** (Group link), bukan di master list.

Kosong? **Sync** → **Scrape now** dulu.

### 4.8 Lepas akun dari slot (Remove)

1. Arahkan mouse ke baris akun → ikon **X**
2. Konfirmasi **Remove**
3. Efek: baris akun dihapus (CASCADE daily/ticket/session), purge WA di PC ini, **master brand** dihitung ulang dari akun tersisa

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

## 5. Issue grup & admin (tab Ticket dihapus v1.0.24)

> **Tab Ticket tidak ada lagi.** Issue tetap dihitung di engine yang sama dengan grid; lihat badge **not aligned**, kolom **In brand** / **Admin**, Group link (**Junk**), dan Reporting.

### 5.1 Jenis selisih (konsep sama dengan dulu)

| Tipe | Arti singkat | Tindakan lapangan umum |
|------|--------------|------------------------|
| **Missing group** | Grup ada di master brand tapi tidak ada di akun ini | Join grup (pakai link export) |
| **Not admin** | Sudah di grup tapi belum admin | Minta jadi admin |
| **Duplicate group ID** | ID grup bentrok antar nama | Audit data master |
| **Duplicate group name** | Nama sama, ID beda | Audit data master |
| **Device junk group** | Grup di HP tidak ada di master | Bersihkan di HP / keluar grup sampah |

Login/logout session **tidak** membuat ticket.

### 5.2 Di mana melihat & menangani

| Selisih | Lihat di | Tindakan |
|---------|----------|----------|
| Missing group | In brand `y/x` kurang | Join / Job Queue Join missing |
| Not admin | Admin `a/x` kurang | Job Queue Set admin |
| Junk device | Group link → Junk | Exit job / manual |
| Duplikat ID/nama | Modal master brand / Reporting | Audit master |

### 5.3 Setelah perbaikan

- **Sync** → **Scrape now** di akun terkait
- Grid & Reporting refresh realtime setelah scrape sukses

*(Workflow tab Ticket — kartu Process, bookmark In Progress, dll. — dihapus sejak v1.0.24.)*

---

## 6. Tab Reporting — matrix join/admin

Tab **Reporting** hanya **baca data** — tidak mengubah session, scraper, atau ticket.

### 6.1 Filter atas

| Filter | Fungsi |
|--------|--------|
| **Platform** | WhatsApp atau Telegram |
| **Brand** | Brand yang punya akun |
| **Acc Name** | **All** = matrix semua akun; pilih satu = laporan akun itu saja |
| **Full Group / Full Admin** | Join status atau admin status vs master |
| **Search group name** | Filter nama grup |

### 6.2 Matrix (Acc Name = All)

- Baris = grup master brand; kolom = akun (Yes/No join atau admin)
- Klik panah di header kolom akun → filter **Yes** / **No** / **All**
- Jika filter tidak punya baris: header tabel tetap ada → klik **Back to all groups** atau pilih **All** di dropdown

### 6.3 Per akun (Acc Name = satu akun)

- **Full Group:** semua grup daily akun (7 kolom)
- **Full Admin:** daftar master brand + status admin akun

Data diperbarui otomatis setelah scrape atau perubahan di Supabase (realtime).

---

## 7. Halaman Admin

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

## 8. Sinkronisasi data (realtime)

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
| **PC (AppData)** | Auth WhatsApp per akun (**hanya di PC yang scan QR**), preferensi auto-sync, bahasa |

**WhatsApp multi-PC:** Session WA tidak pindah antar PC. Serah akun ke operator lain → **Clear Session** di PC lama (opsional) → operator baru **Sync** + scan QR di PC-nya.

**Telegram multi-PC:** Session string tersimpan di cloud — PC lain bisa Sync/scrape selama badge masih **Valid**. Serah akun ke operator lain → **Clear Session** (wajib) supaya mereka scan QR sendiri.

---

## 9. Alur kerja harian (disarankan)

### 8.1 Setup akun marketing baru (setelah data test dibersihkan)

1. Login dashboard
2. Buka brand (atau buat brand card)
3. **+Add** → pilih WA/TG → nama + nomor marketing
4. Klik **↻ Sync** → scan QR di HP marketing
5. Jika diminta → **Scrape now**
6. Cek **not aligned** / Group link / Reporting
7. Ulangi untuk setiap akun

### 8.2 Pemeriksaan rutin

1. Tab **Account** — filter brand/platform
2. Perhatikan **not aligned** di header brand
3. **Sync** akun yang Session INVALID
4. **Sync → Scrape now** pada akun yang perlu refresh data penuh
5. Pantau Job Queue **Failed**

### 8.3 Ganti akun test ke akun asli

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
| **Aligned** | Device & master sudah cocok untuk platform itu |
| **Session VALID** | Ada session aktif di database (belum tentu dicek device hari ini) |
| **Sync** | Tombol ↻ — login atau cek device |
| **Scrape / Last update** | Baca semua grup dari HP → simpan DB (via Sync → Scrape now) |
| **Issue / selisih** | Perbedaan daily vs master (lihat grid, bukan tab Ticket) |
| **Slicer** | Bar filter & tools di atas tabel/kartu |

---

## 11. FAQ

**Apakah saya perlu install ulang saat ada update app?**  
Tidak. Restart saja setelah notifikasi update (jika IT sudah publish ke GitHub).

**Apakah hapus data di Supabase menghapus installer?**  
Tidak. Hanya data di dashboard.

**Kenapa Session VALID tapi scrape minta login?**  
Device di PC ini mungkin sudah logout — klik Sync untuk cek ulang, atau **Clear Session** lalu Sync lagi.

**Kenapa QR error "still starting from previous attempt"?**  
Session WA stuck di PC ini — tunggu beberapa detik, atau **Clear Session** (X di kolom Session saat Valid) lalu Sync.

**Operator lain tidak bisa Sync akun yang saya login?**  
Normal untuk WA — auth ada di PC Anda. Clear Session + mereka scan QR di PC mereka.

**Kenapa In brand 12/21?**  
12 grup terdeteksi di device; 21 = standar brand untuk platform itu (WA terpisah dari TG).

**Bisakah satu PC untuk banyak akun WA?**  
Ya, sampai ratusan akun — tapi scan QR per akun; Chrome dibatasi ~4 proses bersamaan.

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
        │     ├─ KPI (issue summary)
        │     ├─ Filter / Search / Export / Card|Table
        │     └─ Per Brand Card → Sync | Scrape via Sync | Group link
        ├─ [Tab Operations]
        │     ├─ Overview — stock buckets
        │     └─ Job Queue — join, create, set admin, exit/delete, set photo
        └─ [Tab Reporting]
              └─ Matrix / Full Group / Full Admin
  └─ Admin
        ├─ System status + Worker settings (defaults)
        ├─ Config folder / Check updates (IT)
        └─ Auto-sync + Language
```

---

*Handbook ini selaras dengan aplikasi versi **1.0.30**.*
