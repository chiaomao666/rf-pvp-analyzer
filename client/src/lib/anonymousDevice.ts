export const ANONYMOUS_DEVICE_STORAGE_KEY = "rf-pvp-analyzer-device-id";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function getOrCreateAnonymousDeviceId(
  storage: StorageLike = window.localStorage,
  createId: () => string = () => crypto.randomUUID(),
) {
  const existing = storage.getItem(ANONYMOUS_DEVICE_STORAGE_KEY);
  if (existing) return existing;

  const deviceId = createId();
  storage.setItem(ANONYMOUS_DEVICE_STORAGE_KEY, deviceId);
  return deviceId;
}
