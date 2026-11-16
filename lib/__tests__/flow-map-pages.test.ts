import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DANGER_TEXT, FLOW_API_HUMAN, FLOW_PAGE_INFO, apiHuman, apiKeyOf, normalizeApiPath, pageKey, partForText } from "../flow-map-pages";
import { FLOW_NODES } from "../flow-map";

/** path ทะเบียน (/api/x/[id]/y) → มีไฟล์ route.ts จริงไหม ([id] = โฟลเดอร์ [อะไรก็ได้]) */
function routeExists(path: string): boolean {
  let dirs = [join(process.cwd(), "app")];
  for (const seg of path.split("/").filter(Boolean)) {
    const next: string[] = [];
    for (const d of dirs) {
      const dyn = () => { if (existsSync(d)) for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory() && /^\[.+\]$/.test(e.name)) next.push(join(d, e.name)); };
      if (seg === "[id]") dyn();
      else if (existsSync(join(d, seg))) next.push(join(d, seg));
      else dyn();   // ชื่อจริงไม่มีโฟลเดอร์ → route แบบตัวแปร (เช่น /api/master-v2/[entity] รับ skus, partners ...)
    }
    dirs = next;
  }
  return dirs.some((d) => existsSync(join(d, "route.ts")));
}

describe("flow-map-pages — ทะเบียนหน้าจริงของกล่องในแผนผัง", () => {
  it("ทุกหน้าที่กล่องชี้ไป (href) มีคำอธิบาย", () => {
    const missing = [...new Set(Object.values(FLOW_NODES).map((n) => n.href).filter(Boolean).map((h) => pageKey(h!)))].filter((k) => !FLOW_PAGE_INFO[k]);
    expect(missing).toEqual([]);
  });

  it("ทุกหน้ามีสรุป + อย่างน้อย 2 ส่วน · ทุกส่วนมีชื่อและบอกว่าทำอะไร", () => {
    for (const [k, p] of Object.entries(FLOW_PAGE_INFO)) {
      expect(p.summary.trim(), k).not.toBe("");
      expect(p.parts.length, k).toBeGreaterThanOrEqual(2);
      for (const part of p.parts) { expect(part.label.trim(), k).not.toBe(""); expect(part.does.trim(), k).not.toBe(""); }
    }
  });

  it("API ในทะเบียนมีไฟล์จริงทุกตัว (กันชี้ของที่ไม่มี)", () => {
    const bad = Object.keys(FLOW_API_HUMAN).filter((k) => !k.startsWith("/api/") || !routeExists(k));
    expect(bad).toEqual([]);
  });

  it("ส่วนของหน้าอ้าง API ที่มีในทะเบียนเท่านั้น", () => {
    const bad: string[] = [];
    for (const [k, p] of Object.entries(FLOW_PAGE_INFO)) for (const part of p.parts) for (const a of part.apis ?? []) if (!FLOW_API_HUMAN[a]) bad.push(`${k}: ${a}`);
    expect(bad).toEqual([]);
  });

  it("ทุก API มีคำอธิบายอย่างน้อย 1 แบบ (อ่าน/บันทึก)", () => {
    for (const [k, v] of Object.entries(FLOW_API_HUMAN)) expect(!!(v.read || v.write), k).toBe(true);
  });
});

describe("flow-map-pages — แปลงที่อยู่ที่หน้าเรียกจริง", () => {
  it("ตัดโดเมน/query · รหัสเอกสาร/uuid/ตัวเลข = [id]", () => {
    expect(normalizeApiPath("https://x.app/api/quotations?status=open")).toBe("/api/quotations");
    expect(normalizeApiPath("/api/quotations/3f2a1b4c-1111-2222-3333-444455556666/lines")).toBe("/api/quotations/[id]/lines");
    expect(normalizeApiPath("/api/mo/work-orders/123")).toBe("/api/mo/work-orders/[id]");
    expect(normalizeApiPath("/api/design-sheets/DS-0412")).toBe("/api/design-sheets/[id]");
    expect(normalizeApiPath("/api/flow-map/health")).toBe("/api/flow-map/health");
  });

  it("หา key แบบตัดท้ายทีละท่อน + อ่าน/บันทึกได้คำอธิบายถูกฝั่ง", () => {
    const k = Object.keys(FLOW_API_HUMAN)[0];
    expect(apiKeyOf(`${k}?x=1`)).toBe(k);
    expect(apiKeyOf(`${k}/zzz-unknown-tail`)).toBe(k);
    expect(apiKeyOf("/api/__nope__")).toBeNull();
    const h = apiHuman("/api/__nope__", "POST");
    expect(h).toMatchObject({ th: null, write: true, key: "/api/__nope__" });
  });

  it("ชี้ปุ่ม → ส่วนในทะเบียนที่ข้อความตรง (ยาวสุดชนะ)", () => {
    const info = { summary: "s", parts: [{ label: "a", does: "สร้าง", match: ["สร้าง"] }, { label: "b", does: "สร้างใบงาน", match: ["สร้างใบงาน"] }] };
    expect(partForText(info, "+ สร้าง ใบงาน")?.label).toBe("b");
    expect(partForText(info, "ค้นหา")).toBeNull();
    expect(partForText(undefined, "x")).toBeNull();
  });

  it("ปุ่มที่ต้องล็อกในหน้าตัวอย่าง", () => {
    for (const s of ["บันทึก", "ลบรายการ", "ส่งเสนอราคา", "Save", "อนุมัติ"]) expect(DANGER_TEXT.test(s), s).toBe(true);
    for (const s of ["ค้นหา", "ตัวกรอง", "ดูทั้งหมด"]) expect(DANGER_TEXT.test(s), s).toBe(false);
  });
});
