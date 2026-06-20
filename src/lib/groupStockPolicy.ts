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

/** Prefix3 — customer left; nama resmi berakhir suffix (default LG). */
export function isPrefix3GroupName(groupName: string, brand: string): boolean {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;
  const { prefix3LeftSuffix } = readPrefixTokens();
  const suffixPattern = new RegExp(`\\s${escapeRegex(prefix3LeftSuffix)}\\s*$`, 'i');
  if (!suffixPattern.test(name)) return false;
  return name.toLowerCase().includes(token.toLowerCase());
}

/** Prefix2 — stock resmi: `{brand} {token}` (default NEW). */
export function isPrefix2GroupName(groupName: string, brand: string): boolean {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;
  const { prefix2StockToken } = readPrefixTokens();
  const pattern = new RegExp(
    `^(?:[\\p{Emoji}\\p{Emoji_Presentation}\\s])*(?:${escapeRegex(token)})\\s+${escapeRegex(prefix2StockToken)}\\s*$`,
    'iu',
  );
  return pattern.test(name);
}

/** Prefix1 — grup customer/user (bukan Prefix2 / Prefix3). */
export function isPrefix1GroupName(groupName: string, brand: string): boolean {
  const name = groupName.trim();
  const token = brand.trim();
  if (!name || !token) return false;
  if (isPrefix3GroupName(name, token) || isPrefix2GroupName(name, token)) return false;

  const index = name.toLowerCase().indexOf(token.toLowerCase());
  if (index < 0) return false;

  let afterBrand = name.slice(index + token.length).trim();
  afterBrand = afterBrand.replace(/[\p{Emoji}\p{Emoji_Presentation}]+/gu, '').trim();
  const { prefix1UserToken, prefix2StockToken } = readPrefixTokens();
  if (!afterBrand || new RegExp(`^${escapeRegex(prefix2StockToken)}$`, 'i').test(afterBrand)) {
    return false;
  }
  if (prefix1UserToken !== DEFAULT_PREFIX1_USER_TOKEN && prefix1UserToken !== '*') {
    const userPattern = new RegExp(`^${escapeRegex(prefix1UserToken)}(?:\\s|$)`, 'i');
    if (!userPattern.test(afterBrand)) return false;
  }
  return true;
}
