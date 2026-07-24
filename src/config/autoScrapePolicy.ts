/** Timing auto scrape — antre terbatas, gagal skip + tutup device, jeda antar akun. */
export const AUTO_SCRAPE_POLICY = {
  /** Poll saat menunggu user lane / job queue lepas untuk akun ini. */
  readyPollMs: 10_000,
  /** Maks tunggu sebelum skip akun (jangan stuck berjam-jam). */
  readyMaxWaitMs: 3 * 60_000,
  /** Jeda setelah satu akun selesai (sukses/gagal/skip) sebelum akun berikutnya. */
  gapAfterAccountMs: 30_000,
  /** Poll mid-scrape: brand/Acc OFF → cancel-auto device. */
  selectionWatchMs: 1_000,
} as const;

export type AutoScrapeCycleControl = {
  /** Abort seluruh cycle (master OFF / unmount). */
  isAborted: () => boolean;
  /** false = brand/Acc tidak lagi dipilih → skip atau cancel Acc ini. */
  isAccountSelected?: (accountId: string) => boolean;
};
