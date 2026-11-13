/**
 * 🧑‍🏫 โค้ชแพทเทิร์น (Bag CAD รอบ I3) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   1) โค้ชในเครื่อง (ฟรี ไม่ส่งข้อมูลไปไหน): ดูแพทเทิร์นตอนนี้ → "ควรทำอะไรต่อ" เรียงตามลำดับงานจริงของช่างแพทเทิร์น
 *      แต่ละข้อมีเหตุผลแบบช่าง (ทำไม) + เครื่องมือที่พาไปได้ (id ในทะเบียน lib/pattern-tools)
 *   2) สรุปแพทเทิร์นเป็นข้อความสั้น (ไม่มีรูป ไม่มีชื่อลูกค้า/ราคา) สำหรับถาม AI — ผู้ใช้เห็นข้อความทั้งหมดก่อนกดส่ง
 *      ส่งผ่าน POST /api/pattern-projects/ai-coach (บริการเสียเงิน ai.pattern_coach · ด่านกลาง aiChat)
 *
 * ใช้ที่: components/pattern-studio/coach-panel · เทสต์: lib/__tests__/pattern-coach.test.ts
 */
import { pieceGeometry, shapeBox, type Shape } from "./pattern-shape";
import type { CheckIssue } from "./pattern-check";
import type { Seam } from "./pattern-seams";

export type CoachPiece = { pid: string; name?: string; shape: Shape; holes?: Shape[] | null; allow: number; allowEdges?: number[] | null; notches?: unknown[] | null; mats?: unknown[] | null; count?: number; role?: string | null };
export type CoachInput = { pieces: CoachPiece[]; seams: Seam[]; issues: CheckIssue[]; gradeBad?: { size: string; n: number }[] | null; sizes?: string[] | null };
export type CoachTip = { id: string; level: "must" | "next" | "tip" | "done"; th: string; en: string; whyTh: string; whyEn: string; tool?: string };

const nm = (p: CoachPiece, i: number) => p.name || `ชิ้น ${i + 1}`;
const list = (xs: string[], n = 3) => xs.slice(0, n).join(", ") + (xs.length > n ? ` +${xs.length - n}` : "");

/** โค้ชในเครื่อง: ข้อที่ต้องทำก่อน (must) → ขั้นถัดไป (next) → เคล็ดลับ (tip) · ทุกอย่างพร้อม = done */
export function coachTips(inp: CoachInput): CoachTip[] {
  const { pieces, seams, issues } = inp, out: CoachTip[] = [];
  if (!pieces.length) return [{ id: "start", level: "next", th: "เริ่มจากแม่แบบทรงกระเป๋า หรือวาดสี่เหลี่ยมเป็นตัวหน้า", en: "Start from a bag template, or draw a rectangle as the front", whyTh: "ช่างเริ่มจากชิ้นใหญ่ที่สุด (ตัวหน้า/หลัง) เสมอ เพราะชิ้นอื่นต้องยาวให้เข้ากับมัน", whyEn: "Pattern makers start with the largest piece because every other piece must fit it", tool: "template" }];
  const errs = issues.filter((x) => x.level === "error");
  if (errs.length) out.push({ id: "fix-errors", level: "must", th: `แก้ปัญหาที่ "ต้องแก้" ${errs.length} ข้อก่อน (ตรวจแบบ)`, en: `Fix the ${errs.length} must-fix issue(s) first (Pattern check)`, whyTh: "เส้นตัดไขว้ / ตะเข็บขาด / รูเจาะหลุดขอบ = ตัดจริงแล้วเสียของ", whyEn: "Crossing cut lines, broken seams or holes off the edge waste real material", tool: "check" });
  const multi = pieces.length > 1;
  if (multi && !seams.length) out.push({ id: "seams", level: "next", th: "บอกว่าขอบไหนเย็บกับขอบไหน (เครื่องมือเย็บ N)", en: "Say which edge sews to which (sewing tool N)", whyTh: "ถ้ายังไม่มีตะเข็บ ระบบเช็กความยาวขอบที่เย็บคู่กันไม่ได้ และประกอบเป็น 3D ไม่ได้", whyEn: "Without seams the edge lengths can't be checked and the 3D can't be assembled", tool: "sew" });
  const mism = issues.filter((x) => x.code === "seam-mismatch");
  if (mism.length) out.push({ id: "mismatch", level: "must", th: `ตะเข็บยาวไม่เท่ากัน ${mism.length} แนว — ปรับความยาวขอบ หรือติ๊กเย็บย่น (ease) ถ้าตั้งใจ`, en: `${mism.length} seam(s) have unequal lengths — adjust the edges, or tick ease if intended`, whyTh: "เย็บจริงแล้วจะเหลือผ้าปลายตะเข็บ หรือดึงจนย่นโดยไม่ตั้งใจ", whyEn: "When sewn, one side runs out early or puckers unintentionally", tool: "edge-len" });
  const noAllow = pieces.map((p, i) => ({ p, i })).filter(({ p }) => !(p.allow > 0) && !(p.allowEdges ?? []).some((v) => v > 0));
  if (noAllow.length) out.push({ id: "allow", level: "next", th: `ใส่เผื่อเย็บให้ ${list(noAllow.map(({ p, i }) => nm(p, i)))}`, en: `Add seam allowance to ${list(noAllow.map(({ p, i }) => nm(p, i)))}`, whyTh: "เส้นที่วาดคือเส้นเย็บ ต้องมีเผื่อออกไปอีก (กระเป๋าทั่วไป 0.7–1 ซม.) ไม่งั้นชิ้นเล็กกว่าที่ต้องการ", whyEn: "The drawn line is the stitch line; without allowance the finished piece comes out small", tool: "allow" });
  const noMat = issues.filter((x) => x.code === "no-material").length || pieces.filter((p) => !(p.mats ?? []).length).length;
  if (noMat) out.push({ id: "mats", level: "next", th: `ตั้งวัสดุของชิ้น (${noMat} ชิ้นยังไม่ได้ตั้ง)`, en: `Set piece materials (${noMat} not set)`, whyTh: "ต้องรู้วัสดุถึงจะคิดผ้าที่ใช้ วางบนหน้าผ้า และส่งตีราคาได้", whyEn: "Materials drive fabric usage, layout width and costing", tool: "mats" });
  if (multi && seams.length && !pieces.some((p) => (p.notches ?? []).length)) out.push({ id: "notches", level: "tip", th: "ใส่รอยบากกลางขอบ/จุดต่อ ให้ช่างเย็บจับคู่ตรงตำแหน่ง", en: "Add notches at edge centres / joins so sewers line them up", whyTh: "ตะเข็บยาว ๆ ถ้าไม่มีรอยบาก ช่างเย็บจะเลื่อนเพี้ยนได้ง่าย", whyEn: "Long seams drift without notches", tool: "edge-len" });
  if (inp.gradeBad?.length) out.push({ id: "grading", level: "must", th: `ขยายไซซ์แล้วตะเข็บไม่เท่ากันในไซซ์ ${inp.gradeBad.map((g) => g.size).join(", ")}`, en: `Seams mismatch after grading in size ${inp.gradeBad.map((g) => g.size).join(", ")}`, whyTh: "ชิ้นที่เย็บคู่กันต้องขยายเท่ากัน เช่น ชิ้นข้างต้องยาวเพิ่มเท่ารอบตัวหน้าที่เพิ่ม", whyEn: "Paired pieces must grow together, e.g. the gusset grows by the front's added perimeter", tool: "grading" });
  const warns = issues.filter((x) => x.level === "warn" && x.code !== "seam-mismatch" && x.code !== "no-material");
  if (warns.length) out.push({ id: "warns", level: "tip", th: `มีข้อ "ควรดู" ${warns.length} ข้อในตรวจแบบ`, en: `${warns.length} worth-a-look item(s) in Pattern check`, whyTh: "ไม่ผิดเสมอไป แต่ช่างที่ดีจะดูให้แน่ใจก่อนตัด", whyEn: "Not always wrong, but worth confirming before cutting", tool: "check" });
  if (!out.some((x) => x.level === "must" || x.level === "next")) out.push({ id: "ready", level: "done", th: "พร้อมผลิต: พิมพ์ใบสเปก ไฟล์ตัด และวางบนผ้าดูการใช้ผ้า", en: "Ready: print the spec sheet, cut files and check the fabric layout", whyTh: "ลองพิมพ์ขนาดจริงตัดกระดาษเย็บต้นแบบ 1 ใบก่อนตัดวัสดุจริงเสมอ", whyEn: "Always make one paper/sample bag at real size before cutting real material", tool: "print" });
  const rank = { must: 0, next: 1, tip: 2, done: 3 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** สรุปแพทเทิร์นเป็นข้อความ (ส่งให้ AI) — ชื่อชิ้น ขนาด เผื่อเย็บ ตะเข็บ ปัญหาที่ตรวจเจอ · ไม่มีรูป ราคา หรือชื่อลูกค้า */
export function coachSummary(inp: CoachInput, question = ""): string {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const lines: string[] = [`แพทเทิร์นกระเป๋า ${inp.pieces.length} ชิ้น · ตะเข็บ ${inp.seams.length} แนว${inp.sizes?.length ? ` · ไซซ์ ${inp.sizes.join("/")}` : ""}`];
  inp.pieces.slice(0, 30).forEach((p, i) => {
    const b = shapeBox(p.shape), g = pieceGeometry({ shape: p.shape, holes: p.holes ?? [] });
    lines.push(`- ${nm(p, i)}${p.role ? ` (${p.role})` : ""}: ${r1(b.w)}×${r1(b.h)} ซม. · พื้นที่ ${r1(g.finishedArea)} ตร.ซม. · เผื่อเย็บ ${p.allow} ซม. · ตัด ${p.count ?? 1} · วัสดุ ${(p.mats ?? []).length ? "มี" : "ยังไม่ตั้ง"}`);
  });
  if (inp.pieces.length > 30) lines.push(`- …อีก ${inp.pieces.length - 30} ชิ้น`);
  const names = new Map(inp.pieces.map((p, i) => [p.pid, nm(p, i)]));
  inp.seams.slice(0, 30).forEach((s, i) => lines.push(`ตะเข็บ ${i + 1}: ${names.get(s.a.pid) ?? "?"} ↔ ${names.get(s.b.pid) ?? "?"}${s.ease ? " (เย็บย่น)" : ""}${s.name ? ` "${s.name}"` : ""}`));
  const iss = inp.issues.slice(0, 20).map((x) => `${x.level === "error" ? "ต้องแก้" : x.level === "warn" ? "ควรดู" : "แจ้ง"}: ${x.code} (${x.pids.map((pid) => names.get(pid) ?? "?").join(", ")})`);
  if (iss.length) lines.push("ผลตรวจแบบ:", ...iss);
  if (inp.gradeBad?.length) lines.push(`ขยายไซซ์: ตะเข็บไม่เท่ากันใน ${inp.gradeBad.map((g) => `${g.size} (${g.n} แนว)`).join(", ")}`);
  const q = question.trim().slice(0, 500);
  lines.push("", q ? `คำถามของผู้ใช้: ${q}` : "คำถาม: ควรแก้หรือทำอะไรต่อ เรียงตามความสำคัญ");
  return lines.join("\n").slice(0, 6000);
}

export const COACH_SYSTEM = [
  "คุณคือช่างทำแพทเทิร์นกระเป๋าผู้มีประสบการณ์ ช่วยสอนผู้ใช้ที่ไม่ใช่ช่าง ตอบเป็นภาษาไทยง่าย ๆ",
  "ได้รับสรุปแพทเทิร์น (ขนาดเป็นเซนติเมตร) จากโปรแกรม — ไม่มีรูป อย่าเดาสิ่งที่ไม่มีในสรุป",
  "ตอบไม่เกิน 6 ข้อ แต่ละข้อ: สิ่งที่ควรทำ + เหตุผลแบบช่าง 1 ประโยค · ถ้ามีตัวเลขแนะนำ (เช่น เผื่อเย็บ) บอกเป็นช่วง",
  "ห้ามรับรองว่าตัดได้เลย ให้แนะนำทำต้นแบบกระดาษ/ตัวอย่างก่อนเสมอ",
  'ตอบเป็น JSON เท่านั้น: {"tips":[{"do":"สิ่งที่ควรทำ (≤120 ตัวอักษร)","why":"เหตุผลแบบช่าง (≤160 ตัวอักษร)"}],"note":"ข้อควรระวังรวม (≤200 ตัวอักษร) หรือ ว่าง"}',
].join("\n");

/** คำตอบ AI (JSON) → ข้อแนะนำที่ตรวจแล้ว (สูงสุด 6 ข้อ · ตัดความยาว) */
export function parseCoachReply(raw: unknown): { tips: { do: string; why: string }[]; note: string } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tips = (Array.isArray(o.tips) ? o.tips : []).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>, d = String(r.do ?? "").trim().slice(0, 160), w = String(r.why ?? "").trim().slice(0, 220);
    return d ? [{ do: d, why: w }] : [];
  }).slice(0, 6);
  return { tips, note: String(o.note ?? "").trim().slice(0, 300) };
}
