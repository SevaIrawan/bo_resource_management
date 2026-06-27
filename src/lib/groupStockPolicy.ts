import {
  DEFAULT_PREFIX1_USER_TOKEN,
  DEFAULT_PREFIX2_STOCK_TOKEN,
  DEFAULT_PREFIX3_LEFT_SUFFIX,
  readStockPrefixCategoryConfig,
} from '@/config/stockPrefixCategoryConfig';

/** Policy penamaan standard group — prefix category editable Admin. */
export interface GroupStockNamingPolicy {
  /** Token brand (match case-insensitive di group_name). */
  brand: string;
  /** Nama match → Other (junk / legacy). */
  blocklistPatterns: RegExp[];
  /** Prefix1 user slot (default * = any user). */
  prefix1UserToken: string;
  /** Prefix2 token (default NEW). */
  prefix2StockToken: string;
  /** Prefix3 suffix (default LG). */
  prefix3LeftSuffix: string;
}

const DEFAULT_BLOCKLIST: RegExp[] = [
  /^❌aa/i,
  /^CO group/i,
  /^Feedback Level/i,
];

/** Emoji opsional di awal nama — jangan `\p{Emoji}` global (ASCII digit ikut match). */
const LEADING_EMOJI_PREFIX = String.raw`(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}][\s\uFE0F\u200D]*)*`;

function readPrefixTokens(): {
  prefix1UserToken: string;
  prefix2StockToken: string;
  prefix3LeftSuffix: string;
} {
  const cfg = readStockPrefixCategoryConfig();
  return {
    prefix1UserToken: cfg.prefix1UserToken.trim() || DEFAULT_PREFIX1_USER_TOKEN,
    prefix2StockToken: cfg.prefix2StockToken.trim() || DEFAULT_PREFIX2_STOCK_TOKEN,
    prefix3LeftSuffix: cfg.prefix3LeftSuffix.trim() || DEFAULT_PREFIX3_LEFT_SUFFIX,
  };
}

export function defaultStockPolicyForBrand(brandName: string): GroupStockNamingPolicy {
  const { prefix1UserToken, prefix2StockToken, prefix3LeftSuffix } = readPrefixTokens();
  return {
    brand: brandName.trim(),
    blocklistPatterns: DEFAULT_BLOCKLIST,
    prefix1UserToken,
    prefix2StockToken,
    prefix3LeftSuffix,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Hanya emoji di akhir slot user (Prefix1: `{brand} {user} {emoji}`). */
function stripTrailingEmojiFromUserSlot(value: string): string {
  return value.replace(/[\s\p{Extended_Pictographic}\p{Emoji_Presentation}]+$/gu, '').trim();
}

function locateBrand(name: string, brand: string): { afterBrand: string } | null {
  const token = brand.trim();
  if (!token) return null;
  const normalized = name.trim();
  const index = normalized.toLowerCase().indexOf(token.toLowerCase());
  if (index < 0) return null;
  return { afterBrand: normalized.slice(index + token.length).trim() };
}

function suffixAtEndPattern(suffix: string): RegExp {
  return new RegExp(`\\s${escapeRegex(suffix)}\\s*$`, 'i');
}

function isExactStockToken(value: string, stockToken: string): boolean {
  return new RegExp(`^${escapeRegex(stockToken)}\\s*$`, 'i').test(value.trim());
}

/** Prefix3 — Recycle: `[emoji] {brand} {user} {suffix}` · `{brand} {user} {suffix}`. */
export function isPrefix3GroupName(groupName: string, brand: string): boolean {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;

  const { prefix3LeftSuffix } = readPrefixTokens();
  const suffix = prefix3LeftSuffix.trim();
  if (!suffix) return false;

  const suffixRe = suffixAtEndPattern(suffix);
  if (!suffixRe.test(name)) return false;
  if (!name.toLowerCase().includes(token.toLowerCase())) return false;

  const located = locateBrand(name, token);
  if (!located) return false;

  const userPart = located.afterBrand.replace(suffixRe, '').trim();
  if (!userPart) return false;

  const { prefix2StockToken } = readPrefixTokens();
  if (isExactStockToken(userPart, prefix2StockToken)) return false;

  const userSegment = String.raw`\S+(?:\s+\S+)*?`;
  const pattern = new RegExp(
    `^${LEADING_EMOJI_PREFIX}${escapeRegex(token)}\\s+${userSegment}\\s+${escapeRegex(suffix)}\\s*$`,
    'iu',
  );
  return pattern.test(name);
}

/** Prefix2 — Ready: `[emoji] {brand} {NEW}` · `… {user} {NEW}` · `… {user} {NEW} {tail}`. */
export function isPrefix2GroupName(groupName: string, brand: string): boolean {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;

  const { prefix2StockToken } = readPrefixTokens();
  const stock = escapeRegex(prefix2StockToken.trim());
  const b = escapeRegex(token);
  const userSegment = String.raw`\S+(?:\s+\S+)*?`;

  if (new RegExp(`^${LEADING_EMOJI_PREFIX}${b}\\s+${stock}\\s*$`, 'iu').test(name)) {
    return true;
  }
  if (new RegExp(`^${LEADING_EMOJI_PREFIX}${b}\\s+${userSegment}\\s+${stock}\\s*$`, 'iu').test(name)) {
    return true;
  }
  return new RegExp(
    `^${LEADING_EMOJI_PREFIX}${b}\\s+${userSegment}\\s+${stock}\\s+.+\\s*$`,
    'iu',
  ).test(name);
}

function parsePrefix1AfterBrand(
  afterBrand: string,
  prefix1UserToken: string,
  prefix2StockToken: string,
  prefix3LeftSuffix: string,
): boolean {
  let rest = stripTrailingEmojiFromUserSlot(afterBrand.trim());
  if (!rest) return false;
  if (isExactStockToken(rest, prefix2StockToken)) return false;
  if (suffixAtEndPattern(prefix3LeftSuffix).test(rest)) return false;

  let user = '';
  let trailing = '';

  if (prefix1UserToken !== DEFAULT_PREFIX1_USER_TOKEN && prefix1UserToken !== '*') {
    const userPattern = new RegExp(`^(${escapeRegex(prefix1UserToken)})(?:\\s+(.*))?$`, 'is');
    const match = rest.match(userPattern);
    if (!match?.[1]?.trim()) return false;
    user = match[1].trim();
    trailing = (match[2] ?? '').trim();
  } else {
    const match = rest.match(/^(\S+)(?:\s+(.*))?$/s);
    if (!match?.[1]?.trim()) return false;
    user = match[1].trim();
    trailing = (match[2] ?? '').trim();
  }

  if (!user) return false;
  if (trailing) {
    if (isExactStockToken(trailing, prefix2StockToken)) return false;
    if (suffixAtEndPattern(prefix3LeftSuffix).test(trailing)) return false;
  }
  return true;
}

/** Prefix1 — Active/Review: brand + user (string/angka) + tail opsional (bukan NEW/LG). */
export function isPrefix1GroupName(groupName: string, brand: string): boolean {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;
  if (isPrefix3GroupName(name, token) || isPrefix2GroupName(name, token)) return false;

  const located = locateBrand(name, token);
  if (!located?.afterBrand) return false;

  const { prefix1UserToken, prefix2StockToken, prefix3LeftSuffix } = readPrefixTokens();
  return parsePrefix1AfterBrand(
    located.afterBrand,
    prefix1UserToken,
    prefix2StockToken,
    prefix3LeftSuffix,
  );
}
