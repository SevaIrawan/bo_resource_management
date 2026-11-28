# Planning — Label Batch Grup WhatsApp per Brand

> Status: **PLANNING (belum dieksekusi)** — langkah **E1 (trace) selesai** 2026-11-28.
> Disepakati dengan user 2026-11-21 s/d 2026-11-28.
> Setiap langkah eksekusi (bagian E) wajib izin eksplisit user per langkah (`CLAUDE.md` aturan 5).
> Rujukan `file:baris` di dokumen ini = kode v1.0.38 (`f2e7edf`; `main` di-restore lewat `ed61848`).

---

## A. Aturan bisnis — tabel label

1. Tabel label **berdiri sendiri**. `groups_master` hanya **sumber data masuk**; isi tabel label tidak ikut terhapus/berubah bila master berubah.
2. Kunci unik **brand + group_id** — satu baris per grup per brand, **tidak ada id dobel**. Hanya **WhatsApp**.
3. **Brand yang sudah ada di master tapi belum ada di tabel label** (termasuk saat pertama kali dijalankan): semua grup master brand itu langsung disimpan dan dibagi ke batch **A, B, C … maksimal 400 grup per batch**. Tidak memakai tanggal grup dibuat; urutan teknis pengisian = `group_id` (hanya agar hasil selalu sama, bukan urutan waktu).
4. **Grup baru di master** yang belum punya label → otomatis ditambahkan ke **batch paling awal yang (active + missing) < 400**; semua penuh → batch baru. Data lama **tidak dihapus dan tidak dipindah batch**.
5. **Datetime** label = waktu grup pertama kali masuk tabel label (data awal = waktu brand pertama kali disimpan; grup baru, termasuk hasil Create Group Job Queue = waktu pertama muncul di master setelah scrape).
6. Status:
   - **active** — grup ada di master.
   - **missing** — grup hilang dari master; **slot tetap dipegang, tidak diisi grup lain**.
   - **closed** — status **final**; slot dilepas lalu diisi grup baru; baris **tetap tercatat**.
7. **missing → active** bila grup muncul lagi di master (mis. akun banned dipulihkan lalu di-scrape ulang) — **batch tetap**.
8. **missing → closed** bila **setiap** akun pemegang grup itu:
   - **Pemicu 1:** sudah **dihapus dari UI GM Apps**, atau
   - **Pemicu 2:** sudah **Leave / Delete grup itu lewat Job Queue** (sukses).
   Selama masih ada satu pemegang yang belum memenuhi salah satunya → tetap **missing**.
9. **closed tidak pernah aktif lagi** (grup closed/dihapus dianggap tidak berlaku).
10. **Brand dihapus dari UI** → label brand itu **tetap tercatat** apa adanya.
11. **Master tetap yang berlaku**: tabel `groups_master` diberi kolom **`batch`** yang diisi dari tabel label.
12. **Kolom Batch hanya tampil di Group matrix header card** (modal dari badge grup), **setelah kolom Group ID**, dan ikut di export. WA saja.

## G. Aturan bisnis — batch akun

1. **Card brand mode WA:** kolom **Role** diganti kolom **Batch**. **Modal Add akun WA:** field Role diganti field Batch. Batch **tidak bisa diubah lewat Edit**. (Logika Role / izin Create Group dibahas terpisah — di luar planning ini.)
2. **Modal Add akun WA** — dropdown **Status Acc**: **New** / **Old**.
   - **New Acc** → dropdown Batch aktif (A, B, C … yang ada di tabel label brand itu).
   - **Old Acc** → dropdown Batch terkunci; card menampilkan **"-"** sebelum akun di-scrape, **"Old Acc"** setelah scrape.
3. **Pengecekan New Acc hanya di scrape pertama** — yang dihitung hanya grup akun yang **valid ada di master** brand, dicocokkan ke tabel label:
   - 0 grup master → batch tetap pilihan saat Add.
   - Semua grup di **1 batch** → batch akun **ikut batch grup itu** (sama/beda dari pilihan Add).
   - Grup di **≥ 2 batch berbeda** → **Old Acc**.
   Setelah scrape pertama batch tidak berubah lagi; **Old Acc final**.
4. **Akun batch (A/B/C …)**: Junk, Missing, Not admin, Join list Job Queue, dan semua daftar invite link dihitung **hanya terhadap grup batch-nya**; grup master batch lain di akun itu dihitung **Junk**. Angka grid = jumlah baris modal (satu engine).
5. **Old Acc**: semua dihitung terhadap **seluruh master brand** (perilaku sekarang).
6. Akun WA yang sudah ada (**55 akun**) = **Old Acc**. **Tidak ada FULL.**
7. **Table view** (tombol *Card view / Table view* di slicer halaman Account): kolom **Role** juga diganti **Batch** — baris WA menampilkan batch akun; baris TG menampilkan **"-"** (batch tidak berlaku untuk Telegram).
8. **Telegram tidak berubah**: card brand mode TG tetap kolom **Role**; modal Add akun TG tetap field **Role**.

---

## Fakta kondisi saat ini (terverifikasi)

### Database produksi (Supabase `bbuxfnchflhtulainndm`)
- Migrasi **043 sudah aktif** (dijalankan 2026-11-20 lewat SQL Editor, tidak tercatat di `supabase_migrations`):
  - tabel `resource_management_group_batch_labels` (0 baris), `resource_management_account_scrape_commits`;
  - kolom `group_created_at` (daily + master), `messaging_accounts.wa_batch` (55 akun WA = `OLD`, 45 TG = NULL; constraint masih mengizinkan `FULL`);
  - fungsi `rm_sync_group_batch_labels`, `rm_batch_letter`, `rm_batch_index`; `rm_commit_account_scrape` + `rm_rebuild_brand_groups_master` versi 043.
- Fungsi sync 043 memakai **logika lama** (menunggu `group_created_at`, aturan release lama) → label tidak pernah terbentuk. Akan diganti 044.
- File migrasi/rollback 043 **tidak ada di repo** (ikut ter-restore ke v1.0.38) → harus dimasukkan kembali agar repo = DB.

### Kode app v1.0.38
- Master dibangun ulang dari daily semua akun brand tiap scrape (`rm_commit_account_scrape`, migrasi 040). Akun banned/belum scrape tetap menyumbang daily terakhirnya ke master.
- Hapus akun → daily terhapus (`ON DELETE CASCADE`, `supabase/migrations/017_rm_full_reset.sql:158`) → `rm_rebuild_brand_groups_master` (`src/lib/messagingAccounts.ts:216-218`; dilewati bila `brand_card_removed`).
- Akun baru setelah Add: status `logout`, session `invalid`, grup 0 (`src/lib/accountBrandUtils.ts:118-136`) — grup baru diketahui setelah login + scrape pertama.

---

## E1 — Hasil trace (rencana file:baris)

### 1. Batch akun — card, Table view, Add akun (G1, G2, G7, G8)

| Bagian | File:baris (v1.0.38) | Rencana |
|---|---|---|
| Card hanya akun satu platform (WA/TG) | `src/components/group-monitoring/AccountBrandCard.tsx:106, 125` | judul kolom ikut platform card: WA = Batch, TG = Role |
| Header kolom Role (card + Table view) | `src/components/group-monitoring/AccountMonitoringTableParts.tsx:18, 33, 63-65, 110-112` | judul → Batch (card WA, Table view); card TG tetap Role |
| Table view (semua akun semua brand) | `src/components/group-monitoring/AccountBrandTableView.tsx:17-46`, `AccountMonitoringBody.tsx:74-76` | kolom Batch; baris TG "-" |
| Sel Role baris akun | `src/components/group-monitoring/AccountMonitoringCells.tsx:64-75, 622-627` | WA: huruf batch / "Old Acc" / "-"; TG card: role (tetap) |
| Sel Role slot kosong | `AccountMonitoringCells.tsx:824-828` | tetap "—" |
| Lebar kolom | `src/index.css:2819, 6335` | tetap |
| Field Role modal Add | `src/components/group-monitoring/AddAccountModal.tsx:44, 79-94, 224-237` | WA: Status Acc (New/Old) + Batch menggantikan Role; TG: tetap Role |
| Simpan akun | `AccountBrandCard.tsx:177-185` → `AccountBrandCardList.tsx:148-170` → `src/lib/messagingAccounts.ts:93-156` (insert), `59-91` (reaktivasi) | tulis `wa_batch` |
| Row grid dari DB | `src/lib/loadAccountMonitoring.ts:60-97`, `src/config/dbColumns.ts:4-5`, `src/types/accountMonitoringUi.ts:21-48, 71-80`, `src/types/database.ts:29-42` | tambah batch + penanda sudah scrape |
| Row lokal setelah Add | `src/lib/accountBrandUtils.ts:112-136` | tambah batch |
| Teks UI | `src/i18n/locales/en.ts`, `zh.ts` (blok `accountCard`) | Batch / Status Acc / New / Old / Old Acc |

Fakta terdampak: modal Add WA saat ini wajib role (`AddAccountModal.tsx:91-94`); bila field diganti, akun WA baru tersimpan dengan role default kode (`effectiveAccountOpsRole` → `gcs`, `src/config/accountOpsRole.ts`). Modal Edit tidak disentuh. (Logika Role dibahas terpisah.)

### 2. Pemicu 2 — catat Leave/Delete Job Queue (A8)

- Proses main Electron **tidak punya koneksi Supabase** (satu-satunya `createClient` di `electron/` = client WhatsApp, `electron/main/platformLogin/whatsapp.ts:301`) → pencatatan dari **renderer**.
- Hasil per grup ditulis saat job selesai: `markJobFinished` + `groupOutcomes` (`electron/main/automation/jobQueueRunner.ts:370-392, 555`), juga saat batal/pause/timeout (`:419, 443, 457, 485`). Status: `exitStatus === 'left'` / `deleteStatus === 'deleted'` (`:273-280`).
- `accountId` job = UUID akun DB (`src/hooks/useJobQueueSetupEnqueue.ts:364, 420, 497`).
- Pendengar perubahan Job Queue (`subscribeJobQueueChanged`, `src/lib/automationJobQueueClient.ts:142`; snapshot `:13`) saat ini hanya di panel Operations / modal setup (`OperationsGlobalJobQueuePanel.tsx:70`, `useJobQueueSetupEnqueue.ts:307`).
- **Rencana:** pencatat baru di `GroupMonitoringProvider` (selalu aktif setelah login, `src/components/layout/DashboardLayout.tsx:17`): saat app dibuka + setiap Job Queue berubah → pindai job dengan grup `left`/`deleted` → `rm_record_group_exit` (idempoten, tidak dobel).

### 3. Kolom Batch di Group matrix (A11, A12)

| Bagian | File:baris | Rencana |
|---|---|---|
| Loader | `src/lib/loadJoinGroupReport.ts:19-28, 38-48` | select + tipe `batch` |
| Tabel | `src/components/group-monitoring/ReportingJoinMatrixTable.tsx:209-221, 284-286` | kolom Batch setelah Group ID (WA) |
| Export | `BrandMasterGroupsModal.tsx:286` → `src/lib/exportExcel.ts:229-260` | kolom Batch setelah Group ID (WA) |

### 4. Hitungan & invite link per batch akun (G4, G5)

- Angka grid: Junk = Y − joined, Missing = X − joined, Not admin = joined − admin (`src/lib/accountGapMetrics.ts:18-21`); X = total master yang dipakai engine.
- Engine master/daily per akun: `loadMasterDailyForAccount` (`src/lib/accountMasterDailyCompare.ts:198-247`) + cache master per brand (`src/lib/masterDailyLoadCache.ts`) → **filter master per batch akun di sini**.
- Penimpa X per akun yang harus ikut batch: `patchBrandStandardCountForPlatform` (`src/lib/accountBrandUtils.ts:287-309`), `patchMasterTotalsOnRow` (`src/lib/accountSyncData.ts:162-179`), `buildBrandStandardFromCache` (`src/lib/loadAccountMonitoring.ts:37-50`).
- Pembaca master langsung per akun (filter yang sama):

| Titik | File:baris |
|---|---|
| Modal Missing / Not admin / Admin vs master | `GroupLinksModal.tsx:42-54` → `src/lib/accountGroupLinks.ts:50-75, 160-216` |
| Join list Job Queue | `useJobQueueSetupEnqueue.ts:155` → `src/lib/loadMissingMasterGroupsForJoin.ts:21-55` (lewat engine) |
| Validasi CSV Join | `OperationsJobQueueSetupModal.tsx:533` → `src/lib/validateCsvJoinAgainstMaster.ts:69-130` |
| Leave/Delete (Junk) | `src/lib/loadAccountDailyGroupsForLeaveDelete.ts:60` |
| Set admin target (Not admin) | `src/lib/loadSuperAdminGroupsForSetAdmin.ts` (lewat engine) |

- Badge jumlah grup header brand tetap **total master brand** (bukan per akun).

---

## B. Database — migrasi baru 044

1. Tabel label:
   - kolom pemegang grup `holder_account_ids` (akun yang daily-nya memuat grup; diperbarui selama grup ada di master);
   - status `released` → `closed` (final); kolom alasan close (`account_deleted` / `leave` / `delete`) + waktu close;
   - datetime masuk label (pakai kolom `assigned_at`).
2. Tabel baru **catatan keluar grup** (akun, brand, group_id, leave/delete, waktu) + RPC **`rm_record_group_exit`** (idempoten, tanpa dobel).
3. Kolom **`batch`** di `groups_master` — diisi dari tabel label **di transaksi yang sama** dengan rebuild master (TG: kosong).
4. Batch akun:
   - constraint `wa_batch`: huruf A..ZZ atau `OLD` (hapus `FULL`);
   - penanda "sudah scrape" per akun (tampilan "-" dan pengecekan scrape pertama); akun yang sudah pernah scrape sebelum 044 dianggap sudah scrape;
   - pengecekan G3 dijalankan di `rm_commit_account_scrape` hanya pada commit scrape pertama akun.
5. Sync label dijalankan di: `rm_commit_account_scrape` (scrape), `rm_rebuild_brand_groups_master` (hapus akun), `rm_record_group_exit` (Leave/Delete). Error sync **tidak** menggagalkan commit scrape.
6. Kompatibel app v1.0.38: signature fungsi yang dipakai app tidak berubah; gate master 040 tidak berubah; app membaca master dengan daftar kolom eksplisit (`src/config/masterGroupColumns.ts`).
7. Repo = DB: file 043 dimasukkan kembali + file 044 + skrip rollback 044.

## C. Perubahan app (ringkas — rinci di E1)

1. **Pemicu 2:** pencatat Leave/Delete di `GroupMonitoringProvider` → `rm_record_group_exit` (E1 §2).
2. **Kolom Batch di Group matrix** + export, setelah Group ID, WA saja (E1 §3).
3. **Batch akun:** card WA + Table view kolom Batch; modal Add WA Status Acc + Batch; simpan `wa_batch` (E1 §1).
4. **Hitungan & invite link per batch** untuk akun batch; Old Acc seluruh master (E1 §4).
5. Butuh **rilis app** (naik versi) — hanya atas perintah eksplisit user.

## D. Uji

1. **DB (replika lokal skema produksi):** pembagian awal; grup baru mengisi batch; missing → active; hapus akun → closed; Leave/Delete → closed; masih ada pemegang lain → tetap missing; closed tidak aktif lagi; hapus brand → label tetap; id tidak dobel; `batch` master terisi benar; G3 (0 / 1 batch / ≥ 2 batch, hanya scrape pertama); TG tidak tersentuh; error sync tidak menggagalkan scrape. Rollback 044 diuji sampai identik dengan kondisi sebelum 044.
2. **App:** typecheck, validator terkait, uji read-only ke DB produksi (metrik Old Acc identik dengan v1.0.38), tes di PC user (`npm.cmd run dev`) sebelum rilis.

## E. Urutan eksekusi (masing-masing tunggu izin user)

1. ~~Trace (baca saja) → rencana file:baris~~ — **selesai** (bagian E1).
2. Tulis 044 + rollback → uji lokal (D1).
3. User menjalankan 044 di SQL Editor → verifikasi read-only.
4. Tulis kode app (C) → uji (D2).
5. Commit, push, dan rilis — atas perintah eksplisit user.

## Di luar planning ini

- Logika Role / izin Create Group (dibahas terpisah).
- Timeout "Unable to load accounts from database" (terukur juga di v1.0.38) — ditangani terpisah.
