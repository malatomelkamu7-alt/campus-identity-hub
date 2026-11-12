import { describe, it, expect } from "vitest";
import { fullscreenSupported, inFullscreen } from "@/lib/fullscreen";

const fakeDoc = (o: Record<string, unknown>, el: Record<string, unknown> = {}) => ({ ...o, documentElement: el }) as unknown as Document;

describe("exam fullscreen helpers", () => {
  it("treats older Safari (webkit) fullscreen as supported", () => {
    expect(fullscreenSupported(fakeDoc({ webkitFullscreenEnabled: true }, { webkitRequestFullscreen: () => {} }))).toBe(true);
  });
  it("reports no fullscreen on phones whose browser has none (e.g. iPhone Safari)", () => {
    expect(fullscreenSupported(fakeDoc({}, {}))).toBe(false);
  });
  it("detects fullscreen through the webkit name too", () => {
    expect(inFullscreen(fakeDoc({ webkitFullscreenElement: {} }))).toBe(true);
    expect(inFullscreen(fakeDoc({ fullscreenElement: null }))).toBe(false);
  });
});
