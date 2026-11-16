/**
 * การ์ดบนกระดานแผนงานทีม (ฟังก์ชันล้วน · เทสต์ lib/__tests__/team-plan-board-cards.test.ts)
 *
 * การ์ด "งานในแผน" แบบใหม่ (เจ้าของเลือกจาก widget 2026-11-16 = หน้าตาเดียวกับการ์ดกระดานงานหน้า Task):
 *   แถบสีซ้าย · รูปเล็กสี่เหลี่ยมด้านหน้า · ป้ายความด่วน · ชื่องาน · เช็กลิสต์/ผูกไว้ · คนทำ (ซ้ายล่าง) · กำหนด (ขวาล่าง แดงเมื่อเกิน)
 *   - สีแถบ: เสร็จ = เขียว · เกินกำหนด = แดง · ที่เหลือ = สีความด่วน
 *   - รูปด้านหน้า: รูปปกที่แนบเอง → รูปของสิ่งที่ผูกตัวแรก → ไม่มี = ตัวอักษรแรกของชื่องาน (การ์ดสูงเท่ากันทุกใบ) — lib/team-plan planCoverSource
 *   - ทุกชิ้นในการ์ดมี customData._part บอกว่าเป็นชิ้นอะไร → ซิงค์ทีละชิ้นได้ "โดยไม่เปลี่ยน id กรอบ" (เส้นผูกงานที่เกาะกรอบไม่หลุด)
 *   - การ์ดแบบเก่า (กรอบ + ข้อความก้อนเดียว) → planCardSync แปลงเป็นแบบใหม่ให้เอง (กรอบเดิม = กรอบการ์ด · ข้อความเดิม = ชื่องาน)
 *   ข้อความบนการ์ดไม่ใช้อีโมจิ
 */
import { wrapCardText } from "@/components/canvas-cards/skeletons";
import { checklistProgress } from "@/lib/record-tasks";
import { dueLabel, isOverdue, isPlanDone, PRIORITY_META, type PlanItem } from "@/lib/team-plan";
import { PLAN_CARD_KIND } from "@/lib/team-plan-board";

export const PLAN_CARD_W = 300;
/** เวอร์ชันหน้าตาการ์ด (เก็บบนกรอบ customData._v) */
export const PLAN_CARD_VERSION = 2;

const PAD = 10, STRIPE = 5, THUMB = 56, COL_X = STRIPE + PAD + THUMB + 10;
const FONT = 6;   // Nunito → ฟอนต์ไทย Sarabun (ตัวพิมพ์เรียบ อ่านง่าย) — components/canvas-sketch/thai-fonts.css
const lineH = (fs: number) => Math.round(fs * 1.35);   // ระยะบรรทัดของฟอนต์ Nunito บนกระดาน
/** กว้างโดยประมาณของข้อความ (ไม่นับสระบน/ล่าง-วรรณยุกต์ไทย) — ใช้จัดวันที่ชิดขวา */
export const approxTextWidth = (s: string, fs: number) => [...s.replace(/[ัิ-ฺ็-๎]/g, "")].length * fs * 0.56;

export function planCardStroke(t: PlanItem, now: Date = new Date()): string {
  if (isPlanDone(t)) return "#16a34a";
  if (isOverdue(t.due_at, now)) return "#dc2626";
  return PRIORITY_META[t.priority].color;
}

/** ข้อความบรรทัดรอง (เช็กลิสต์ · ผูกไว้ · เสร็จโดย) — ว่าง = ไม่มีบรรทัดนี้ */
function metaLine(t: PlanItem): string {
  const c = checklistProgress(t.checklist);
  return [
    c.total > 0 ? `เช็กลิสต์ ${c.done}/${c.total}` : "",
    t.plan.linked.length ? `ผูกไว้ ${t.plan.linked.length} อย่าง` : "",
    isPlanDone(t) && t.resolved_by ? `เสร็จโดย ${t.resolved_by}` : "",
  ].filter(Boolean).join(" · ");
}

type Skel = Record<string, unknown>;

/** โครงการ์ด (Excalidraw skeleton · x,y นับจากมุมซ้ายบนของการ์ด) — customData = { kind: "team_plan", id, _part }
 *  coverUrl = URL รูปด้านหน้า (null = ไม่มีรูป → ตัวอักษรแรกของชื่องาน) · gid ส่งมาเมื่อซิงค์การ์ดเดิม */
export function planCardSkeleton(t: PlanItem, now: Date = new Date(), coverUrl: string | null = null, gid?: string): Skel[] {
  const g = gid ?? `${PLAN_CARD_KIND}-${t.id}-${Math.random().toString(36).slice(2, 7)}`;
  const base = { kind: PLAN_CARD_KIND, id: t.id, title: t.title, tooltip: "ดับเบิลคลิก = เปิดงาน · ลากเส้นไปการ์ดอื่น = ผูกงาน" };
  const cd = (part: string, extra: Record<string, unknown> = {}) => ({ ...base, _part: part, ...extra });
  const done = isPlanDone(t), over = !done && isOverdue(t.due_at, now);
  const color = planCardStroke(t, now);
  const flat = { roughness: 0, fillStyle: "solid", strokeWidth: 1, groupIds: [g] };
  const txt = (part: string, x: number, y: number, text: string, fontSize: number, strokeColor: string): Skel =>
    ({ type: "text", x, y, text, fontSize, fontFamily: FONT, strokeColor, groupIds: [g], customData: cd(part) });

  const W = PLAN_CARD_W, colW = W - COL_X - PAD;
  // ป้ายความด่วน / เสร็จแล้ว
  const badge = done ? "เสร็จแล้ว" : PRIORITY_META[t.priority].label;
  const badgeW = Math.round(approxTextWidth(badge, 11) + 14);
  let y = PAD;
  const badgeBox: Skel = { type: "rectangle", x: COL_X, y, width: badgeW, height: 18, backgroundColor: done ? "#f0fdf4" : "#f8fafc", strokeColor: done ? "#86efac" : "#e2e8f0", roundness: { type: 3 }, ...flat, customData: cd("badgeBox") };
  const badgeTxt = txt("badge", COL_X + 7, y + 2, badge, 11, done ? "#166534" : t.priority === "urgent" || t.priority === "high" ? "#b45309" : "#475569");
  y += 18 + 6;
  const title = wrapCardText(t.title, 22, 3) || "(ไม่มีชื่อ)";
  const titleEl = txt("title", COL_X, y, title, 14, done ? "#64748b" : "#0f172a");
  y += title.split("\n").length * lineH(14) + 4;
  const meta = metaLine(t);
  const metaEl = meta ? txt("meta", COL_X, y, meta, 11, "#64748b") : null;
  if (meta) y += lineH(11) + 4;
  // แถวล่าง: คนทำ (ซ้าย) · กำหนด (ขวา — ไม่พอที่ = ขึ้นบรรทัดใหม่)
  const who = t.assigned_name ?? "ยังไม่ระบุคนทำ";
  const due = t.due_at ? dueLabel(t.due_at, now) : "ไม่มีกำหนด";
  const whoEl = txt("who", COL_X, y, who, 12, "#475569");
  const dueW = approxTextWidth(due, 12), whoW = approxTextWidth(who, 12);
  const sameRow = whoW + 12 + dueW <= colW;
  const dueEl = txt("due", sameRow ? Math.round(W - PAD - dueW) : COL_X, sameRow ? y : y + lineH(12) + 2, due, 12, over ? "#dc2626" : done ? "#16a34a" : "#475569");
  y += lineH(12) + (sameRow ? 0 : lineH(12) + 2);
  const H = Math.max(PAD + THUMB + PAD, y + PAD);

  const els: Skel[] = [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: "#e2e8f0", roundness: { type: 3 }, ...flat, customData: cd("card", { _v: PLAN_CARD_VERSION }) },
    { type: "rectangle", x: 0, y: 0, width: STRIPE, height: H, backgroundColor: color, strokeColor: color, ...flat, customData: cd("stripe") },
    { type: "rectangle", x: STRIPE + PAD, y: PAD, width: THUMB, height: THUMB, backgroundColor: "#f1f5f9", strokeColor: "#e2e8f0", roundness: { type: 3 }, ...flat, customData: cd("thumb") },
  ];
  if (coverUrl) els.push({ type: "image", _imageUrl: coverUrl, x: STRIPE + PAD + 2, y: PAD + 2, width: THUMB - 4, height: THUMB - 4, groupIds: [g], customData: cd("image", { _img: coverUrl }) });
  else els.push(txt("thumbText", STRIPE + PAD + THUMB / 2 - 8, PAD + THUMB / 2 - 14, [...t.title.trim()][0] ?? "?", 22, "#94a3b8"));
  els.push(badgeBox, badgeTxt, titleEl);
  if (metaEl) els.push(metaEl);
  els.push(whoEl, dueEl);
  return els;
}

// ── ซิงค์การ์ดเดิมบนกระดาน → หน้าตา/ข้อมูลล่าสุด ──
type El = Record<string, unknown>;
const STYLE_KEYS = ["strokeColor", "backgroundColor", "strokeWidth", "roughness", "fillStyle", "roundness", "fontSize", "fontFamily"] as const;
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** มุมมนเทียบแค่ชนิด (กระดานอาจเติมค่าอื่นในก้อน roundness เอง) */
const roundType = (v: unknown) => (v && typeof v === "object" ? (v as { type?: unknown }).type ?? null : null);
/** ชิ้นไหนของการ์ด — การ์ดแบบเก่าไม่มี _part: กรอบ = card · ข้อความ = title */
export function partOf(el: El): string | null {
  const d = el.customData as Record<string, unknown> | undefined;
  if (typeof d?._part === "string") return d._part;
  if (el.type === "rectangle") return "card";
  if (el.type === "text") return "title";
  return null;
}

export type PlanCardSync = {
  /** id element → ค่าที่ต้องแก้ (เฉพาะที่ต่างจริง) */
  patches: Map<string, El>;
  /** id element ที่ต้องเอาออก (ชิ้นที่ไม่ใช้แล้ว / รูปที่เปลี่ยน) */
  remove: string[];
  /** ชิ้นที่ต้องเพิ่ม — พิกัดจริงบนกระดาน (ใช้ insert แบบ scene) */
  insert: Skel[];
};

/** เทียบการ์ด 1 ใบบนกระดาน (element ทุกชิ้นในกลุ่มเดียวกัน) กับหน้าตาที่ควรเป็น → สิ่งที่ต้องแก้ · ไม่มีอะไรต่าง = ว่างทั้งหมด
 *  ⚠️ ไม่เปลี่ยน id กรอบการ์ดเด็ดขาด (เส้นผูกงานเกาะกรอบนี้อยู่) */
export function planCardSync(group: El[], t: PlanItem, now: Date, coverUrl: string | null): PlanCardSync {
  const out: PlanCardSync = { patches: new Map(), remove: [], insert: [] };
  const live = group.filter((e) => !e.isDeleted);
  const card = live.find((e) => partOf(e) === "card" && e.type === "rectangle");
  if (!card) return out;
  const gid = ((card.groupIds as string[] | undefined) ?? [])[0];
  if (!gid) return out;
  const ox = Number(card.x) || 0, oy = Number(card.y) || 0;
  const want = planCardSkeleton(t, now, coverUrl, gid);
  const used = new Set<string>([String(card.id)]);
  for (const w of want) {
    const part = (w.customData as Record<string, unknown>)._part as string;
    const cur = part === "card" ? card : live.find((e) => !used.has(String(e.id)) && partOf(e) === part && e.type === w.type);
    const ax = ox + (Number(w.x) || 0), ay = oy + (Number(w.y) || 0);
    if (!cur || (part === "image" && (cur.customData as Record<string, unknown> | undefined)?._img !== (w.customData as Record<string, unknown>)._img)) {
      out.insert.push({ ...w, x: ax, y: ay });
      continue;
    }
    used.add(String(cur.id));
    const p: El = {};
    const set = (k: string, v: unknown) => { if (!same(cur[k], v)) p[k] = v; };
    if (part === "image") {
      // รูปเดิม: เลื่อนตามกรอบเมื่อหลุดช่องรูปเท่านั้น (ขนาดคงสัดส่วนที่ระบบจัดไว้ตอนวาง)
      const relX = (Number(cur.x) || 0) - ox, relY = (Number(cur.y) || 0) - oy;
      if (relX < STRIPE + PAD - 1 || relY < PAD - 1 || relX > STRIPE + PAD + THUMB || relY > PAD + THUMB) { set("x", ax); set("y", ay); }
    } else {
      if (part !== "card") { set("x", ax); set("y", ay); }   // กรอบการ์ด = จุดอ้างอิง ไม่ย้าย
      if (w.type === "rectangle") { set("width", w.width); set("height", w.height); }
      for (const k of STYLE_KEYS) {
        if (w[k] === undefined) continue;
        if (k === "roundness") { if (roundType(cur.roundness) !== roundType(w.roundness)) p.roundness = w.roundness; }
        else set(k, w[k]);
      }
      if (w.type === "text") {
        // ขนาดกล่องข้อความ: แก้เฉพาะตอนข้อความ/ฟอนต์เปลี่ยน (กระดานวัดขนาดจริงเองตอนโหลด — เทียบทุกรอบจะบันทึกไม่หยุด)
        const text = String(w.text);
        const fs = Number(w.fontSize) || 14;
        if (cur.text !== text || cur.fontSize !== fs || cur.fontFamily !== w.fontFamily) {
          p.text = text; p.originalText = text;
          p.height = text.split("\n").length * lineH(fs);
          p.width = Math.max(8, Math.round(Math.max(...text.split("\n").map((l) => approxTextWidth(l, fs))) + 4));
        }
      }
    }
    const wcd = w.customData as Record<string, unknown>, ccd = (cur.customData ?? {}) as Record<string, unknown>;
    if (Object.keys(wcd).some((k) => !same(ccd[k], wcd[k]))) p.customData = { ...ccd, ...wcd };
    if (Object.keys(p).length) out.patches.set(String(cur.id), p);
  }
  // ชิ้นที่ไม่ใช้แล้ว (เช่น บรรทัดรองที่หายไป · ตัวอักษรแทนรูปเมื่อมีรูปแล้ว) → เอาออก · ชิ้นที่ไม่รู้จัก (partOf null) = ไม่แตะ
  for (const e of live) if (!used.has(String(e.id)) && partOf(e) !== null) out.remove.push(String(e.id));
  return out;
}

export const isEmptySync = (s: PlanCardSync) => !s.patches.size && !s.remove.length && !s.insert.length;

/** การ์ด "หน้าใน ERP" — ดับเบิลคลิกเปิดหน้านั้นในแท็บใหม่ (ผูกกับงานได้) */
export function erpPageCardSkeleton(p: { href: string; label: string; appName?: string | null }): Record<string, unknown>[] {
  const gid = `erp_page-${Math.random().toString(36).slice(2, 9)}`;
  const data = { kind: "erp_page", id: p.href, href: p.href, label: p.label, tooltip: "ดับเบิลคลิก = เปิดหน้านี้" };
  const text = [`หน้าใน ERP · ${wrapCardText(p.label, 22, 2)}`, p.appName ? `แอป: ${p.appName}` : null, p.href].filter(Boolean).join("\n");
  const W = 250, H = 40 + text.split("\n").length * 18;
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#f0f9ff", strokeColor: "#0284c7", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text, fontSize: 13, strokeColor: "#075985", groupIds: [gid], customData: data },
  ];
}

/** โน้ตแปะ (กระดาษเหลือง) — ไม่ใช่การ์ดข้อมูล ดับเบิลคลิกแก้ข้อความได้เลย */
export function stickyNoteSkeleton(): Record<string, unknown>[] {
  return [{ type: "rectangle", x: 0, y: 0, width: 200, height: 140, backgroundColor: "#fef08a", strokeColor: "#ca8a04", fillStyle: "solid", roundness: { type: 3 }, label: { text: "โน้ต", fontSize: 16, strokeColor: "#713f12" } }];
}
