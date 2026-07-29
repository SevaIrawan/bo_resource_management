/**
 * Checkpoint scrape lokal — resume setelah crash/idle tanpa buang kerja berjam-jam.
 * Commit DB tetap atomik di akhir (rm_commit_account_scrape).
 */
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { ScrapedGroupRow } from './index';

export type ScrapeCheckpoint = {
  sessionId: string;
  platform: 'whatsapp' | 'telegram';
  updatedAt: string;
  rows: ScrapedGroupRow[];
  /** group_id yang sudah selesai metadata (+ invite bila admin). */
  doneGroupIds: string[];
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function checkpointDir(): string {
  const dir = path.join(app.getPath('userData'), 'scrape-checkpoints');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function checkpointPath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return path.join(checkpointDir(), `${safe}.json`);
}

export function loadScrapeCheckpoint(
  sessionId: string,
  platform: 'whatsapp' | 'telegram',
): ScrapeCheckpoint | null {
  try {
    const raw = fs.readFileSync(checkpointPath(sessionId), 'utf8');
    const parsed = JSON.parse(raw) as ScrapeCheckpoint;
    if (parsed.sessionId !== sessionId || parsed.platform !== platform) return null;
    const age = Date.now() - Date.parse(parsed.updatedAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null;
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.doneGroupIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveScrapeCheckpoint(input: ScrapeCheckpoint): void {
  const payload: ScrapeCheckpoint = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${checkpointPath(input.sessionId)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, checkpointPath(input.sessionId));
}

export function clearScrapeCheckpoint(sessionId: string): void {
  try {
    fs.unlinkSync(checkpointPath(sessionId));
  } catch {
    // missing ok
  }
}
