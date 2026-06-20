# Operations — Stock Engine (SOP)

Dokumen kontrak klasifikasi stock grup di tab **Operations**. Status **tidak** disimpan di `groups_master`; dihitung dari fakta scrape + policy penamaan (nanti editable Admin).

## Sumber data

| Sumber | Kolom | Peran |
|--------|--------|--------|
| `resource_management_groups_master` | `group_name`, `member_non_admin` | Fakta per grup (post-scrape rebuild) |
| `public.new_register` | `line`, `new_depositor` | **Avg ND** (terpisah — lihat `loadAvgNewDepositor.ts`) |
| Admin policy | prefix / blocklist / **Ready min %** / **Avg ND days** per brand |

Implementasi: `src/lib/classifyGroupStock.ts`, `src/lib/groupStockPolicy.ts`, `src/lib/loadOperationsStockCounts.ts`.

---

## Standard group naming (sementara — default policy)

| Prefix | Pola nama (contoh brand FWSG) | Makna |
|--------|--------------------------------|--------|
| **Prefix1** | `FWSG {user}` · `{emoji} FWSG {user}` · `FWSG {user} {emoji}` | Grup **customer** aktif |
| **Prefix2** | `FWSG NEW` | Stock **NEW** resmi (siap assign) |
| **Prefix3** | `… {user} LG` (suffix **` LG`**) | Customer **sudah left** — recycle resmi |

**Blocklist → Other:** `❌aa…`, `CO group…`, `Feedback Level…` (default; Admin bisa tambah).

**Urutan evaluasi:** blocklist → Prefix3 → Prefix2 → Prefix1 → Other.

Match brand **case-insensitive** di `group_name`.

---

## Decision table (kontrak v1)

| Kondisi | Status | Makna operasi |
|---------|--------|----------------|
| Blocklist / tidak match prefix SOP | **Other** | Junk / legacy — admin normalize naming |
| Prefix3 + `member_non_admin < 1` | **Recycle** | LG resmi, slot kosong — siap leave/clear/daur ulang |
| Prefix2 + `member_non_admin < 1` | **Ready** | NEW resmi, stock kosong — siap assign |
| Prefix1 + `member_non_admin = 1` | **Active** | Tepat satu customer non-admin |
| Prefix1 + `member_non_admin = 0` | **Review** | Customer sudah keluar tapi nama belum LG/NEW (marketing belum sync) |
| Prefix1 + `member_non_admin > 1` | **Review** | Orang asing di grup customer |
| Selain rule di atas | **Other** | Mismatch SOP |

### Catatan Review (Prefix1 + count ≠ 1)

- **= 0:** member sudah left, tim belum rename ke ` LG` atau stock NEW.
- **> 1:** ada non-admin extra → perlu cek / kick manual.

Keduanya **track & clean oleh admin** — bukan auto worker.

---

## Yang sengaja bukan di master table

- Kolom `status` / `stock_bucket` **tidak** ada di `groups_master`.
- Setelah scrape → rebuild master → engine klasifikasi ulang → chip Operations update.
- SOP berubah di Admin → policy baru → hasil klasifikasi berubah tanpa migration master.

---

## To prep (ambang Ready minimum)

**To prep** = berapa grup Ready masih **kurang** vs target minimum, bukan jumlah Ready yang ada.

| Input | Sumber |
|-------|--------|
| Total grup | Jumlah unik `groups_master` brand+platform |
| Ready sekarang | Chip **Ready** |
| Ambang % | Admin → **Operations stock policy** — **per brand** (default **10%**) |

```text
minReadyTarget = ceil(totalMasterGroups × readyMinPercent / 100)
toPrep         = max(0, minReadyTarget − readyCount)
```

- **toPrep = 0** → OK
- **toPrep > 0** → warning oranye — create NEW atau rename Recycle LG → NEW

**Save:** perubahan di Admin hanya apply setelah klik **Save** (draft + deteksi dirty).

---

## Avg ND (window hari per brand)

Admin → kolom **Avg ND days** per brand (default **30**, range 7–90).

```text
Avg ND = SUM(new_depositor) dalam N hari UTC ÷ N
```

Sumber: `new_register.line` = brand. Implementasi: `loadAvgNewDepositor.ts` + `operationsStockPolicy.ts`.

---

## Roadmap Admin (sisanya)

- Edit prefix pattern per brand / platform
- Blocklist tambahan
- Migrasi policy localStorage → DB (`automation_settings`)

---

## UI Operations

Header brand card:

```text
Brand | Avg ND | To prep  ···  [ WA n Group ] [ Active | Ready | Recycle | Review | Other ]
```

- Badge total = jumlah baris unik `groups_master` (brand + platform).
- Chip stock = agregat bucket (jumlah per status); **jumlah chip tidak wajib = total** selama masih ada Other / overlap policy.
- **Double-click** chip Active / Ready / Recycle / Review / Other → modal daftar grup master bucket tersebut (`OperationsStockDetailModal`).

---

## Referensi kode

```
loadOperationsStockCounts.ts  → SELECT master + agregat bucket
loadOperationsStockBucketDetails.ts → detail modal (filter bucket sama)
classifyGroupStock.ts         → decision table
groupStockPolicy.ts           → prefix + blocklist default
OperationsMonitoringPanel     → reload + rm-operations-reload
GroupMonitoringProvider       → scheduleReportingReload (debounce 500ms)
useRealtimeMonitoring         → groups_master / daily / scrape → reload
```

---

## Realtime (master terbaru → chip stock)

Stock **selalu dihitung ulang** dari `groups_master` (bukan cache Account grid).

| Trigger | Alur |
|---------|------|
| Scrape selesai | daily write → RPC `rm_rebuild_brand_groups_master` → `refreshIssues` → `scheduleReportingReload` |
| Supabase realtime `groups_master` | `useRealtimeMonitoring` → `scheduleIssueRefreshFromData` → `scheduleReportingReload` |
| Supabase realtime `group_scrape_daily` | reconcile akun → `scheduleReportingReload` |
| Registry brand/akun berubah | `handleRegistryRealtime` → `scheduleReportingReload` |
| Full refresh app | `reloadAll` + `rm-reporting-reload` + **`rm-operations-reload`** |

`scheduleReportingReload` (debounce **500ms**) dispatch:

- `rm-reporting-reload`
- **`rm-operations-reload`** → `OperationsMonitoringPanel` reload master count + stock chip

Modal detail bucket (double-click chip) ikut **`rm-operations-reload`** saat masih terbuka.

Tab Operations tidak perlu mounted saat scrape — saat user buka tab, `useEffect` mount memuat data terbaru dari DB.

Terakhir diperbarui: implementasi kontrak SOP stock v1 + realtime master.
