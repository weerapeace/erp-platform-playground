/**
 * กันลืม — ทุกจุดที่ใช้ AI / API ที่เสียเงิน ต้องลงทะเบียนใน lib/paid-services และเรียกผ่านด่านกลาง lib/paid-services-server
 * (เจ้าของขอ 2026-11-06: "เวลาเพิ่มต้องมาเพิ่มตรงนี้ด้วย เป็นของกลาง")
 * เทสต์นี้ไม่ผ่าน = มีโค้ดเรียกบริการเสียเงินตรง ๆ / ใช้ key ที่ไม่ลงทะเบียน / ทะเบียนชี้ไฟล์ผิด → แก้ตามข้อความที่ขึ้น
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { budgetState, cleanBudget, DEFAULT_BUDGET, estimateCostThb, monthKeyBangkok, PAID_SERVICES, paidService, serviceBudgetState, usageBuckets, usageRangeStartIso, userBudgetState, userCap, effectiveChoice } from "@/lib/paid-services";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["app", "lib", "components"];
const SKIP = /[\\/](node_modules|__tests__|\.next)[\\/]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p + path.sep)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const FILES = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).map((p) => ({ file: rel(p), src: fs.readFileSync(p, "utf8") }));
/** ตัดคอมเมนต์ออกก่อนตรวจ (คำอธิบายในคอมเมนต์ไม่นับ) */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** ใครเรียก "ของจริง" ได้บ้าง — นอกจากไฟล์เหล่านี้ต้องผ่านด่านกลาง */
const RAW_RULES: { what: string; re: RegExp; allowed: string[] }[] = [
  { what: "ยิง OpenAI ตรง (api.openai.com)", re: /api\.openai\.com/, allowed: ["lib/ai-caption.ts"] },
  { what: "เรียก openAiChatRaw ตรง — ใช้ aiChat(\"<key>\", …)", re: /\bopenAiChatRaw\(/, allowed: ["lib/ai-caption.ts", "lib/paid-services-server.ts"] },
  { what: "เรียก openAiWebSearchRaw ตรง — ใช้ aiWebSearch(\"<key>\", …)", re: /\bopenAiWebSearchRaw\(/, allowed: ["lib/ai-caption.ts", "lib/paid-services-server.ts"] },
  { what: "เรียก chatJson (ของเดิม) — ใช้ aiChat(\"<key>\", …)", re: /\bchatJson\(/, allowed: [] },
  { what: "เรียก Cloudflare AI ตรง (getAi) — ใช้ getAiFor(\"<key>\")", re: /\bgetAi\(\)/, allowed: ["lib/ai.ts", "lib/paid-services-server.ts"] },
  { what: "ยิง EasySlip ตรง", re: /api\.easyslip\.com/, allowed: ["lib/website-payments-server.ts"] },
  { what: "ส่ง LINE push ตรง (api.line.me/v2/bot/message/push|multicast|broadcast)", re: /api\.line\.me\/v2\/bot\/message\/(push|multicast|broadcast|narrowcast)/, allowed: ["lib/line-send.ts"] },
  { what: "ส่งอีเมลผ่าน Resend ตรง", re: /api\.resend\.com/, allowed: ["lib/email.ts"] },
];

describe("ศูนย์ AI / API ที่เสียเงิน — กันลืมลงทะเบียน", () => {
  it("ทะเบียน: key ไม่ซ้ำ · ทุกแถวมีชื่อ/ที่ใช้/ไฟล์", () => {
    const keys = PAID_SERVICES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of PAID_SERVICES) {
      expect(s.th && s.usedAt && s.offBehavior && s.costHint, s.key).toBeTruthy();
      expect(s.files.length, `${s.key} ต้องระบุไฟล์ที่เรียกจริง`).toBeGreaterThan(0);
    }
  });

  it("ทะเบียนชี้ไฟล์ถูก — ไฟล์มีอยู่ และในไฟล์อ้าง key นั้นจริง (ยกเว้นแบบปิดไม่ได้)", () => {
    const byFile = new Map(FILES.map((f) => [f.file, f.src]));
    for (const s of PAID_SERVICES) {
      for (const f of s.files) {
        const src = byFile.get(f);
        expect(src, `${s.key}: ไม่พบไฟล์ ${f} (ย้ายไฟล์แล้วแก้ทะเบียนด้วย)`).toBeDefined();
        if (s.kind !== "locked") expect(src!.includes(`"${s.key}"`), `${s.key}: ไฟล์ ${f} ไม่ได้เรียกด้วย key นี้`).toBe(true);
      }
    }
  });

  it("ไม่มีโค้ดเรียกบริการเสียเงินตรง ๆ ข้ามด่านกลาง", () => {
    const bad: string[] = [];
    for (const r of RAW_RULES) for (const f of FILES) if (!r.allowed.includes(f.file) && r.re.test(code(f.src))) bad.push(`${f.file} — ${r.what}`);
    expect(bad, "เรียกผ่านด่านกลาง lib/paid-services-server + ลงทะเบียนใน lib/paid-services").toEqual([]);
  });

  it("ทุก key ที่โค้ดใช้กับด่านกลาง ต้องอยู่ในทะเบียน", () => {
    const bad: string[] = [];
    const re = /\b(aiChat|aiWebSearch|aiAvailable|getAiFor|serviceOn|logServiceUse|serviceOffMessage)\(\s*"([^"]+)"/g;
    for (const f of FILES) for (const m of code(f.src).matchAll(re)) if (!paidService(m[2])) bad.push(`${f.file}: ${m[1]}("${m[2]}")`);
    expect(bad, "เพิ่ม key ใน PAID_SERVICES (lib/paid-services.ts)").toEqual([]);
  });

  it("รายที่ (places): key ไม่ซ้ำ · ไฟล์ของแต่ละที่มีอยู่และส่ง place นั้นจริง", () => {
    const byFile = new Map(FILES.map((f) => [f.file, f.src]));
    for (const s of PAID_SERVICES) {
      const ks = (s.places ?? []).map((p) => p.key);
      expect(new Set(ks).size, `${s.key}: place ซ้ำ`).toBe(ks.length);
      for (const p of s.places ?? []) for (const f of p.files) {
        const src = byFile.get(f);
        expect(src, `${s.key}@${p.key}: ไม่พบไฟล์ ${f}`).toBeDefined();
        expect(new RegExp(`place:\\s*"${p.key}"`).test(src!), `${s.key}@${p.key}: ไฟล์ ${f} ไม่ได้ส่ง place: "${p.key}"`).toBe(true);
      }
    }
  });

  it("ทุกจุดที่เรียกแปลภาษา (translateContent / /api/ai/translate) ต้องบอก place ที่ลงทะเบียน", () => {
    const valid = new Set((paidService("ai.translate")?.places ?? []).map((p) => p.key));
    const bad: string[] = [];
    for (const f of FILES) {
      if (f.file === "lib/content-translate.ts" || f.file.startsWith("app/api/ai/translate/") || f.file === "lib/paid-services.ts") continue;
      const src = code(f.src);
      const calls = (src.match(/\btranslate(Content|NoteHtml)\(|"\/api\/ai\/translate"/g) ?? []).length;
      if (!calls) continue;
      const places = [...src.matchAll(/place:\s*"([a-z_]+)"/g)].map((m) => m[1]);
      if (places.length < calls) bad.push(`${f.file}: เรียกแปล ${calls} ครั้ง แต่ระบุ place ${places.length} ครั้ง`);
      for (const p of places) if (!valid.has(p)) bad.push(`${f.file}: place "${p}" ไม่อยู่ในทะเบียน ai.translate`);
    }
    expect(bad, "ส่ง { place: \"…\" } และเพิ่มที่ใน PAID_SERVICES ai.translate.places").toEqual([]);
  });

  it("ประมาณค่าใช้จ่ายตามโมเดล", () => {
    expect(estimateCostThb("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(5.4);
    expect(estimateCostThb("gpt-4.1", 0, 1_000_000)).toBeCloseTo(288);
    expect(estimateCostThb("unknown-model", 1_000_000, 0)).toBeCloseTo(5.4);
  });
});

describe("งบต่อเดือน", () => {
  it("ค่าแปลก = ค่าเริ่ม · ไม่ใส่งบ = ไม่จำกัด", () => {
    expect(cleanBudget(null)).toEqual(DEFAULT_BUDGET);
    expect(cleanBudget({ monthly_thb: "500", warn_pct: 90, over_action: "warn" })).toEqual({ monthly_thb: 500, warn_pct: 90, over_action: "warn", per_service: {}, per_user_default: null, per_user: {} });
    expect(cleanBudget({ monthly_thb: -5, warn_pct: 3, over_action: "x" })).toEqual({ monthly_thb: null, warn_pct: 80, over_action: "stop", per_service: {}, per_user_default: null, per_user: {} });
  });
  it("สถานะงบ: ไม่ตั้ง / ปกติ / ใกล้เต็ม / เกิน", () => {
    const b = { ...DEFAULT_BUDGET, monthly_thb: 100, warn_pct: 80, over_action: "stop" as const };
    expect(budgetState(50, DEFAULT_BUDGET)).toBe("none");
    expect(budgetState(79.9, b)).toBe("ok");
    expect(budgetState(80, b)).toBe("warn");
    expect(budgetState(100, b)).toBe("over");
  });
  it("เดือนตามเวลาไทย (ข้ามเดือนตอนเที่ยงคืนไทย ไม่ใช่ UTC)", () => {
    expect(monthKeyBangkok(new Date("2026-11-30T17:30:00Z"))).toBe("2026-12");
    expect(monthKeyBangkok(new Date("2026-11-30T16:30:00Z"))).toBe("2026-11");
  });
});

describe("งบรายฟีเจอร์ + กราฟย้อนหลัง", () => {
  it("งบรายฟีเจอร์รับเฉพาะ GPT ในทะเบียน · ค่าบวก", () => {
    expect(cleanBudget({ per_service: { "ai.caption": "100", "line.push": 50, "ai.nope": 10, "ai.translate": -1 } }).per_service).toEqual({ "ai.caption": 100 });
  });
  it("สถานะงบรายฟีเจอร์ใช้ % แจ้งเตือนเดียวกับงบรวม", () => {
    const b = cleanBudget({ warn_pct: 80, per_service: { "ai.caption": 100 } });
    expect(serviceBudgetState(50, b, "ai.caption")).toBe("ok");
    expect(serviceBudgetState(85, b, "ai.caption")).toBe("warn");
    expect(serviceBudgetState(100, b, "ai.caption")).toBe("over");
    expect(serviceBudgetState(999, b, "ai.translate")).toBe("none");
  });
  it("จัดกลุ่มรายวัน/รายเดือนตามเวลาไทย · ครบทุกช่วง", () => {
    const now = new Date("2026-11-06T05:00:00Z");
    const rows = [
      { at: "2026-11-05T18:30:00Z", est_cost_thb: 1.5 },          // = 6 พ.ย. เวลาไทย
      { at: "2026-11-05T10:00:00Z", est_cost_thb: 0.5, ok: false }, // = 5 พ.ย.
      { at: "2026-10-31T17:30:00Z", est_cost_thb: 2 },            // = 1 พ.ย. เวลาไทย
    ];
    const d = usageBuckets(rows, "day", 7, now);
    expect(d).toHaveLength(7);
    expect(d[6]).toMatchObject({ key: "2026-11-06", label: "6 พ.ย.", cost_thb: 1.5, calls: 1 });
    expect(d[5]).toMatchObject({ key: "2026-11-05", calls: 1, failed: 1 });
    const m = usageBuckets(rows, "month", 3, now);
    expect(m.map((x) => x.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(m[2]).toMatchObject({ cost_thb: 4, calls: 3, label: "พ.ย. 69" });
    expect(usageRangeStartIso("day", 7, now)).toBe("2026-10-30T17:00:00.000Z");
  });
});

describe("งบรายคน", () => {
  const A = "aaaaaaaa-1111-2222-3333-444444444444", B = "bbbbbbbb-1111-2222-3333-444444444444", C = "cccccccc-1111-2222-3333-444444444444";
  const b = cleanBudget({ warn_pct: 80, per_user_default: 50, per_user: { [A]: 200, [B]: null, "not-a-uuid": 10, [C.toUpperCase()]: "unlimited" } });
  it("ค่าเริ่มต่อคน + ตั้งรายคน + ไม่จำกัด · key ผิดรูปแบบตัดทิ้ง", () => {
    expect(b.per_user).toEqual({ [A]: 200, [B]: null, [C]: null });
    expect(userCap(b, A)).toBe(200);
    expect(userCap(b, B)).toBeNull();
    expect(userCap(b, "dddddddd-1111-2222-3333-444444444444")).toBe(50);
    expect(userCap(b, null)).toBeNull();   // งานอัตโนมัติ ไม่นับงบของใคร
  });
  it("สถานะงบรายคน", () => {
    expect(userBudgetState(39, b, "dddddddd-1111-2222-3333-444444444444")).toBe("ok");
    expect(userBudgetState(40, b, "dddddddd-1111-2222-3333-444444444444")).toBe("warn");
    expect(userBudgetState(50, b, "dddddddd-1111-2222-3333-444444444444")).toBe("over");
    expect(userBudgetState(999, b, B)).toBe("none");
  });
});

describe("เลือกผู้ให้บริการ", () => {
  it("ตัวเลือกไม่ซ้ำ · อ่านสลิป/ใบเสร็จค่าเริ่ม = GPT (Cloudflare ยังไม่ตั้งรหัสบน Vercel)", () => {
    for (const s of PAID_SERVICES) { const ids = (s.providerChoices ?? []).map((c) => c.id); expect(new Set(ids).size, s.key).toBe(ids.length); }
    const slip = paidService("cf.slip_ocr")!;
    expect(effectiveChoice(slip, null)?.id).toBe("openai");
    expect(effectiveChoice(slip, "cloudflare")?.id).toBe("cloudflare");
    expect(effectiveChoice(slip, "nope")?.id).toBe("openai");
    expect(effectiveChoice(paidService("ai.caption")!, "x")).toBeNull();
    expect(effectiveChoice(paidService("email.send")!, null)?.id).toBe("auto");
  });
});
