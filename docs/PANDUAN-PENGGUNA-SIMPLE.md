# Panduan Group Monitoring

**Versi app:** 1.0.37  
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
7. [Daftar grup dari kolom Account](#7-daftar-grup-dari-kolom-account)
8. [Stock grup di header Account](#8-stock-grup-di-header-account)
9. [Tab Operations — Job Queue](#9-tab-operations--job-queue)
10. [Group matrix (header Account)](#10-group-matrix-header-account)
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

Logout dari sidebar **tidak** logout WA/TG. Untuk putuskan WA/TG di PC → **Clear Session** (X di kolom Session saat **Active**).

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
Group Monitoring    →      Tab: Account | Operations
Settings            →      KPI + isi tab
Logout
```

| Tab | Fungsi |
|-----|--------|
| **Account** | Daftar akun per brand, Sync, scrape, daftar gap (klik kolom), **stock chips** + **Group matrix** (header kartu) |
| **Operations** | **Job Queue** saja — Join missing / Create group / Set admin / Leave group (+ set photo & delete chat otomatis) |
| **Settings** | Bahasa, jadwal auto-scrape, kebijakan stock & worker |

> Stock overview **tidak** di tab Operations. Chip stock + Avg ND / To prep hidup di **header brand card** (tab Account).  
> Tidak ada tab **Reporting** terpisah. Matrix join/admin dibuka dari **badge jumlah grup** di header brand card.

Menu **Refresh** di header tab = muat ulang data tab aktif dari server.

---

## 3. Ringkasan semua fitur

| Fitur | Lokasi | Apa yang dilakukan |
|-------|--------|-------------------|
| Daftar akun WA/TG per brand | Account | Tambah/edit/hapus akun, slot kosong |
| Cek session | Account → kolom Session | **Active** / **Logout** |
| **Sync (↻)** | Account | Cek login + pintu scrape penuh (Scrape now / Later) |
| **Scrape penuh** | Sync → **Scrape now** (modal) | Baca **semua** grup dari HP → simpan ke sistem |
| Daftar gap grup | Klik kolom On device / Junk / Missing / Not admin | List + tombol Join missing / Set admin / Leave |
| Stock grup | Account → header brand (Avg ND, To prep, Ready / Recycle / Review) | Monitoring stock |
| Join grup via link invite | Job Queue → Join missing | Otomatis join grup master yang belum ada di akun |
| Create group (batch) | Job Queue → Create group | Buat banyak grup baru di HP (Master + foto wajib) |
| Set photo | Otomatis setelah create / VIEW Queue Set Photo | Foto brand dari SETUP |
| Set admin | Job Queue → Set admin | Promote akun target jadi admin grup |
| Leave group | Job Queue → Leave group | Keluar grup; delete chat otomatis jika Settings On |
| Matrix join/admin | Account → badge grup (header kartu) | Tabel Yes/No semua akun × grup master |
| Full Group / Full Admin | Modal Group matrix | Bookmark di modal |
| Auto-scrape harian / Scrape Now | Settings → Automatic account scrape | On Scheduled + Scrape Now (default 12:00 PM; lihat §11) |
| Kebijakan stock & worker | Settings | Target Ready %, penamaan SOP, delay otomasi |

Cek selisih lewat kolom **Junk / Missing / Not admin**, badge **not aligned**, dan **Group matrix** (badge grup di header kartu).

---

## 4. Tab Account — monitoring akun

### KPI (4 angka di atas)

| KPI | Arti |
|-----|------|
| **Brands** | Jumlah kartu brand |
| **Accounts** | Total akun terisi |
| **Online** | Akun session **Active** |
| **Aligned** | Akun Remark Aligned (tanpa gap Junk/Missing/Not admin) |

### Filter toolbar

Search Acc Name/Number · Brand · Platform (WA/TG) · **Session** (Active/Logout) · **Status** (Aligned/Not Aligned) · **Card view** / **Table view** · **Export** Excel.

### Kartu brand

| Elemen | Fungsi |
|--------|--------|
| Badge grup WA/TG (klik) | Buka **Group matrix** |
| **Avg ND** / **To prep** | Meta stock; To prep klikable hanya jika **> 1** (buka Create group) |
| Chips **Ready** / **Recycle** / **Review** | Klik → daftar grup bucket itu |
| **All aligned** / **N not aligned** | Ringkasan akun yang masih selisih |
| **+Add** | Tambah akun WA atau TG |
| **X** | Hapus brand card (semua data brand ikut terhapus) |

**Tambah akun:** **+Add** → platform → nama + nomor HP → Save → **Sync (↻)**.

**Edit akun:** ikon pensil → ubah label, nomor, location, Role (Master/GCS).

### Kolom tabel (10 kolom — Card view)

| Kolom | Isi | Cara baca |
|-------|-----|-----------|
| **Account** | Platform, nama, nomor | Identitas akun |
| **Role** | Master / GCS | Create group butuh **Master** |
| **Location** | Label lokasi device | Bukan nama brand card |
| **Session** | **Active** / **Logout** | Logout = wajib Sync + QR |
| **On device** | Angka | Total grup di HP (klik jika > 0 → list On Device) |
| **Junk** | Angka gap | Di luar master (klik → list + tombol **Leave**) |
| **Missing** | Angka gap | Belum join master (klik → list + **Join missing**) |
| **Not admin** | Angka gap | Sudah join belum admin (klik → list + **Set admin**) |
| **Last update** | Waktu / progress | Read-only — scrape via Sync → Scrape now |
| **Remark** | Aligned / Not Aligned | Atau Cancel scrape saat scrape jalan |

**Table view** (satu tabel semua brand): kolom **Brand** tambahan; **tanpa** kolom Last update. Untuk **Sync**, **Scrape now**, dan **Clear Session** — pakai **Card view**.

### Selisih yang perlu diperbaiki

Akun **Not Aligned** di Remark / badge not aligned jika masih ada gap.

| Gejala di grid | Kemungkinan penyebab | Tindakan |
|----------------|----------------------|----------|
| **Missing** > 0 | Belum join grup master | Klik Missing → **Join missing** → Queue |
| **Not admin** > 0 | Belum jadi admin | Klik Not admin → **Set admin** → Queue |
| **Junk** > 0 | Grup di HP di luar master | Klik Junk → **Leave** → Queue |
| Session **Logout** | Putus login | **Sync (↻)** + QR |

---

## 5. Tombol Sync (↻)

**Fungsi:** cek apakah WA/TG masih terhubung di PC ini + pintu scrape penuh (**Scrape now** / **Later**). Sync ringkas **bukan** scrape penuh semua grup.

**Busy:** akun yang sedang Sync/Scrape **atau** Job Queue tidak bisa dipakai aktivitas lain sampai selesai (saling blokir dua arah).

### Session = Logout

1. Klik **↻**
2. Modal login → scan **QR** (atau login nomor HP)
3. Sukses → Session jadi **Active**
4. Muncul **Scrape now atau Later?**
   - **Scrape now** = langsung scrape penuh
   - **Later** = tutup; scrape manual nanti lewat Sync lagi

### Session = Active

1. Klik **↻**
2. App probe device (~20 detik)
3. OK → lanjut; gagal → diminta login ulang (Session bisa jadi Logout)
4. Jika perlu scrape penuh → bisa muncul prompt **Scrape now / Later**

### Situasi lain

| Pesan / kondisi | Tindakan |
|-----------------|----------|
| Device busy | Scrape atau Job Queue sedang jalan di akun ini — tunggu |
| QR tidak muncul | Tutup modal, tunggu, Sync lagi |
| **Clear Session** (X di Session saat Active) | Logout WA/TG di PC ini; Sync berikutnya QR baru |

---

## 6. Scrape lengkap & kolom Last update

**Fungsi scrape penuh:** baca **semua grup yang masih ada di akun (HP)** → simpan ke database → perbarui **On device, Junk, Missing, Not admin, Remark, Group matrix, stock chips Account**.

Progress scrape menampilkan **jumlah real** (mis. `11/11`), bukan chat yang sudah Leave/Delete. Setelah Job Queue Leave (+ delete), jalankan **Sync → Scrape now** — angka harus selaras dengan grup yang tersisa di HP.

**Cara menjalankan scrape penuh:**

- **Sync (↻)** → pilih **Scrape now** di modal
- **Settings → Automatic account scrape** (jadwal harian, app harus terbuka)

Kolom **Last update** (Card view) menampilkan waktu scrape terakhir atau progress saat scrape berjalan.

### Kapan scrape penuh

- Setelah join grup baru
- Setelah Set admin / Leave di Job Queue
- Angka gap di grid masih salah padahal sudah Sync
- Setelah login WA/TG (jika tidak pilih Scrape now saat Sync)

### Langkah (manual)

1. Session **Active** (Sync dulu jika Logout)
2. Klik **↻** → pilih **Scrape now** (atau setelah login otomatis ditawarkan)
3. Kolom **Last update** menampilkan progress — **jangan tutup app**
4. Selesai → timestamp + angka update

### Tampilan kolom Last update

| Tampilan | Arti |
|----------|------|
| *Use Sync (↻) to log in first* | Belum login platform |
| Waktu saja | Scrape terakhir selesai (Aligned atau Not Aligned — tetap tampil waktu) |
| Progress *Reading groups…* | Sedang scrape |
| **Cancel scrape** (saat progress, di kolom Remark) | Batalkan — data tidak disimpan |

**Scrape penuh ≠ Sync ringkas.** Sync = cek session + pintu scrape. Scrape = baca lengkap **grup yang masih di akun** ke database.

---

## 7. Daftar grup dari kolom Account

Tidak ada tombol **Group link**. Buka daftar dengan **klik angka** di kolom (jika > 0):

| Daftar | Cara buka | Tombol cepat di list |
|--------|-----------|----------------------|
| **On Device** | Klik **On device** | — (lihat isi HP) |
| **Not in Master** | Klik **Junk** | **Leave** → SETUP Leave group |
| **Missing** | Klik **Missing** | **Join missing** → SETUP |
| **Not admin** | Klik **Not admin** | **Set admin** → SETUP |

Alur: klik angka → list → tombol → SETUP → **Queue**. SETUP juga bisa dari Operations tanpa lewat list.

Kosong? **Sync** → **Scrape now** dulu.

---

## 8. Stock grup di header Account

Stock **tidak** punya tab terpisah. Lihat di **Account** → header tiap brand card.

### Header kartu brand

```
Brand | Avg ND | To prep  ···  [ WA n Group ] [ Ready | Recycle | Review ]
```

| Elemen | Makna operasi (sederhana) |
|--------|---------------------------|
| **Ready** | Stock NEW kosong — siap assign customer baru |
| **Recycle** | Grup LG — customer sudah left, bisa daur ulang |
| **Review** | Perlu cek manual (SOP / member anomali) |
| **To prep** | Berapa Ready masih **kurang** vs target; **klikable hanya jika > 1** (buka Create group) |
| **Avg ND** | Rata-rata depositor baru brand (window hari di Settings) |

**Klik** chip Ready / Recycle / Review → modal daftar grup bucket itu (bukan double-click).

Stock chips **hanya monitoring** — buat grup NEW lewat Job Queue **Create group**.

Detail kontrak klasifikasi: lihat `docs/OPERATIONS-STOCK-ENGINE.md`.

---

## 9. Tab Operations — Job Queue

Tab **Operations** = **Job Queue** saja (filter **Platform** di slicer). Brand dan akun dipilih di form SETUP task.

### Task type (sesuai UI)

| Task di UI | Fungsi |
|------------|--------|
| **Join missing** | Join grup master yang belum ada di akun (invite link dari master) |
| **Create group** | Buat grup batch di HP. Role akun harus **Master**. Foto brand **wajib** di SETUP. Set photo biasanya antri otomatis setelah create |
| **Set admin** | OWNER/ADMIN promote Account to promote di grup yang eligible |
| **Leave group** | Keluar dari grup. Jika Delete On di Settings → Worker → Leave & delete, delete chat antri otomatis setelah leave |

### Status antrian

**Queued** → **Running** → **Completed** / **Failed** / **Cancelled** / **Paused** · tombol **PAUSE** / **CANCEL** / **RUN** / **VIEW**.

Satu akun tidak bisa **Sync** bersamaan dengan job di akun yang sama. Maks **10 akun berbeda per platform** (WA dan TG terpisah) bisa jalan paralel (masing-masing 1 slot).

**Batch besar:** Queue banyak grup (mis. 100) → otomatis pecah **maks 30 grup per job**. Akun yang sama antri berurutan. Tunggu semua baris selesai. Jika sebagian grup gagal → status job **Failed** (bukan Completed hijau) — buka VIEW / Remark.

Setelah **Queue** sukses, runner jalan otomatis jika slot kosong.

---

### Join missing (invite by group link)

1. Pilih akun yang belum join lengkap
2. SETUP → **import CSV/XLSX** (drop zone) **atau** accordion **Select from master list** → centang grup → **Queue**
   - Sumber aktif: yang terakhir Anda pakai (CSV atau master list)
   - Banyak grup → beberapa baris job (30 per job)
3. Jika **Failed** sebagian → **VIEW** → No / Group / Status / Remark → perbaiki penyebab bila perlu → **Run**
4. Selesai semua chunk → Account → **Sync** → **Scrape now**

---

### Create group

**Syarat:** Role akun **Master**. Dari CTA **To prep**, pilih Master di SETUP.

**SETUP (3 kartu):**

1. **Group batch**
   - **Group name** (wajib)
   - **Total to create** (wajib)
   - Switch **Number each group name** + **Start from**
2. **Group permissions** (default Settings; ubah hanya untuk job ini)
   - WA: **Admins send only**, **Admins add only**, **Admins edit info**
   - TG: **Hide history for members** saja
3. **Brand photo** (**wajib**). Upload/ganti JPG brand sebelum Queue. Tanpa foto, Queue tidak aktif.

**Queue** → tunggu **Completed**. Set photo biasanya **antri otomatis** setelah create (lihat Remark).

**VIEW:** daftar grup dibuat (nama, ID, invite link) + tombol **Queue Set Photo** untuk retry bila perlu.

Lalu Account → **Sync** → **Scrape now**.

---

### Set admin

1. Pilih **OWNER/ADMIN** (sudah admin di grup)
2. Pilih **Account to promote** (target)
3. SETUP → centang grup eligible (owner admin, target sudah join, belum admin) → **Queue**
4. **Sync** → **Scrape now** di akun target

---

### Leave group

**Syarat:** Leave On di Settings → Worker → **Leave & delete**.

1. Pilih satu akun + task **Leave group** (atau CTA Junk → quick action **Leave**)
2. SETUP ada 2 tab:
   - **On device** — semua grup dari daily scrape
   - **Not in master** — junk (daily minus master). CTA Junk membuka tab ini
3. Centang grup → **Queue**
4. Setelah leave: jika Delete On di Settings, **delete chat antri otomatis** untuk grup yang status Left
5. Delete di sini = hapus/clear chat di akun ini, **bukan** bubarkan grup untuk semua orang
6. VIEW tombol **Queue delete (left groups)** terutama untuk **retry** jika auto-delete gagal/belum jalan
7. Account → **Sync** → **Scrape now**

---

## 10. Group matrix (header Account)

**Hanya baca** — tidak mengubah session, scrape, atau antrian job.

**Cara buka:** Tab **Account** → header brand card → klik **jumlah grup** pada badge platform (WA/TG). Modal = matrix semua akun brand+platform.

### Isi modal

| Bookmark | Isi |
|----------|-----|
| **Full Group** | Baris = grup master; kolom = akun; isi **Yes/No** join |
| **Full Admin** | Sama, fokus status admin |

Filter Status (Active/Ready/Recycle/Review), search nama grup, filter kolom akun Yes/No, dan filter kolom **Super Group** Yes/No tersedia di modal. Export Excel dari modal.

Data ikut update setelah scrape selesai (event realtime `rm-reporting-reload`, debounce ~500 ms).

---

## 11. Settings — apa yang perlu di-set

Buka **Settings** di sidebar (`/settings`; path lama `/admin` dialihkan ke sini).

| Bagian | Perlu di-set? | Isi |
|--------|---------------|-----|
| **Language** | Opsional | English / 中文 |
| **Check for updates** | Opsional | Update app |
| **Automatic account scrape** | **Ya, jika mau** | On Scheduled + Scrape Now — lihat kontrak di bawah |
| **Operations stock policy** | **Ya, per brand** | % minimum Ready, window hari Avg ND |
| **SOP naming (prefix)** | **Ya, jika SOP berubah** | Pola penamaan Active/Ready/Recycle |
| **WhatsApp worker** | **Ya, default otomasi** | Delay, max per run, permission create group default, join throttle |
| **Telegram worker** | **Ya, default otomasi** | Delay, flood-wait, permission TG, set photo retry |

**Penting create group:** nilai permission di **Settings** = default saat buka modal SETUP. Perubahan di modal SETUP hanya untuk **job itu** — tidak menulis balik ke Settings.

### Automatic account scrape (kontrak penuh)

Dua mode di kartu yang sama:

| Kontrol | Arti |
|---------|------|
| **On Scheduled** | Scrape otomatis pada jam harian (app harus **terbuka**) |
| **Scrape Now** | Jalankan scrape sekali untuk brand yang dicentang |

**Default idle (factory):**

- On Scheduled = **On**
- Scrape Now = **Off**
- Jam harian = **12:00 PM**
- Brand On (per platform, max 6): **FWSG, JMMY, M24SG, SBMY, STMY, WBSG**

**Tombol menurut mode:**

| Mode | Tombol | Perilaku |
|------|--------|----------|
| Scrape Now **Off** | **Save** / **Cancel** | Simpan atau buang edit jadwal/brand |
| Scrape Now **On** | **Execute** / **Discard** | Execute mulai scrape; Discard keluar mode tanpa jalan |

**Setelah Execute selesai** → **factory reset** ke default idle di atas.

**Saat Scrape Now On (siap execute, belum/idle cycle):** Status = **standby**, Time = **"-"** (bukan hasil run lama).

Scheduled yang sedang jalan mengunci Scrape Now sampai selesai. Tidak ada catch-up jika app tutup pada jam jadwal.

---

## 12. Di mana melihat apa

| Yang ingin dilihat | Buka di |
|--------------------|---------|
| Akun masih login? | Account → Session **Active** / **Logout** |
| Total grup di HP | Account → **On device** (klik → list On Device) |
| Belum join master | Account → **Missing** (klik → list + Join missing) |
| Belum admin | Account → **Not admin** (klik → list + Set admin) |
| Grup di luar master | Account → **Junk** (klik → list + Leave) |
| Status selaras | Account → **Remark** Aligned / Not Aligned |
| Kapan scrape terakhir | Account → **Last update** (Card view) |
| Stock Ready/Recycle/Review | Account → header brand card (chips) |
| Detail grup per bucket stock | Account → **klik** chip |
| Antrian join/create/admin/leave/set photo | Operations → Job Queue |
| Matrix join semua akun brand | Account → badge grup di header kartu → Full Group |
| Matrix admin semua akun brand | Account → badge grup → Full Admin |
| Filter grup by status stock | Modal Group matrix → Status |

---

## 13. Alur harian & FAQ

### Ceklist harian R&M

**Pagi**
- [ ] Account → filter brand Anda
- [ ] Session **Logout** → **Sync**
- [ ] Remark **Not Aligned** / badge not aligned → catat akun

**Siang**
- [ ] Perbaiki: Join missing / Set admin / Leave sesuai gap
- [ ] **Sync → Scrape now** setiap kali ada perubahan di HP atau job selesai
- [ ] Pantau Job Queue Failed

**Sore**
- [ ] Group matrix brand Anda (badge grup di header kartu)
- [ ] Account — stock chips To prep & Ready

### FAQ / masalah umum

Hanya yang sering di operasi. Pesan lain → baca alert / VIEW Remark → Team Develop.

| Yang muncul | Tindakan |
|-------------|----------|
| Session Logout / timed out / not logged in | **Sync** → QR / Linked Devices. QR tidak muncul → Clear Session → Sync → QR |
| **Navigating frame was detached** | **Clear Session** → Sync → QR → Active → baru **RUN** |
| Remark **Not Aligned** | Klik Junk/Missing/Not admin → Leave / Join missing / Set admin → Scrape now |
| Scrape Reading groups… | Biarkan selesai; jangan Sync/job akun sama |
| Job selesai, angka belum berubah | Sync → **Scrape now** |
| Invite expired | Link baru dari scrape admin → Join missing baru |
| Leave disabled | Settings → Leave & delete → enable Leave |
| Create Queue mati | Role **Master** + nama + total + foto |
| Slots busy / akun sedang jalan | Tunggu (max 10/platform; 1 task/akun) |
| Job Failed / store flake | VIEW Remark → RUN sekali; jika frame detached → Clear Session dulu |
| Auto scrape tidak jalan | App terbuka di jam jadwal, atau Scrape Now → **Execute** |

---

*Panduan ini untuk modul **Group Monitoring** v1.0.37 — tim operasional Depart Resource Management.*
