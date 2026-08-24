import { describe, expect, it } from "vitest";
import { ANONYMOUS_DEVICE_STORAGE_KEY, getOrCreateAnonymousDeviceId } from "./anonymousDevice";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("getOrCreateAnonymousDeviceId", () => {
  it("首次開啟建立裝置識別，後續呼叫重用同一識別", () => {
    const storage = createStorage();
    const createId = () => "9d2fa6dd-8c0e-4cba-9ec7-2d7c3f1a0f11";

    expect(getOrCreateAnonymousDeviceId(storage, createId)).toBe(createId());
    expect(getOrCreateAnonymousDeviceId(storage, () => "should-not-run")).toBe(createId());
    expect(storage.getItem(ANONYMOUS_DEVICE_STORAGE_KEY)).toBe(createId());
  });
});
