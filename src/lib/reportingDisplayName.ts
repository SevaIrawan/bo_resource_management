/** UI Reporting saja — tampilkan acc name tanpa prefix brand (mis. "STMY chiris" → "chiris"). */
export function reportingAccountDisplayName(accountName: string, brandName: string): string {
  const name = accountName.trim();
  const brand = brandName.trim();
  if (!name || !brand) return name;

  const lowerName = name.toLowerCase();
  const lowerBrand = brand.toLowerCase();

  if (lowerName.startsWith(`${lowerBrand} `)) {
    return name.slice(brand.length + 1).trim() || name;
  }

  if (lowerName.startsWith(lowerBrand) && name.length > brand.length) {
    const rest = name.slice(brand.length).trimStart();
    if (rest) return rest;
  }

  return name;
}
