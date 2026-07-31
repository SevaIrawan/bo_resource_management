// Minimal Google Sheets client untuk Deno (Supabase Edge Function).
// Auth pakai JWT service account (tanpa dependency googleapis, biar ringan).

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const clean = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const raw = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google OAuth gagal: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

export class SheetsClient {
  private tokenPromise: Promise<string>;

  constructor(private clientEmail: string, private privateKey: string) {
    this.tokenPromise = getAccessToken(clientEmail, privateKey);
  }

  private async authHeader() {
    return { Authorization: `Bearer ${await this.tokenPromise}` };
  }

  /** Baca semua value di satu sheet (termasuk header di baris 1). */
  async getValues(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;
    const res = await fetch(url, { headers: await this.authHeader() });
    if (res.status === 400 || res.status === 404) return []; // sheet belum ada isinya
    if (!res.ok) throw new Error(`Sheets GET gagal (${sheetName}): ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.values ?? [];
  }

  /**
   * Timpa isi sheet mulai A1 dalam SATU kali panggilan (tanpa clear dulu),
   * supaya tidak ada jeda "kosong sekejap" kalau ada proses lain baca
   * bersamaan. Kalau data baru lebih PENDEK dari data lama, sisa baris lama
   * di bawahnya dibersihkan lewat panggilan clear terpisah SETELAH data
   * baru tertulis (bukan sebelum).
   */
  async writeValues(spreadsheetId: string, sheetName: string, values: string[][], previousRowCount = 0) {
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`;
    const res = await fetch(updateUrl, {
      method: 'PUT',
      headers: { ...(await this.authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    if (!res.ok) throw new Error(`Sheets PUT gagal (${sheetName}): ${res.status} ${await res.text()}`);

    const newRowCount = values.length;
    if (previousRowCount > newRowCount) {
      // bersihkan sisa baris lama yang lebih panjang, SETELAH data baru sudah aman tertulis
      const clearRange = `${sheetName}!A${newRowCount + 1}:ZZ${previousRowCount + 10}`;
      const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`;
      await fetch(clearUrl, { method: 'POST', headers: await this.authHeader() });
    }
  }
}

/**
 * Merge data baru dengan data lama di sheet berdasarkan `key`, supaya kolom
 * Remark (kolom terakhir) yang sudah diisi manual tidak ketimpa.
 * Baris lama yang key-nya sudah tidak ada di data baru otomatis hilang (tidak dipertahankan).
 */
export function mergePreservingRemark(
  header: string[],
  newRows: string[][],
  oldValues: string[][],
  keyColIndexes: number[],
): string[][] {
  const remarkIdx = header.length - 1; // kolom Remark selalu paling kanan
  const oldHeader = oldValues[0] ?? [];
  const oldRows = oldValues.slice(1);

  const keyOf = (row: string[]) => keyColIndexes.map((i) => row[i] ?? '').join('||');

  const oldRemarkByKey = new Map<string, string>();
  if (oldHeader.length > 0) {
    for (const row of oldRows) {
      oldRemarkByKey.set(keyOf(row), row[remarkIdx] ?? '');
    }
  }

  const merged = newRows.map((row) => {
    const remark = oldRemarkByKey.get(keyOf(row)) ?? '';
    const full = [...row];
    full[remarkIdx] = remark;
    return full;
  });

  return [header, ...merged];
}
