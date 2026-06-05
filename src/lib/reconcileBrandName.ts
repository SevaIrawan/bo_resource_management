import { resolveBrandNameFromId } from '@/lib/brandStandardCount';

/** Sumber brand untuk ticket reconcile — selaras grid monitoring (brands.name dulu). */
export function pickBrandNameForReconcile(
  brandId: string,
  meta: { brand?: string } | null | undefined,
  brandNameById: Map<string, string>,
): string {
  const fromTable = brandNameById.get(brandId)?.trim();
  if (fromTable) return fromTable;
  return meta?.brand?.trim() || '';
}

export async function resolveBrandNameForReconcileAccount(input: {
  brandId: string;
  meta?: { brand?: string } | null;
  optionsBrand?: string;
}): Promise<string> {
  const fromOptions = input.optionsBrand?.trim();
  if (fromOptions) return fromOptions;

  const fromTable = (await resolveBrandNameFromId(input.brandId))?.trim();
  if (fromTable) return fromTable;

  return input.meta?.brand?.trim() || '';
}
