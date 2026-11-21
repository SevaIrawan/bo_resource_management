# Planning — Label Batch Grup WhatsApp per Brand

> Status: **PLANNING (belum dieksekusi)**. Disepakati dengan user 2026-11-21.
> Setiap langkah eksekusi (bagian E) wajib izin eksplisit user per langkah (`CLAUDE.md` aturan 5).
> Repo saat planning ditulis = isi v1.0.38 (`f2e7edf`, di-restore lewat `ed61848`).

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

## G. Aturan bisnis — batch akun

1. **Card brand (UI):** kolom **Role** diganti kolom **Batch**. **Modal Add akun:** field Role diganti field Batch. Batch **tidak bisa diubah lewat Edit**. (Logika Role / izin Create Group dibahas terpisah — di luar planning ini.)
2. **Modal Add akun WA** — dropdown **Status Acc**: **New** / **Old**.
   - **New Acc** → dropdown Batch aktif (A, B, C … yang ada di tabel label brand itu).
   - **Old Acc** → dropdown Batch terkunci; card menampilkan **"-"** sebelum akun di-scrape, **"Old Acc"** setelah scrape.
3. **Pengecekan New Acc hanya di scrape pertama** — yang dihitung hanya grup akun yang **valid ada di master** brand, dicocokkan ke tabel label:
   - 0 grup master → batch tetap pilihan saat Add.
   - Semua grup di **1 batch** → batch akun **ikut batch grup itu** (sama/beda dari pilihan Add).
   - Grup di **≥ 2 batch berbeda** → **Old Acc**.
   Setelah scrape pertama batch tidak berubah lagi; **Old Acc final**.
4. **New Acc hanya menampilkan invite link grup di batch-nya.** **Old Acc** melihat semua grup master brand (perilaku sekarang).
5. Akun WA yang sudah ada (**55 akun**) = **Old Acc**. **Tidak ada FULL.**

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
- Hasil Job Queue (Create/Leave/Delete) hanya disimpan **lokal** di `userData/automation-job-queue.json` (`electron/main/automation/jobQueueTypes.ts:62-78`); folder `electron/main/automation/` tidak menulis ke Supabase. Grup hasil Leave: `exitStatus === 'left'` (`src/lib/exitDeleteFlow.ts` `resolveLeftGroupsFromExitJob`).
- Akun baru setelah Add: status `logout`, session `invalid`, grup 0 (`src/lib/accountBrandUtils.ts:118-136`) — grup baru diketahui setelah login + scrape pertama.
- Group matrix header card: `BrandMasterGroupsModal` → `loadJoinGroupMatrix` (`src/lib/loadJoinGroupReport.ts:44`) → export `exportReportingMatrixExcel` (`src/lib/exportExcel.ts:229`).
- Invite link master per akun ditampilkan di (daftar awal, trace lengkap di langkah E1):
  - modal Missing / Not admin — `fetchAccountGroupLinks` / `fetchAccountMasterGapGroupLinks` (`src/lib/accountGroupLinks.ts:160-216`);
  - Join list Job Queue — `loadMissingMasterGroupsJoinSnapshot` (`src/lib/loadMissingMasterGroupsForJoin.ts`);
  - validasi CSV Join — `validateCsvJoinAgainstMaster` (`src/lib/validateCsvJoinAgainstMaster.ts:69+`).
- Kolom Role card: header `src/components/group-monitoring/AccountMonitoringTableParts.tsx:18,33,64,111`; sel `AccountMonitoringCells.tsx:64-75, 622-627, 824-828`; CSS `src/index.css:2819, 6335`. Field Role modal Add: `AddAccountModal.tsx:44, 79-94, 224-237`.

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
   - penanda "sudah scrape" per akun (untuk tampilan "-" dan pengecekan scrape pertama);
   - pengecekan G3 dijalankan di `rm_commit_account_scrape` hanya pada commit scrape pertama akun.
5. Sync label dijalankan di: `rm_commit_account_scrape` (scrape), `rm_rebuild_brand_groups_master` (hapus akun), `rm_record_group_exit` (Leave/Delete). Error sync **tidak** menggagalkan commit scrape.
6. Kompatibel app v1.0.38: signature fungsi yang dipakai app tidak berubah; gate master 040 tidak berubah; app membaca master dengan daftar kolom eksplisit (`src/config/masterGroupColumns.ts`).
7. Repo = DB: file 043 dimasukkan kembali + file 044 + skrip rollback 044.

## C. Perubahan app

1. **Pemicu 2:** Leave/Delete sukses di Job Queue → panggil `rm_record_group_exit` (retry bila gagal/offline). Titik file:baris — hasil trace E1.
2. **Kolom Batch hanya di Group matrix header card** (`BrandMasterGroupsModal`): loader tambah `batch`, kolom Batch di tabel matrix, kolom Batch di export — WA saja.
3. **Batch akun (G):** kolom Role → Batch di card; modal Add: Status Acc (New/Old) + dropdown Batch menggantikan field Role; simpan `wa_batch`; tampilan "-" / huruf batch / "Old Acc".
4. **New Acc hanya invite link batch-nya:** filter di semua titik invite link per akun (daftar final hasil trace E1).
5. Butuh **rilis app** (naik versi) — hanya atas perintah eksplisit user.

## D. Uji

1. **DB (replika lokal skema produksi):** pembagian awal; grup baru mengisi batch; missing → active; hapus akun → closed; Leave/Delete → closed; masih ada pemegang lain → tetap missing; closed tidak aktif lagi; hapus brand → label tetap; id tidak dobel; `batch` master terisi benar; G3 (0 / 1 batch / ≥ 2 batch, hanya scrape pertama); TG tidak tersentuh; error sync tidak menggagalkan scrape. Rollback 044 diuji sampai identik dengan kondisi sebelum 044.
2. **App:** typecheck, validator terkait, uji read-only ke DB produksi, tes di PC user (`npm.cmd run dev`) sebelum rilis.

## E. Urutan eksekusi (masing-masing tunggu izin user)

1. Trace (baca saja): Add akun, kolom card, Job Queue Leave/Delete, Group matrix, semua titik invite link per akun → rencana file:baris.
2. Tulis 044 + rollback → uji lokal (D1).
3. User menjalankan 044 di SQL Editor → verifikasi read-only.
4. Tulis kode app (C) → uji (D2).
5. Commit, push, dan rilis — atas perintah eksplisit user.

## Di luar planning ini

- Logika Role / izin Create Group (dibahas terpisah).
- Timeout "Unable to load accounts from database" (terukur juga di v1.0.38) — ditangani terpisah.
