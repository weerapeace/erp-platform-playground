/**
 * กันลืม — ทุกจุดที่ใช้ AI / API ที่เสียเงิน ต้องลงทะเบียนใน lib/paid-services และเรียกผ่านด่านกลาง lib/paid-services-server
 * (เจ้าของขอ 2026-11-06: "เวลาเพิ่มต้องมาเพิ่มตรงนี้ด้วย เป็นของกลาง")
 * เทสต์นี้ไม่ผ่าน = มีโค้ดเรียกบริการเสียเงินตรง ๆ / ใช้ key ที่ไม่ลงทะเบียน / ทะเบียนชี้ไฟล์ผิด → แก้ตามข้อความที่ขึ้น
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { estimateCostThb, PAID_SERVICES, paidService } from "@/lib/paid-services";

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
    const re = /\b(aiChat|getAiFor|serviceOn|logServiceUse|serviceOffMessage)\(\s*"([^"]+)"/g;
    for (const f of FILES) for (const m of code(f.src).matchAll(re)) if (!paidService(m[2])) bad.push(`${f.file}: ${m[1]}("${m[2]}")`);
    expect(bad, "เพิ่ม key ใน PAID_SERVICES (lib/paid-services.ts)").toEqual([]);
  });

  it("ประมาณค่าใช้จ่ายตามโมเดล", () => {
    expect(estimateCostThb("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(5.4);
    expect(estimateCostThb("gpt-4.1", 0, 1_000_000)).toBeCloseTo(288);
    expect(estimateCostThb("unknown-model", 1_000_000, 0)).toBeCloseTo(5.4);
  });
});
