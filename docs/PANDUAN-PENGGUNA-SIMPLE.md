# Panduan Group Monitoring

**Versi app:** 1.0.29  
**Untuk:** Tim **Depart Resource Management (R&M)** — semua yang menjalankan monitoring grup WhatsApp & Telegram  
**Bahasa UI:** English / 中文 → ubah di **Settings → Language**

> Aplikasi ini adalah modul **Group Monitoring** — bagian dari pekerjaan harian R&M: memastikan akun marketing per **brand** masih login, grup di HP selaras dengan standar brand, admin lengkap, dan stock grup terkontrol.

---

## Daftar isi

1. [Tujuan & fungsi Group Monitoring](#1-tujuan--fungsi-group-monitoring)
2. [Buka aplikasi & navigasi](#2-buka-aplikasi--navigasi)
3. [Ringkasan semua fitur](#3-ringkasan-semua-fitur)
4. [Tab Account — monitoring akun](#4-tab-account--monitoring-akun)
5. [Tombol Sync (↻)](#5-tombol-sync-)
6. [Scrape lengkap & kolom Last update](#6-scrape-lengkap--kolom-last-update)
7. [Group link — full group, full admin, junk](#7-group-link--full-group-full-admin-junk)
8. [Tab Operations — Overview (stock)](#8-tab-operations--overview-stock)
9. [Tab Operations — Job Queue](#9-tab-operations--job-queue)
10. [Tab Reporting](#10-tab-reporting)
11. [Settings — apa yang perlu di-set](#11-settings--apa-yang-perlu-di-set)
12. [Di mana melihat apa](#12-di-mana-melihat-apa)
13. [Alur harian & FAQ](#13-alur-harian--faq)

---

## 1. Tujuan & fungsi Group Monitoring

### Kenapa modul ini ada

Tim R&M mengelola **banyak akun WA/TG** untuk banyak **brand**. Tanpa alat ini, sulit mengecek:

- Akun masih **login** di PC atau sudah putus?
- Grup di **HP** sudah sama dengan **daftar standar brand** (master)?
- Akun sudah **admin** di semua grup yang seharusnya?
- Ada **grup sampah** di HP yang tidak termasuk standar brand?
- **Stock grup** (NEW / customer aktif / recycle) masih cukup?

**Group Monitoring** menjawab itu lewat dashboard + otomasi (Job Queue).

### Dua login — jangan dicampur

| | Login **aplikasi** (dashboard) | Login **WA/TG** (akun marketing) |
|---|-------------------------------|----------------------------------|
| **Cara** | Username + password | Tombol **Sync (↻)** → QR di HP |
| **Untuk** | Masuk modul Group Monitoring | Hubungkan HP marketing ke PC |

Logout dari sidebar **tidak** logout WA/TG. Untuk putuskan WA/TG di PC → **Clear Session** (X di kolom Session saat Valid).

---

## 2. Buka aplikasi & navigasi

### Install & login (sekali per PC)

1. Jalankan installer dari tim IT (Windows `.exe` / Mac `.dmg` / Linux `.AppImage`)
2. Buka app → login username/password
3. Masuk halaman **Group Monitoring**

### Layar utama

```
Sidebar                    Area kerja
─────────                  ─────────────────────────────────────
Group Monitoring    →      Tab: Account | Operations | Reporting
Settings            →      KPI + isi tab
Logout
```

| Tab | Fungsi |
|-----|--------|
| **Account** | Daftar akun per brand, Sync, scrape via Sync, Group link |
| **Operations** | **Overview** = stock grup · **Job Queue** = otomasi join/create/set admin/exit/set photo |
| **Reporting** | Laporan join & admin (baca saja) |
| **Settings** | Bahasa, jadwal auto-scrape, kebijakan stock & worker |

Menu **Refresh** di header tab = muat ulang data tab aktif dari server.

---

## 3. Ringkasan semua fitur

| Fitur | Lokasi | Apa yang dilakukan |
|-------|--------|-------------------|
| Daftar akun WA/TG per brand | Account | Tambah/edit/hapus akun, slot kosong |
| Cek session | Account → kolom Session | Valid / Invalid |
| **Sync (↻)** | Account | Cek login + update angka ringkas + pintu scrape penuh |
| **Scrape penuh** | Sync → **Scrape now** (modal) | Baca **semua** grup dari HP → simpan ke sistem |
| Group link | Account → Action | Lihat full group / admin vs master / junk + export Excel |
| Stock grup (Active, Ready, …) | Operations → Overview | Monitoring klasifikasi master brand |
| Join grup via link invite | Job Queue → Join missing | Otomatis join grup master yang belum ada di akun |
| Create group (batch) | Job Queue → Create & set photo | Buat banyak grup baru di HP |
| Set photo | VIEW setelah create | Pasang foto JPG per brand ke grup hasil create |
| Set admin | Job Queue → Set admin | Promote akun target jadi admin grup |
| Exit & delete group | Job Queue → Exit & delete | Keluar / hapus grup di HP |
| Matrix join/admin | Reporting | Tabel Yes/No semua akun × grup master |
| Full Group / Full Admin | Reporting | Detail per akun |
| Auto-scrape harian | Settings | Scrape otomatis (jam tertentu, app harus terbuka) |
| Kebijakan stock & worker | Settings | Target Ready %, penamaan SOP, delay otomasi |

Cek selisih grup/admin lewat kolom **In brand**, **Admin**, badge **not aligned**, **Group link** (junk), dan tab **Reporting**.

---

## 4. Tab Account — monitoring akun

### KPI (4 angka di atas)

| KPI | Arti |
|-----|------|
| **Brands** | Jumlah kartu brand |
| **Accounts** | Total akun terisi |
| **Online** | Akun session **Valid** |
| **Aligned** | Akun sudah selaras (In brand & Admin cocok standar) |

### Filter toolbar

Search · Brand · Platform (WA/TG) · Status · **Card view** / **Table view** · **Export** Excel akun terfilter.

### Kartu brand

| Elemen | Fungsi |
|--------|--------|
| **WA/TG x std** (klik) | Modal daftar grup **standar brand** (master) |
| **All aligned** / **N not aligned** | Ringkasan akun yang masih selisih |
| **+ Add** | Tambah akun WA atau TG |
| **X** | Hapus brand card (semua data brand ikut terhapus) |

**Tambah akun:** + Add → platform → nama + nomor HP → Save → **Sync (↻)**.

**Edit akun:** ikon pensil → ubah label, nomor, location.

### Kolom tabel (9 kolom — Card view)

| Kolom | Isi | Cara baca |
|-------|-----|-----------|
| **Account** | Platform, nama, nomor | Identitas akun |
| **Location** | Label lokasi device | Bukan nama brand card |
| **Status** | Active / Logout | Titik hijau/merah |
| **Session** | Valid / Invalid | Invalid = wajib Sync dulu |
| **On device** | Angka tunggal | **Total grup di HP** akun ini |
| **In brand** | `y/x` | **y** = grup standar brand yang sudah di-join · **x** = total standar brand |
| **Admin** | Bar + `a/x` | **a** = grup tempat akun ini admin · **x** = seharusnya admin |
| **Last update** | Waktu / progress | Lihat [§6](#6-scrape-lengkap--kolom-last-update) |
| **Action** | Group link | Lihat [§7](#7-group-link--full-group-full-admin-junk) |

**Table view** (satu tabel semua brand): kolom **Brand** tambahan; **tanpa** kolom Last update. Untuk **Sync**, **Scrape now**, dan **Clear Session** — pakai **Card view**.

### Selisih yang perlu diperbaiki

Akun **not aligned** jika **On device ≠ standar** atau **Admin belum penuh** — badge di header kartu brand.

| Gejala di grid | Kemungkinan penyebab | Tindakan |
|----------------|----------------------|----------|
| In brand `y/x` kurang | Belum join grup master | Join manual atau Job Queue **Join missing** → Queue |
| Admin `a/x` kurang | Belum jadi admin | Job Queue **Set admin** → Queue |
| On device > In brand | Ada grup di HP di luar master | Group link → **Junk (not in master)** → Exit manual atau Job Queue |
| Session Invalid | Putus login | **Sync (↻)** |

---

## 5. Tombol Sync (↻)

**Fungsi:** cek apakah WA/TG masih terhubung + perbarui angka **On device / In brand / Admin** (baca ringkas, bukan scrape penuh).

### Session = Invalid

1. Klik **↻**
2. Modal login → scan **QR** (atau login nomor HP)
3. Sukses → angka update
4. Muncul **Scrape now atau Later?**
   - **Scrape now** = langsung scrape penuh
   - **Later** = tutup; scrape manual nanti lewat Sync lagi

### Session = Valid

1. Klik **↻**
2. App probe device (~20 detik)
3. OK → angka update · gagal → login ulang
4. Jika ada data scrape hari ini dan angka belum selaras → bisa muncul prompt **Scrape now / Later** (sama seperti setelah login)

### Situasi lain

| Pesan / kondisi | Tindakan |
|-----------------|----------|
| Device busy | Scrape atau Job Queue sedang jalan di akun ini — tunggu |
| QR tidak muncul | Tutup modal, tunggu, Sync lagi |
| **Clear Session** (X di Session) | Logout WA/TG di PC ini; Sync berikutnya QR baru |

---

## 6. Scrape lengkap & kolom Last update

**Fungsi scrape penuh:** baca **semua** grup dari HP → simpan ke database → perbarui **On device, In brand, Admin, Reporting, stock Overview**.

**Cara menjalankan scrape penuh:**

- **Sync (↻)** → pilih **Scrape now** di modal
- **Settings → Automatic account scrape** (jadwal harian, app harus terbuka)

Kolom **Last update** (Card view) menampilkan waktu scrape terakhir atau progress saat scrape berjalan.

### Kapan scrape penuh

- Setelah join grup baru
- Setelah Set admin / Exit di Job Queue
- Angka di grid masih salah padahal sudah Sync
- Setelah login WA/TG (jika tidak pilih Scrape now saat Sync)

### Langkah (manual)

1. Session **Valid** (Sync dulu jika Invalid)
2. Klik **↻** → pilih **Scrape now** (atau setelah login otomatis ditawarkan)
3. Kolom **Last update** menampilkan progress — **jangan tutup app**
4. Selesai → timestamp + angka update

### Tampilan kolom Last update

| Tampilan | Arti |
|----------|------|
| *Use Sync (↻) to log in first* | Belum login platform |
| Waktu saja | Scrape terakhir selesai (aligned atau belum — tetap tampil waktu) |
| Progress *Reading groups…* | Sedang scrape |
| **Cancel scrape** (saat progress) | Batalkan — data tidak disimpan |

**Scrape penuh ≠ Sync ringkas.** Sync = cek session + hitung ringkas. Scrape = baca lengkap semua grup ke database.

---

## 7. Group link — full group, full admin, junk

Klik **Group link** → pilih mode:

| Mode | Data yang ditampilkan | Kapan dipakai |
|------|----------------------|---------------|
| **Groups on this account** | Semua grup di HP (hasil scrape) — nama, ID, member, admin, invite link | Cek isi HP / export daftar lengkap |
| **Admin vs master list** | Hanya grup **standar brand** + status admin akun ini | Cek admin vs master (denominator kolom Admin) |
| **Junk (not in master)** | Grup di HP yang **tidak** ada di master brand | Bersihkan grup di luar standar |

Export Excel: `RM-[nama akun]-tanggal.xlsx`.  
Kosong → **Sync** → **Scrape now** dulu.

---

## 8. Tab Operations — Overview (stock)

Bookmark **Overview** · filter **Platform** + **Brand**.

### Header kartu brand

```
Brand | Avg ND | To prep  ···  [ WA n Group ] [ Active | Ready | Recycle | Review | Other ]
```

| Chip | Makna operasi (sederhana) |
|------|---------------------------|
| **Active** | Grup customer — ada 1 member non-admin |
| **Ready** | Stock NEW kosong — siap assign customer baru |
| **Recycle** | Grup LG — customer sudah left, bisa daur ulang |
| **Review** | Perlu cek manual (member count anomali / nama belum sync) |
| **Other** | Junk / penamaan tidak sesuai SOP |
| **To prep** | Berapa grup Ready masih **kurang** vs target minimum (0 = OK) |
| **Avg ND** | Rata-rata depositor baru brand (window hari di Settings) |

**Double-click** chip → modal daftar grup di bucket itu.

Overview **hanya monitoring** — untuk buat grup NEW pakai Job Queue.

---

## 9. Tab Operations — Job Queue

Bookmark **Job Queue** · pilih **Platform**, **Brand**, **Task type**, **Account** → **SETUP** → **Queue**.

### Task type (sesuai UI)

| Task di UI | Fungsi |
|------------|--------|
| **Join missing** | Join grup master yang belum ada di akun (pakai invite link dari master) |
| **Create & set photo** | Buat grup batch di HP; setelah selesai bisa pasang foto via VIEW |
| **Set admin** | Jadikan akun target admin di grup yang eligible |
| **Exit & delete group** | Keluar dari grup (exit); opsional delete setelah exit |

### Status antrian

**Queued** → **Running** → **Completed** / **Failed** · bisa **PAUSE** / **CANCEL** / **RUN** / **VIEW**.

Satu akun tidak bisa **Sync** bersamaan dengan job di akun yang sama. Maks ~4 akun berbeda bisa jalan paralel.

Setelah **Queue** sukses, job masuk tabel dan runner mencoba jalan otomatis jika slot kosong.

---

### Join missing (invite by group link)

1. Pilih akun yang belum join lengkap
2. SETUP → centang grup master → **Queue**
3. Selesai → tab Account → **Sync** → **Scrape now**

---

### Create & set photo

**SETUP — Group batch**

| Field | Isi |
|-------|-----|
| Group name | Nama dasar grup |
| Total groups to create | Jumlah grup |
| Start Number | Nomor urut (jika penomoran aktif) |

**SETUP — Group permissions** (per job; default dari Settings bisa diubah di modal):

- WA: messages admins only, add members admins only, edit info admins only
- TG: hide chat history, admin rights toggles

**Queue** → tunggu **Completed** → **VIEW**:

- Tab **Result** — Group ID, invite link tiap grup berhasil dibuat
- Tab **Set Photo** — upload `{brand}.jpg` → **Queue** (opsional)

---

### Set admin

1. Pilih akun **OWNER/ADMIN** (sudah admin di grup)
2. Pilih **akun target**
3. SETUP → centang grup (target sudah join tapi belum admin) → **Queue**
4. **Sync** → **Scrape now** di akun target

---

### Exit & delete group

1. Pilih akun
2. SETUP → centang grup dari daftar daily (grup di HP) → Queue exit
3. **VIEW** hasil → antrikan delete jika diizinkan policy Settings

---

## 10. Tab Reporting

**Hanya baca** — tidak mengubah session, scrape, atau antrian job.

### Filter

Platform · Brand · **Acc Name** (All = matrix) · **Status** (Active/Ready/Recycle/Review/Other/all) · Search nama grup · bookmark **Full Group** / **Full Admin**

### Full Group (per akun atau matrix)

- **Acc Name = All:** matrix — baris = grup master, kolom = akun, isi **Yes/No** join
- **Acc Name = satu akun:** tabel semua grup daily akun (7 kolom)

### Full Admin

- Daftar grup master + status admin akun terpilih

Klik header kolom akun di matrix → filter Yes/No. Export Excel tersedia di panel Reporting.

Data ikut update setelah scrape selesai (realtime ~500 ms).

---

## 11. Settings — apa yang perlu di-set

Buka **Settings** di sidebar.

| Bagian | Perlu di-set? | Isi |
|--------|---------------|-----|
| **Language** | Opsional | English / 中文 |
| **Check for updates** | Opsional | Update app |
| **Automatic account scrape** | **Ya, jika mau** | On/Off + jam harian (app harus terbuka) |
| **Operations stock policy** | **Ya, per brand** | % minimum Ready, window hari Avg ND |
| **SOP naming (prefix)** | **Ya, jika SOP berubah** | Pola penamaan Active/Ready/Recycle |
| **WhatsApp worker** | **Ya, default otomasi** | Delay, max per run, permission create group default, join throttle |
| **Telegram worker** | **Ya, default otomasi** | Delay, flood-wait, permission TG, set photo retry |

**Penting create group:** nilai permission di **Settings** = default saat buka modal SETUP. Perubahan di modal SETUP hanya untuk **job itu** — tidak menulis balik ke Settings.

---

## 12. Di mana melihat apa

| Yang ingin dilihat | Buka di |
|--------------------|---------|
| Akun masih login? | Account → Session Valid/Invalid |
| Total grup di HP | Account → **On device** |
| Sudah join berapa grup standar | Account → **In brand** `y/x` |
| Sudah admin berapa | Account → **Admin** `a/x` |
| Kapan scrape terakhir | Account → **Last update** |
| Daftar lengkap grup di HP | Group link → Groups on this account |
| Admin vs master saja | Group link → Admin vs master |
| Grup di HP di luar master | Group link → Junk (not in master) |
| Stock Active/Ready/Recycle/… | Operations → Overview |
| Detail grup per bucket stock | Overview → double-click chip |
| Antrian join/create/admin/exit | Operations → Job Queue |
| Matrix join semua akun | Reporting → Full Group, Acc=All |
| Matrix admin semua akun | Reporting → Full Admin, Acc=All |
| Detail satu akun | Reporting → pilih Acc Name |
| Filter grup by status stock | Reporting → Status |

---

## 13. Alur harian & FAQ

### Ceklist harian R&M

**Pagi**
- [ ] Account → filter brand Anda
- [ ] Session Invalid → **Sync**
- [ ] Not aligned → catat akun

**Siang**
- [ ] Perbaiki: Join / Set admin / Exit sesuai temuan
- [ ] **Sync → Scrape now** setiap kali ada perubahan di HP atau job selesai
- [ ] Pantau Job Queue Failed

**Sore**
- [ ] Reporting matrix brand Anda
- [ ] Operations Overview — To prep & Ready

### FAQ

**Sync atau scrape penuh dulu?**  
Session Invalid → Sync dulu. Sudah Valid tapi angka salah → Sync → **Scrape now**.

**Kenapa Job Queue selesai tapi grid belum berubah?**  
Wajib **Sync → Scrape now** setelah job mengubah grup di HP.

**Boleh Sync saat job jalan?**  
Tidak di akun yang sama — tunggu job selesai.

**Auto-scrape tidak jalan?**  
App harus terbuka pada jam yang di-set. Tidak ada catch-up jika app tutup.

**Siapa yang develop app?**  
Tim developer internal. Tim R&M hanya **pakai** Group Monitoring — laporkan bug ke developer, bukan dijelaskan di panduan operasional ini.

---

*Panduan ini untuk modul **Group Monitoring** v1.0.29 — tim operasional Depart Resource Management.*
