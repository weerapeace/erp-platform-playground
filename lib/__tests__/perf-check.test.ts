/**
 * เทสต์ของกลางตรวจความเร็ว (lib/perf-check.ts) — กติกาตัดสิน "ปกติ / ช้าลง / โตเกิน" + ค่าฐาน + คำสั่งฐานข้อมูล
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PERF_KEY_PAGES, PERF_LIMITS, median, extractChunkPaths, isMeasurablePath, judgeSample, nextBaseline, parseBaseline,
  formatSampleLine, judgeDbRows, queryLabel, measurePath, type PerfSample, type PerfBaseline, type DbDeltaRow,
} from "../perf-check";

const ROOT = join(__dirname, "..", "..");
const page = (o: Partial<PerfSample> = {}): PerfSample => ({ path: "/x", kind: "page", status: 200, ms: 200, jsKB: 400, jsRawKB: 1200, chunks: 30, ...o });
const base = (js: number[], local: number[] = [], cron: number[] = []): PerfBaseline => ({ path: "/x", js, ms: { local, cron }, at: "2026-11-07T00:00:00Z" });

describe("ตัวช่วย", () => {
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("ดึงรายการ chunk จาก HTML ไม่ซ้ำ (รวมที่ฝังในข้อมูลหน้า)", () => {
    const html = `<script src="/_next/static/chunks/webpack-abc.js"></script><script src="/_next/static/chunks/app/purchasing/page-1f.js" async></script>
      self.__next_f.push([1,"3:I[\\"/_next/static/chunks/8172-9a.js\\",\\"/_next/static/chunks/webpack-abc.js\\"]"])`;
    expect(extractChunkPaths(html).sort()).toEqual([
      "/_next/static/chunks/8172-9a.js", "/_next/static/chunks/app/purchasing/page-1f.js", "/_next/static/chunks/webpack-abc.js",
    ]);
  });
  it("หน้าที่มีช่องพารามิเตอร์วัดตรงไม่ได้", () => {
    expect(isMeasurablePath("/purchasing")).toBe(true);
    expect(isMeasurablePath("/master/skus/[id]")).toBe(false);
    expect(isMeasurablePath("/x?y=1")).toBe(false);
  });
  it("หน้าหลักที่ตัวตรวจรายวันวัด มีหน้าจริงในระบบ", () => {
    for (const p of PERF_KEY_PAGES) expect(existsSync(join(ROOT, "app", p, "page.tsx")), p).toBe(true);
  });
});

describe("ตัดสินผลวัด (judgeSample)", () => {
  const opt = { source: "local" as const };
  it("ไม่มีค่าฐาน = ใหม่", () => {
    expect(judgeSample(page(), null, opt).level).toBe("new");
  });
  it("ใกล้ค่าฐาน = ปกติ", () => {
    expect(judgeSample(page({ jsKB: 410, ms: 230 }), base([400], [200]), opt).level).toBe("ok");
  });
  it("โค้ดโตเกิน 10% = ⚠️", () => {
    const v = judgeSample(page({ jsKB: 450 }), base([400], [200]), opt);
    expect(v.level).toBe("warn");
    expect(v.reasons.join()).toContain("โค้ดโต");
  });
  it("โค้ดโตเกิน 50KB ถึงไม่เกิน 10% = ⚠️ (หน้าใหญ่)", () => {
    expect(judgeSample(page({ jsKB: 660 }), base([600]), opt).level).toBe("warn");
  });
  it("ข้ามเพดานขนาด (ค่าฐานยังไม่เกิน) = ⚠️ ถึงโตไม่ถึง 10%", () => {
    const c = PERF_LIMITS.jsCeilingKB;
    const v = judgeSample(page({ jsKB: c + 5 }), base([c - 5]), opt);
    expect(v.level).toBe("warn");
    expect(v.reasons.join()).toContain("ข้ามเพดาน");
  });
  it("หนักเกินเพดานอยู่แล้วตั้งแต่วัดครั้งแรก = จดเป็นค่าฐาน + บอกไว้ ไม่เตือนซ้ำทุกคืน", () => {
    const c = PERF_LIMITS.jsCeilingKB;
    const first = judgeSample(page({ jsKB: c + 40 }), null, opt);
    expect(first.level).toBe("new");
    expect(first.reasons.join()).toContain("เกินเพดาน");
    expect(judgeSample(page({ jsKB: c + 42 }), base([c + 40], [200]), opt).level).toBe("ok");
    expect(formatSampleLine(page({ jsKB: c + 40 }), first)).toContain("ยังไม่มีค่าฐาน · หนักเกินเพดาน");
  });
  it("ช้าลงเกิน 50% แต่ต่างแค่ไม่ถึง 150ms = ยังปกติ (กันตัวเลขเล็กแกว่ง)", () => {
    expect(judgeSample(page({ ms: 200 }), base([400], [120]), opt).level).toBe("ok");
  });
  it("ช้าลงเกิน 50% และเกิน 150ms = ⚠️", () => {
    expect(judgeSample(page({ ms: 450 }), base([400], [200]), opt).level).toBe("warn");
  });
  it("เกิน 1 วิ = 🐢 ถึงไม่มีค่าฐาน", () => {
    expect(judgeSample(page({ ms: 1200 }), null, opt).level).toBe("slow");
  });
  it("ระบบช้าทั้งก้อน = ไม่ตัดสินเวลา แต่ยังตัดสินขนาดโค้ด", () => {
    expect(judgeSample(page({ ms: 5000 }), base([400], [200]), { ...opt, systemSlow: true }).level).toBe("ok");
    expect(judgeSample(page({ ms: 5000, jsKB: 500 }), base([400], [200]), { ...opt, systemSlow: true }).level).toBe("warn");
  });
  it("เวลาฐานแยกตามที่วัด (เครื่องในไทย vs Vercel)", () => {
    const b = base([400], [], [50]);
    expect(judgeSample(page({ ms: 300 }), b, { source: "cron" }).level).toBe("warn");
    expect(judgeSample(page({ ms: 300 }), b, { source: "local" }).level).toBe("ok");
  });
  it("401/405/3xx/404 = ข้าม · 5xx = 🐢", () => {
    expect(judgeSample(page({ kind: "api", status: 401, ms: null }), null, opt).level).toBe("skip");
    expect(judgeSample(page({ kind: "api", status: 405, ms: null }), null, opt).level).toBe("skip");
    expect(judgeSample(page({ status: 307, ms: null, jsKB: null }), null, opt).level).toBe("skip");
    expect(judgeSample(page({ status: 404, ms: null, jsKB: null }), null, opt).level).toBe("skip");
    expect(judgeSample(page({ status: 500, ms: null, jsKB: null }), null, opt).level).toBe("slow");
  });
});

describe("ค่าฐานถัดไป (nextBaseline)", () => {
  const opt = { source: "local" as const, now: "2026-11-08T00:00:00Z" };
  it("ปกติ = จดเพิ่ม เก็บแค่ 7 ครั้งล่าสุด", () => {
    const prev = base([1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6, 7]);
    const s = page({ jsKB: 8, ms: 8 });
    const b = nextBaseline(prev, s, { level: "ok", reasons: [], jsBase: 4, msBase: 4 }, opt)!;
    expect(b.js).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(b.ms.local).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
  it("ช้าลง = ไม่จด (ค่าช้าไม่กลายเป็นค่าปกติ)", () => {
    expect(nextBaseline(base([400], [200]), page({ jsKB: 500 }), { level: "warn", reasons: [], jsBase: 400, msBase: 200 }, opt)).toBeNull();
  });
  it("สั่งยอมรับ = เริ่มนับใหม่จากค่านี้", () => {
    const b = nextBaseline(base([400, 410], [200]), page({ jsKB: 500, ms: 260 }), { level: "warn", reasons: [], jsBase: 405, msBase: 200 }, { ...opt, accept: true })!;
    expect(b.js).toEqual([500]);
    expect(b.ms.local).toEqual([260]);
  });
  it("ระบบช้าทั้งก้อน = จดแค่ขนาดโค้ด ไม่จดเวลา", () => {
    const b = nextBaseline(base([400], [200]), page({ jsKB: 401, ms: 3000 }), { level: "ok", reasons: [], jsBase: 400, msBase: 200 }, { ...opt, systemSlow: true })!;
    expect(b.js).toEqual([400, 401]);
    expect(b.ms.local).toEqual([200]);
  });
  it("อ่านค่าฐานที่เพี้ยนได้ไม่พัง", () => {
    expect(parseBaseline(null)).toBeNull();
    expect(parseBaseline({ js: ["5", "x"], ms: { local: [1] } })).toMatchObject({ js: [5], ms: { local: [1], cron: [] } });
  });
  it("บรรทัดสรุปอ่านง่าย", () => {
    const line = formatSampleLine(page({ jsKB: 450, ms: 210 }), { level: "warn", reasons: ["โค้ดโต"], jsBase: 400, msBase: 200 });
    expect(line).toContain("⚠️ /x");
    expect(line).toContain("เดิม 400KB");
  });
});

describe("คำสั่งฐานข้อมูล (judgeDbRows)", () => {
  const row = (o: Partial<DbDeltaRow>): DbDeltaRow => ({ queryid: "1", role: "service_role", calls: 100, mean_ms: 800, prev_mean_ms: 700, is_new: false, total_ms: 80000, query: 'SELECT "public"."skus_v2"."id" FROM "public"."skus_v2"', ...o });
  it("ช้ามานานแล้วไม่นับเป็นเรื่องใหม่ · ใหม่และช้า = เตือน · ช้าลงเกิน 50% = เตือน", () => {
    const flags = judgeDbRows([row({}), row({ queryid: "2", is_new: true, prev_mean_ms: null }), row({ queryid: "3", prev_mean_ms: 400 })]);
    expect(flags.map((f) => f.queryid)).toEqual(["2", "3"]);
  });
  it("เรียกน้อยหรือเร็วพอ = ไม่เตือน", () => {
    expect(judgeDbRows([row({ is_new: true, calls: 5 }), row({ is_new: true, mean_ms: 100 })])).toEqual([]);
  });
  it("บอกชื่อตาราง/ฟังก์ชันจากคำสั่ง", () => {
    expect(queryLabel('WITH pgrst_source AS ( SELECT "public"."skus_v2"."id" FROM "public"."skus_v2" WHERE 1)')).toBe("ตาราง skus_v2");
    expect(queryLabel('SELECT "public"."erp_sku_family_counts"() pgrst_call')).toBe("ฟังก์ชัน erp_sku_family_counts()");
  });
});

describe("ตัววัด (measurePath) กับเว็บจำลอง", () => {
  it("วัดเวลา + รวมขนาด chunk ไม่ดึงไฟล์ซ้ำ", async () => {
    const hits: string[] = [];
    const js = new TextEncoder().encode("x".repeat(4096));
    const fake = (async (url: string) => {
      hits.push(url);
      if (url.endsWith("/p")) return new Response(`<script src="/_next/static/chunks/a.js"></script><script src="/_next/static/chunks/b.js"></script>`, { status: 200 });
      return new Response(js, { status: 200 });
    }) as unknown as typeof fetch;
    const s = await measurePath("https://t", "/p", "page", { runs: 3, fetchImpl: fake });
    expect(s.status).toBe(200);
    expect(s.chunks).toBe(2);
    expect(s.jsRawKB).toBe(8);
    expect(s.ms).not.toBeNull();
    expect(hits.filter((h) => h.endsWith(".js"))).toHaveLength(2);
    expect(hits.filter((h) => h.endsWith("/p"))).toHaveLength(4);   // อุ่น 1 + วัด 3
  });
  it("ต้องล็อกอิน = ไม่วัดต่อ", async () => {
    const fake = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    const s = await measurePath("https://t", "/api/x", "api", { fetchImpl: fake });
    expect(s).toMatchObject({ status: 401, ms: null });
  });
});
