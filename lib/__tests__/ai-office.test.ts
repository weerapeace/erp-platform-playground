/**
 * เทสต์ทะเบียน "ออฟฟิศทีม AI" (lib/ai-office.ts)
 * - ทุก cron ใน vercel.json ต้องมีผู้ช่วยในทะเบียน (เพิ่ม cron ใหม่ = ต้องลงทะเบียนด้วย)
 * - ไฟล์โค้ด/หน้าที่อ้างต้องมีจริง · id ไม่ซ้ำ · กติกาตัดสินสถานะถูกต้อง
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OFFICE_WORKERS, OFFICE_ZONES, AI_AUDIT_ACTIONS, AI_ACTION_LABEL, WORKER_BY_ID,
  cronWorkerLive, aiUsageLive, countStatuses, workersNeedingHelp, type WorkerLive,
} from "../ai-office";

const ROOT = join(__dirname, "..", "..");
const NOW = Date.parse("2026-11-04T05:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("ทะเบียนผู้ช่วย", () => {
  it("id ไม่ซ้ำ และทุกตัวอยู่ในห้องที่มีจริง", () => {
    const ids = OFFICE_WORKERS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    const zones = new Set(OFFICE_ZONES.map((z) => z.id));
    for (const w of OFFICE_WORKERS) expect(zones.has(w.zone), w.id).toBe(true);
  });

  it("ทุกห้องมีผู้ช่วยอย่างน้อย 1 ตำแหน่ง", () => {
    for (const z of OFFICE_ZONES) expect(OFFICE_WORKERS.some((w) => w.zone === z.id), z.id).toBe(true);
  });

  it("ทุก cron ใน vercel.json มีเจ้าของในทะเบียน และทุก cron ในทะเบียนมีใน vercel.json", () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as { crons?: { path: string }[] };
    const inVercel = new Set((cfg.crons ?? []).map((c) => c.path.split("?")[0]));
    const inRegistry = new Set(OFFICE_WORKERS.filter((w) => w.cron).map((w) => w.cron!));
    for (const p of inVercel) expect(inRegistry.has(p), `cron ${p} ยังไม่ได้ลงทะเบียนใน lib/ai-office.ts`).toBe(true);
    for (const p of inRegistry) expect(inVercel.has(p), `ทะเบียนอ้าง ${p} แต่ไม่มีใน vercel.json`).toBe(true);
  });

  it("ไฟล์โค้ดและหน้าที่อ้างมีอยู่จริง", () => {
    for (const w of OFFICE_WORKERS) {
      for (const f of w.files) expect(existsSync(join(ROOT, f)), `${w.id}: ${f}`).toBe(true);
      if (w.href) expect(existsSync(join(ROOT, "app", w.href, "page.tsx")), `${w.id}: ${w.href}`).toBe(true);
    }
  });

  it("ผู้ช่วยประเภท AI ทุกตัวมี action ใน audit ไว้นับการใช้ และทุก action มีป้ายภาษาคน", () => {
    for (const w of OFFICE_WORKERS.filter((x) => x.kind === "ai" && x.id !== "design-line-ai")) {
      expect(AI_AUDIT_ACTIONS[w.id]?.length, w.id).toBeGreaterThan(0);
    }
    for (const id of Object.keys(AI_AUDIT_ACTIONS)) expect(WORKER_BY_ID[id], id).toBeTruthy();
    for (const a of Object.values(AI_AUDIT_ACTIONS).flat()) expect(AI_ACTION_LABEL[a], a).toBeTruthy();
  });
});

describe("กติกาสถานะงานตั้งเวลา (cronWorkerLive)", () => {
  const w = { everyHours: 24 };
  it("ยังไม่ตั้ง CRON_SECRET = ติดปัญหา พร้อมวิธีแก้ ถึงจะมีบันทึกเก่าก็ตาม", () => {
    const r = cronWorkerLive(w, { cronSecret: false, run: { at: hoursAgo(1), ok: true } }, NOW);
    expect(r.status).toBe("error");
    expect(r.fix).toContain("CRON_SECRET");
  });
  it("ตั้งแล้วแต่ยังไม่มีบันทึก = ยังไม่มีบันทึก", () => {
    expect(cronWorkerLive(w, { cronSecret: true, run: null }, NOW).status).toBe("unknown");
  });
  it("รอบล่าสุดสำเร็จและไม่เก่า = ปกติ", () => {
    const r = cronWorkerLive(w, { cronSecret: true, run: { at: hoursAgo(3), ok: true, summary: "เตือน 2 ใบ" } }, NOW);
    expect(r.status).toBe("ok");
    expect(r.headline).toBe("เตือน 2 ใบ");
  });
  it("รอบล่าสุดล้ม = ติดปัญหา", () => {
    expect(cronWorkerLive(w, { cronSecret: true, run: { at: hoursAgo(3), ok: false, error: "boom" } }, NOW).status).toBe("error");
  });
  it("เงียบเกิน 2 เท่าของรอบ = ต้องดู", () => {
    expect(cronWorkerLive(w, { cronSecret: true, run: { at: hoursAgo(60), ok: true } }, NOW).status).toBe("warn");
  });
  it("จบแต่ขาดการตั้งค่า (warn) = ต้องดู", () => {
    expect(cronWorkerLive(w, { cronSecret: true, run: { at: hoursAgo(2), ok: true, warn: true, summary: "ยังไม่กรอกยอดเงิน" } }, NOW).status).toBe("warn");
  });
});

describe("กติกาสถานะปุ่ม AI (aiUsageLive)", () => {
  it("ใช้ใน 7 วัน = ปกติ", () => expect(aiUsageLive({ n7: 2, n30: 5, lastAt: hoursAgo(5) }, NOW).status).toBe("ok"));
  it("ใช้แค่ใน 30 วัน = ว่าง (ไม่ใช่เสีย)", () => expect(aiUsageLive({ n7: 0, n30: 1, lastAt: hoursAgo(24 * 10) }, NOW).status).toBe("idle"));
  it("ไม่มีใครใช้ = ว่าง", () => expect(aiUsageLive({ n7: 0, n30: 0, lastAt: null }, NOW).headline).toContain("ยังไม่มีใครใช้"));
});

describe("สรุปภาพรวม", () => {
  it("นับครบทุกตำแหน่ง ตัวที่ไม่มีข้อมูลนับเป็นยังไม่มีบันทึก", () => {
    const c = countStatuses({});
    expect(c.unknown).toBe(OFFICE_WORKERS.length);
  });
  it("ต้องให้คนช่วย = ติดปัญหามาก่อน ต้องดู", () => {
    const mk = (status: WorkerLive["status"]): WorkerLive => ({ status, headline: "", lastAt: null, stats: [] });
    const live: Record<string, WorkerLive> = { "stock-sync": mk("warn"), scheduler: mk("error"), "ai-caption": mk("ok") };
    expect(workersNeedingHelp(live).map((w) => w.id)).toEqual(["scheduler", "stock-sync"]);
  });
  it("งานตั้งเวลาที่ติดแค่รหัสลับ รวมเป็นแถวเดียวที่ผู้ปลุกงาน แต่ตัวที่มีปัญหาอื่นยังแยกแถว", () => {
    const blocked = cronWorkerLive({ everyHours: 24 }, { cronSecret: false, run: null }, NOW);
    const live: Record<string, WorkerLive> = {
      scheduler: { status: "error", headline: "", lastAt: null, stats: [], fix: blocked.fix },
      "wo-due-soon": blocked, "look-hash": blocked,
      "lazada-token": { ...blocked, fix: `ร้านหมดอายุ · ${blocked.fix}` },
    };
    expect(workersNeedingHelp(live).map((w) => w.id)).toEqual(["scheduler", "lazada-token"]);
  });
});
