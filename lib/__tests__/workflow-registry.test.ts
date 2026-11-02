import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { WORKFLOWS, findWorkflows } from "@/lib/workflow-registry";
// ทดสอบผลจริงของตัวเช็ก "ใครใช้บ้าง" (สคริปต์ .mjs)
import { loadProject, analyzeFiles } from "../../scripts/where-used.mjs";

const ROOT = path.resolve(__dirname, "../..");

describe("ทะเบียน workflow กลาง", () => {
  it("key ไม่ซ้ำ", () => {
    const keys = WORKFLOWS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ไฟล์กติกา + ประตูเปลี่ยนสถานะที่อ้าง มีอยู่จริงทุกไฟล์ (ย้าย/ลบไฟล์แล้วต้องแก้ทะเบียน)", () => {
    const missing = WORKFLOWS.flatMap((w) => [...w.ruleFiles, ...w.gates].filter((f) => !existsSync(path.join(ROOT, f))).map((f) => `${w.key}: ${f}`));
    expect(missing).toEqual([]);
  });

  it("feeds ชี้ไป workflow ที่มีอยู่จริง", () => {
    const keys = new Set(WORKFLOWS.map((w) => w.key));
    expect(WORKFLOWS.flatMap((w) => w.feeds ?? []).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("หาได้ทั้งจาก key และชื่อไฟล์กติกา", () => {
    expect(findWorkflows("mo-production").map((w) => w.key)).toEqual(["mo-production"]);
    expect(findWorkflows("mo-dispatch").map((w) => w.key)).toEqual(["mo-production"]);
    expect(findWorkflows("lib/po-total.ts").map((w) => w.key)).toEqual(["purchasing"]);
    expect(findWorkflows("receive-line-modal").map((w) => w.key)).toEqual(["purchasing"]);
    expect(findWorkflows("ไม่มีจริง")).toEqual([]);
  });
});

describe("ตัวเช็ก ใครใช้บ้าง (scripts/where-used.mjs)", () => {
  const proj = loadProject(ROOT);

  it("กติกาจ่ายงาน (lib/mo-dispatch) → เจอ API หน้าขอซื้อ และหน้าขอซื้อที่เรียก API นั้น", () => {
    const r = analyzeFiles(proj, ["lib/mo-dispatch.ts"]);
    const apis = r.apis.map((a: { url: string }) => a.url);
    expect(apis).toContain("/api/mo/purchase-needs");
    expect(apis).toContain("/api/mo/material-status");
    expect(r.pages.map((p: { url: string }) => p.url)).toContain("/purchasing");
  });

  it("ของกลางที่ใช้ทั่วระบบ ไม่ถูกไล่ทะลุจนนับทุกหน้า", () => {
    const r = analyzeFiles(proj, ["lib/mo-status.ts"]);
    expect(r.pages.length).toBeLessThan(40);
  });
});
