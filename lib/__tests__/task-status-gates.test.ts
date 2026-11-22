import { describe, expect, it } from "vitest";
import { cleanStatusGates, defaultStatusGates, evaluateGate, gateOf, hasGate } from "../task-status-gates";

describe("task status gates", () => {
  it("ยังไม่ตั้ง = เตือนความพร้อมก่อนส่งตรวจ/เสร็จ (พฤติกรรมเดิม)", () => {
    const g = cleanStatusGates(null);
    expect(g).toEqual(defaultStatusGates());
    expect(gateOf(g, "need_review")).toEqual({ readiness: "warn", content: "off" });
    expect(hasGate(gateOf(g, "in_progress"))).toBe(false);
  });
  it("ค่าแปลก = off", () => {
    const g = cleanStatusGates({ done: { readiness: "block", content: "nope" }, x: 5 });
    expect(g).toEqual({ done: { readiness: "block", content: "off" } });
  });
  it("แยกห้าม/เตือน · ไม่ขาด = ผ่าน · เช็กไม่ได้ = ไม่นับ", () => {
    const r = evaluateGate({ readiness: "block", content: "warn" }, { readinessMissing: ["ราคา"], contentOpen: ["ปก — ร่าง"] });
    expect(r.block.map((x) => x.kind)).toEqual(["readiness"]);
    expect(r.warn.map((x) => x.kind)).toEqual(["content"]);
    expect(evaluateGate({ readiness: "block", content: "block" }, { readinessMissing: [], contentOpen: null })).toEqual({ block: [], warn: [] });
  });
});
