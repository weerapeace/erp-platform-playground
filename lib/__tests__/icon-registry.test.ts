import { describe, expect, it } from "vitest";
import { ERP_ICONS, erpIconDef } from "@/lib/erp-icons";
import {
  DEFAULT_ICON_SETTINGS, ICON_MEANINGS, TONE_COLOR, cleanIconSettings, emojisOfMeaning, iconMeaning, meaningColor, meaningOfEmoji, normEmoji, resolveIcon,
  type IconSettings,
} from "@/lib/icon-registry";

const S = (p: Partial<IconSettings> = {}): IconSettings => ({ ...DEFAULT_ICON_SETTINGS, ...p });

describe("icon registry", () => {
  it("every meaning points to an icon that exists in the ERP set, with unique keys", () => {
    const keys = new Set<string>();
    for (const m of ICON_MEANINGS) {
      expect(erpIconDef(m.icon), `${m.key} → ${m.icon}`).not.toBeNull();
      expect(keys.has(m.key), `duplicate meaning ${m.key}`).toBe(false);
      keys.add(m.key);
    }
    expect(new Set(ERP_ICONS.map((i) => i.key)).size).toBe(ERP_ICONS.length);
  });

  it("matches emoji with or without the variation selector", () => {
    expect(meaningOfEmoji("⚙️", S())?.key).toBe("settings");
    expect(meaningOfEmoji("⚙", S())?.key).toBe("settings");
    expect(meaningOfEmoji("🧑‍💼", S())?.key).toBe("customer");
    expect(normEmoji(" 🗂️ ")).toBe("🗂");
  });

  it("emoji mode keeps the original emoji exactly", () => {
    expect(resolveIcon({ value: "🗂️" }, S())).toEqual({ kind: "text", text: "🗂️" });
    expect(resolveIcon({ name: "save" }, S())).toEqual({ kind: "text", text: "💾" });
  });

  it("line mode draws the meaning's line icon; colour mode adds its tone colour", () => {
    const line = resolveIcon({ value: "🗑️" }, S({ mode: "line" }));
    expect(line).toMatchObject({ kind: "line", color: null });
    expect(resolveIcon({ value: "🗑️" }, S({ mode: "color" }))).toMatchObject({ kind: "line", color: TONE_COLOR.danger });
    expect(resolveIcon({ name: "settings" }, S({ mode: "color" }))).toMatchObject({ kind: "line", color: null });
  });

  it("a colour set by the admin shows in both icon modes, never in emoji mode", () => {
    const colors = { delete: "#0284c7", settings: "#db2777" };
    expect(resolveIcon({ value: "🗑️" }, S({ mode: "line", colors }))).toMatchObject({ color: "#0284c7" });
    expect(resolveIcon({ value: "🗑️" }, S({ mode: "color", colors }))).toMatchObject({ color: "#0284c7" });
    expect(resolveIcon({ name: "settings" }, S({ mode: "line", colors }))).toMatchObject({ color: "#db2777" });
    expect(resolveIcon({ value: "🗑️" }, S({ mode: "emoji", colors }))).toEqual({ kind: "text", text: "🗑️" });
    expect(meaningColor(iconMeaning("delete")!, S({ mode: "line" }))).toBeNull();
  });

  it("unknown emoji and plain text stay as they are in every mode", () => {
    expect(resolveIcon({ value: "🦄" }, S({ mode: "line" }))).toEqual({ kind: "text", text: "🦄" });
    expect(resolveIcon({ value: "LINE" }, S({ mode: "line" }))).toEqual({ kind: "text", text: "LINE" });
    expect(resolveIcon({ value: "" }, S({ mode: "line" }))).toBeNull();
  });

  it("an override or a custom icon replaces the meaning everywhere", () => {
    const s = S({ mode: "line", overrides: { delete: "i:trash-x" } });
    expect(resolveIcon({ value: "🗑" }, s)).toEqual({ kind: "line", d: erpIconDef("trash-x")!.d, color: null });
    const c = S({ mode: "line", custom: [{ id: "abc", label: "x", src: "erp-icons/u/1.png", tint: true }], overrides: { delete: "c:abc" } });
    expect(resolveIcon({ name: "delete" }, c)).toEqual({ kind: "img", src: "erp-icons/u/1.png", tint: true, color: null });
  });

  it("explicit i:/c:/img: values are drawn in every mode; missing ones draw nothing", () => {
    expect(resolveIcon({ value: "i:truck" }, S())).toMatchObject({ kind: "line" });
    expect(resolveIcon({ value: "i:not-a-real-icon" }, S())).toBeNull();
    expect(resolveIcon({ value: "c:gone" }, S())).toBeNull();
  });

  it("admin emoji mapping wins over the built-in table", () => {
    const s = S({ mode: "line", emojiMap: { "📦": "truck" } });
    expect(meaningOfEmoji("📦", s)?.key).toBe("truck");
    expect(emojisOfMeaning("package", s)).not.toContain("📦");
    expect(emojisOfMeaning("truck", s)).toContain("📦");
  });

  it("cleanIconSettings drops bad values before saving", () => {
    const s = cleanIconSettings({
      mode: "rainbow",
      overrides: { delete: "i:trash-x", save: "<script>", nope: "i:truck", edit: "c:missing" },
      emojiMap: { "🦄": "truck", "🐉": "not-a-meaning" },
      custom: [{ id: "ok1", label: "a", src: "erp-icons/a.png" }, { id: "BAD ID", src: "x.png" }, { id: "ok2", src: "javascript:alert(1)" }],
      colors: { delete: "#0284C7", save: "red", edit: "#12345", nope: "#000000", settings: "url(x)" },
    });
    expect(s.colors).toEqual({ delete: "#0284c7" });
    expect(s.mode).toBe("emoji");
    expect(s.overrides).toEqual({ delete: "i:trash-x" });
    expect(s.emojiMap).toEqual({ "🦄": "truck" });
    expect(s.custom).toEqual([{ id: "ok1", label: "a", src: "erp-icons/a.png", tint: true }]);
    expect(cleanIconSettings(null)).toEqual(DEFAULT_ICON_SETTINGS);
  });
});
