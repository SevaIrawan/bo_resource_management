export const LOCATION_DEVICE_OPTIONS = ['MY', 'KH'] as const;

export type LocationDeviceCode = (typeof LOCATION_DEVICE_OPTIONS)[number];

export function isLocationDeviceCode(value: string): value is LocationDeviceCode {
  return value === 'MY' || value === 'KH';
}

export function normalizeLocationDeviceOption(value: string): LocationDeviceCode | '' {
  const normalized = value.trim().toUpperCase();
  return isLocationDeviceCode(normalized) ? normalized : '';
}
