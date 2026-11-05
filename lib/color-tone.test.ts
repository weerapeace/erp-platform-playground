import { describe, expect, it } from "vitest";
import { applyToneAssignments, hexToneKey, suggestTone, toneOfColor, NOT_COLOR_KEY, type ColorTone } from "./color-tone";

const tone = (key: string, name: string, hex: string, keywords: string[], members: string[] = [], sortOrder = 0): ColorTone => ({
  id: `id-${key}`, key, name, hex, keywords, members, excludes: [], sortOrder,
});
const TONES = [
  tone("black", "ดำ", "#1A1A1A", ["ดำ", "black"], [], 1),
  tone("white", "ขาว / ครีม", "#F3EFE6", ["ขาว", "ครีม", "white", "cream"], [], 2),
  tone("red", "แดง", "#C62828", ["แดง", "red"], [], 5),
  tone("pink", "ชมพู", "#F2A7B8", ["ชมพู", "pink"], [], 6),
  tone("green", "เขียว", "#2E7D4F", ["เขียว", "green", "emerald"], [], 8),
  tone("blue", "ฟ้า / น้ำเงิน", "#2457A6", ["ฟ้า", "blue"], [], 9),
  tone("navy", "กรมท่า", "#1F2A44", ["กรมท่า", "navy"], [], 10),
  tone("pattern", "ลาย", "#B08850", ["ลาย"], ["รุ้ง"], 12),
];

describe("applyToneAssignments", () => {
  it("ย้ายเข้าโทนใหม่ = ออกจากโทนเดิม + เข้าโทนนี้", () => {
    const r = applyToneAssignments(TONES, [], [{ color: "รุ้ง", tone: "pink" }, { color: "Noir", tone: "black" }]);
    expect(toneOfColor("รุ้ง", r.tones)?.tone.key).toBe("pink");
    expect(toneOfColor("noir", r.tones)?.tone.key).toBe("black");
    expect([...r.changed].sort()).toEqual(["id-black", "id-pattern", "id-pink"]);
  });

  it("ไม่อยู่โทนไหน = ใส่ข้อยกเว้นให้โทนที่จับอัตโนมัติ", () => {
    const r = applyToneAssignments(TONES, [], [{ color: "แดงเลือดหมู", tone: "" }]);
    expect(toneOfColor("แดงเลือดหมู", r.tones)).toBeNull();
    expect(r.tones.find((t) => t.key === "red")!.excludes).toContain("แดงเลือดหมู");
  });

  it("ไม่ใช่สี = เก็บในรายชื่อไม่ใช่สี · เปลี่ยนใจย้ายเข้าโทน = เอาออกจากรายชื่อ", () => {
    const a = applyToneAssignments(TONES, [], [{ color: "10 รู", tone: NOT_COLOR_KEY }]);
    expect(a.notColor).toEqual(["10 รู"]);
    const b = applyToneAssignments(a.tones, a.notColor, [{ color: "10 รู", tone: "black" }]);
    expect(b.notColor).toEqual([]);
    expect(toneOfColor("10 รู", b.tones)?.tone.key).toBe("black");
  });

  it("ย้ายเข้าโทนที่เคยยกเว้นไว้ = ล้างข้อยกเว้น", () => {
    const a = applyToneAssignments(TONES, [], [{ color: "แดงไวน์", tone: "" }]);
    const b = applyToneAssignments(a.tones, [], [{ color: "แดงไวน์", tone: "red" }]);
    expect(b.tones.find((t) => t.key === "red")!.excludes).not.toContain("แดงไวน์");
    expect(toneOfColor("แดงไวน์", b.tones)?.how).toBe("member");
  });

  it("ไม่แก้โทนชุดเดิม (คืนชุดใหม่)", () => {
    applyToneAssignments(TONES, [], [{ color: "รุ้ง", tone: "pink" }]);
    expect(TONES.find((t) => t.key === "pattern")!.members).toEqual(["รุ้ง"]);
  });
});

describe("hexToneKey", () => {
  it.each([
    ["#111111", "black"], ["#F4F1E8", "white"], ["#F3E9D2", "white"], ["#8C8F94", "grey"],
    ["#6B4226", "brown"], ["#C8A27A", "brown"], ["#C62828", "red"], ["#F7B6C8", "pink"],
    ["#F2C230", "orange"], ["#0F7A55", "green"], ["#3B6FD8", "blue"], ["#1F2A44", "navy"],
    ["#7A5BA6", "purple"], ["#E8478B", "pink"],
  ])("%s → %s", (hex, key) => expect(hexToneKey(hex)).toBe(key));

  it("ค่าผิด = null", () => expect(hexToneKey("red")).toBeNull());
});

describe("suggestTone", () => {
  it("ชื่ออีกภาษาในพจนานุกรมมาก่อน (มรกต → Emerald → เขียว)", () => {
    expect(suggestTone("มรกต", TONES, { th: "มรกต", en: "Emerald", kind: "solid", colors: ["#123456"] })).toEqual({ key: "green", why: "ชื่อ Emerald" });
  });
  it("ไม่มีชื่อที่จับได้ → ดูจากจุดสี", () => {
    expect(suggestTone("Noir", TONES, { th: "นัวร์", en: "Noir", kind: "solid", colors: ["#151515"] })?.key).toBe("black");
  });
  it("จุดสีเป็นรูปลาย → โทนลาย", () => {
    expect(suggestTone("Cloud Sugar", TONES, { th: "Cloud Sugar", en: "Cloud Sugar", kind: "image", colors: [] })?.key).toBe("pattern");
  });
  it("ขนาด/จำนวนรู → ไม่ใช่สี", () => {
    expect(suggestTone("10 รู", TONES, null)?.key).toBe(NOT_COLOR_KEY);
  });
  it("ไม่มีข้อมูลพอ = ไม่แนะนำ", () => {
    expect(suggestTone("Pixie Soda Pop", TONES, null)).toBeNull();
  });
});
