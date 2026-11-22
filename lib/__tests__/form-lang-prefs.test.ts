import { describe, expect, it } from "vitest";
import { effectiveLangMode, parseLangList, resolveShownLangs, teamLangsFor, toggleLang, withTeamLangs } from "@/lib/form-lang-prefs";

describe("form-lang-prefs", () => {
  it("parseLangList: ผิดรูป = null · ตัดไทย/ค่าแปลก/ซ้ำ", () => {
    expect(parseLangList(null)).toBeNull();
    expect(parseLangList("en")).toBeNull();
    expect(parseLangList(["th", "en", "en", "JA", 3, "ja"])).toEqual(["en", "ja"]);
    expect(parseLangList([])).toEqual([]);
  });

  it("resolveShownLangs: ของฉัน > แอดมิน > ทุกภาษา", () => {
    const av = ["th", "en", "ja"];
    expect(resolveShownLangs(av, null, null)).toEqual(["en", "ja"]);
    expect(resolveShownLangs(av, null, ["en"])).toEqual(["en"]);
    expect(resolveShownLangs(av, ["ja"], ["en"])).toEqual(["ja"]);
    expect(resolveShownLangs(av, [], ["en"])).toEqual([]);          // ปิดหมด = ไทยอย่างเดียว
    expect(resolveShownLangs(["th", "en"], ["ja", "en"], null)).toEqual(["en"]);   // ภาษาที่ฟอร์มไม่มี ตัดทิ้ง
  });

  it("effectiveLangMode: ภาษาในโหมดถูกซ่อน = th", () => {
    expect(effectiveLangMode("th|ja", ["en"])).toBe("th");
    expect(effectiveLangMode("th|en", ["en"])).toBe("th|en");
    expect(effectiveLangMode("ja", [])).toBe("th");
    expect(effectiveLangMode("th", [])).toBe("th");
  });

  it("toggleLang คงลำดับ", () => {
    expect(toggleLang(["th", "en", "ja"], ["ja"], "en")).toEqual(["en", "ja"]);
    expect(toggleLang(["th", "en", "ja"], ["en", "ja"], "en")).toEqual(["ja"]);
  });

  it("team value: อ่าน/เขียนเฉพาะฟอร์มนั้น", () => {
    const v = { parent_skus: ["en"], skus: ["en", "ja"], bad: "x" };
    expect(teamLangsFor(v, "parent_skus")).toEqual(["en"]);
    expect(teamLangsFor(v, "other")).toBeNull();
    expect(withTeamLangs(v, "parent_skus", ["ja"])).toEqual({ parent_skus: ["ja"], skus: ["en", "ja"] });
    expect(withTeamLangs(v, "skus", null)).toEqual({ parent_skus: ["en"] });
  });
});
