import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  SHARED_PARTS, PART_CATEGORIES, SAME_JOB_LABEL, SAME_JOB_VERDICT, buildPartRows, sourceId, type SourceUsage, type SharedPartsUsage,
} from "@/lib/shared-parts-registry";
// ตัวนับจริง (สคริปต์ .mjs ที่รันก่อน build)
import { scanSharedParts, readRegistrySources, sourceId as scanSourceId } from "../../scripts/shared-parts-scan.mjs";

const ROOT = path.resolve(__dirname, "../..");
// ไฟล์ · โฟลเดอร์ที่มี index · หรือโฟลเดอร์ชุดชิ้นส่วนที่ไม่มี index (เช่น components/payroll — ตัวนับนับ import ไฟล์ข้างในให้)
const isDir = (p: string) => { try { return statSync(path.join(ROOT, p)).isDirectory(); } catch { return false; } };
const exists = (p: string) => [".ts", ".tsx", "/index.ts", "/index.tsx"].some((e) => existsSync(path.join(ROOT, p + e))) || isDir(p);

describe("ทะเบียนของกลาง (lib/shared-parts-registry)", () => {
  it("key ไม่ซ้ำ", () => {
    const keys = SHARED_PARTS.map((p) => p.key);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("ที่อยู่ในโค้ดมีจริงทุกตัว (ย้าย/ลบไฟล์แล้วต้องแก้ทะเบียน)", () => {
    expect(SHARED_PARTS.filter((p) => !exists(p.source.path)).map((p) => `${p.key}: ${p.source.path}`)).toEqual([]);
  });

  it("ไม่มี 2 ตัวชี้ที่อยู่เดียวกัน", () => {
    const ids = SHARED_PARTS.map((p) => sourceId(p.source));
    expect(ids.filter((k, i) => ids.indexOf(k) !== i)).toEqual([]);
  });

  it("คู่มือที่อ้างมีจริงใน docs/", () => {
    expect(SHARED_PARTS.filter((p) => p.doc && !existsSync(path.join(ROOT, "docs", p.doc))).map((p) => `${p.key}: ${p.doc}`)).toEqual([]);
  });

  it("หมวด / กลุ่มงาน / ตัวแทน ชี้ไปของที่มีจริง", () => {
    const cats = new Set(PART_CATEGORIES.map((c) => c.key));
    const keys = new Set(SHARED_PARTS.map((p) => p.key));
    expect(SHARED_PARTS.filter((p) => !cats.has(p.category)).map((p) => p.key)).toEqual([]);
    expect(SHARED_PARTS.filter((p) => p.sameJob && !SAME_JOB_LABEL[p.sameJob]).map((p) => p.key)).toEqual([]);
    expect(SHARED_PARTS.filter((p) => p.replacedBy && !keys.has(p.replacedBy)).map((p) => p.key)).toEqual([]);
  });

  it("แต่ละกลุ่มงานมีตัวหลักได้ไม่เกิน 1 ตัว และกลุ่มต้องมีมากกว่า 1 ตัว", () => {
    const groups = new Map<string, { n: number; primary: number }>();
    for (const p of SHARED_PARTS) {
      if (!p.sameJob) continue;
      const g = groups.get(p.sameJob) ?? { n: 0, primary: 0 };
      g.n++; if (p.primary) g.primary++;
      groups.set(p.sameJob, g);
    }
    expect([...groups].filter(([, g]) => g.primary > 1 || g.n < 2).map(([k]) => k)).toEqual([]);
  });

  it("ทุกกลุ่มมีคำตัดสิน (ควรรวม / เช็กข้อมูลก่อน / ใช้คนละงาน) และกลุ่ม ควรรวม ต้องมีตัวหลัก 1 ตัว", () => {
    const labelKeys = Object.keys(SAME_JOB_LABEL).sort();
    expect(Object.keys(SAME_JOB_VERDICT).sort()).toEqual(labelKeys);
    const used = new Set(SHARED_PARTS.map((p) => p.sameJob).filter(Boolean));
    expect(labelKeys.filter((k) => !used.has(k))).toEqual([]);   // ไม่มีกลุ่มลอย ๆ ที่ไม่มีสมาชิก
    const mergeNoPrimary = Object.entries(SAME_JOB_VERDICT)
      .filter(([k, v]) => v.verdict === "merge" && SHARED_PARTS.filter((p) => p.sameJob === k && p.primary).length !== 1)
      .map(([k]) => k);
    expect(mergeNoPrimary).toEqual([]);
  });

  it("ตัวนับตอน build อ่านทะเบียนได้ครบทุกตัว (เขียน source บรรทัดเดียวตามรูปแบบ)", () => {
    const fromScan = readRegistrySources(ROOT).map(scanSourceId).sort();
    expect(fromScan).toEqual(SHARED_PARTS.map((p) => sourceId(p.source)).sort());
  });
});

describe("ป้ายสถานะ (buildPartRows)", () => {
  const u = (files: number, placeCount = files): SourceUsage => ({ files, demo: 0, placeCount, places: [] });
  // ใช้ชิ้นที่อยู่ถาวร + ชิ้นจำลอง (ไม่ผูกกับตัวเก่าที่จะถูกลบ)
  const parts = SHARED_PARTS.filter((p) => ["file-input", "file-multi-input", "line-items-grid", "sales-line-items", "state-views"].includes(p.key));
  const usage = {
    sources: Object.fromEntries(parts.map((p) => [sourceId(p.source), p.key === "state-views" ? u(0) : p.key === "file-multi-input" ? u(1) : u(10, 5)])),
  };
  const rows = Object.fromEntries(buildPartRows(parts, usage).map((r) => [r.key, r]));
  const fake = (key: string, extra: Record<string, unknown>) => ({ key, label: key, code: key, category: "pick" as const, source: { path: `components/${key}` }, what: "-", ...extra });

  it("ไม่มีใครใช้ / ใช้ที่เดียว / ควรย้ายไปตัวหลัก", () => {
    expect(rows["state-views"].flags).toContain("unused");
    expect(rows["file-multi-input"].flags).toEqual(expect.arrayContaining(["single", "dup"]));
    expect(rows["file-multi-input"].verdict).toBe("merge");
    expect(rows["file-input"].flags).not.toContain("dup");
    expect(rows["file-input"].siblings).toEqual(["file-multi-input"]);
  });

  it("ตัวเก่า = ควรเลิก (ไม่ซ้ำป้าย dup/check) · ตัวหลักไม่ติดป้าย", () => {
    const r = Object.fromEntries(buildPartRows([
      fake("zz-main", { sameJob: "zz-g", primary: true }),
      fake("zz-old", { sameJob: "zz-g", replacedBy: "zz-main" }),
    ], { sources: {} }).map((x) => [x.key, x]));
    expect(r["zz-old"].flags).toContain("deprecated");
    expect(r["zz-old"].flags).not.toContain("dup");
    expect(r["zz-old"].flags).not.toContain("check");
    expect(r["zz-main"].flags).not.toContain("dup");
  });

  it("กลุ่มที่ยังไม่ได้ตัดสิน / เช็กข้อมูลก่อน = ป้าย check", () => {
    const r = buildPartRows([fake("zz-a", { sameJob: "zz-undecided" }), fake("zz-b", { sameJob: "zz-undecided" })], { sources: {} });
    expect(r.every((x) => x.flags.includes("check"))).toBe(true);
  });

  it("กลุ่ม ใช้คนละงาน = ไม่ติดป้ายซ้ำ", () => {
    for (const k of ["line-items-grid", "sales-line-items"]) {
      expect(rows[k].verdict).toBe("keep");
      expect(rows[k].flags).not.toContain("dup");
      expect(rows[k].flags).not.toContain("check");
    }
  });
});

describe("ตัวนับ ใครใช้บ้าง (scripts/shared-parts-scan.mjs)", () => {
  const r = scanSharedParts(ROOT) as unknown as SharedPartsUsage;

  it("นับป๊อปอัปกลางได้หลายร้อยไฟล์ และมีรายชื่อหน้า", () => {
    expect(r.sources["components/modal"].files).toBeGreaterThan(100);
    expect(r.sources["components/modal"].places.some((p) => p.kind === "page")).toBe(true);
  });

  it("source แบบระบุชื่อ นับเฉพาะชื่อนั้น (SkuPicker ไม่ปน ProductPicker)", () => {
    expect(r.sources["components/pickers#SkuPicker"].files).toBeGreaterThan(r.sources["components/pickers#ProductPicker"].files);
  });

  it("ไม่นับไฟล์ข้างในตัวเอง", () => {
    expect(r.sources["components/pickers#SupplierPicker"].places.map((p) => p.label)).not.toContain("pickers");
  });

  it("แท็บยังไม่ลงทะเบียน ไม่มีตัวที่ลงทะเบียนแล้ว", () => {
    const reg = new Set(SHARED_PARTS.map((p) => p.source.path));
    expect(r.units.filter((x) => reg.has(x.path))).toEqual([]);
    expect(r.totals.components).toBeGreaterThan(100);
  });
});
