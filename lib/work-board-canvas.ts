/**
 * ตรรกะกระดานแคนวาสของบอร์ดจ่ายงาน (แยกออกมาเป็นฟังก์ชันล้วน ๆ เพื่อเทสต์ได้)
 *
 * ใช้คู่กับ app/master/work-board/canvas-view.tsx — กระดาน Excalidraw ที่ 1 กรอบ (frame) = 1 โต๊ะ
 *  • deskOfPlanCards() : อ่าน element บนกระดาน → การ์ด "แผน" แต่ละใบตอนนี้อยู่โต๊ะไหน
 *  • diffDeskMoves()   : เทียบกับที่เห็นครั้งก่อน → ใบไหนถูกลากย้ายโต๊ะ (ต้องเขียนกลับเข้าแผน)
 *  • layoutDesks()     : โยนการ์ดเข้ากรอบแล้ว "snap" เข้าช่องกริดให้เอง + สรุปจำนวน/ค่าแรงต่อโต๊ะ (ไว้ขึ้นหัวกรอบ)
 *
 * กฎกันข้อมูลพัง: การ์ดที่อยู่นอกกรอบที่ระบบรู้จัก จะ "ไม่นับ" (ไม่ใช่แปลว่าไม่มีโต๊ะ)
 * — กันเคสวางการ์ดใหม่กลางจอ/ผู้ใช้ลากออกมาพักไว้ แล้วระบบเผลอล้างโต๊ะออกจากแผน
 */

/** element ดิบจากกระดาน — เอาเฉพาะ field ที่ใช้ */
export type CanvasEl = {
  id?: string;
  type?: string;
  name?: string;
  frameId?: string | null;
  groupIds?: string[];
  x?: number; y?: number; width?: number; height?: number;
  customData?: Record<string, unknown> | null;
};
export type DeskDept = { id: string; name: string };

// ---- ขนาดโครงกระดาน (ใช้ทั้งตอนวางโครงครั้งแรกและตอน snap) ----
export const CARD_W = 270, CARD_H = 88, GAPX = 16, GAPY = 12, COLS = 2;
export const FRAME_HEAD = 46, FRAME_W = COLS * CARD_W + (COLS + 1) * GAPX, FRAME_GAP = 56;
/** ความสูงกรอบที่พอดีกับจำนวนการ์ด */
export const frameHeight = (cards: number) => FRAME_HEAD + Math.max(1, Math.ceil(cards / COLS)) * (CARD_H + GAPY) + GAPY;
/** ตำแหน่งช่องที่ j ในกรอบที่มุมซ้ายบน (fx, fy) */
export const slotPos = (fx: number, fy: number, j: number) => ({
  x: fx + GAPX + (j % COLS) * (CARD_W + GAPX),
  y: fy + FRAME_HEAD + Math.floor(j / COLS) * (CARD_H + GAPY),
});

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** กรอบไหนคือโต๊ะไหน — ยึด customData.kind="wb_desk" ก่อน · ไม่มีค่อยเทียบชื่อกรอบกับชื่อโต๊ะ (เผื่อผู้ใช้วาดกรอบเอง)
 *  ค่า null = กรอบ "ยังไม่ระบุโต๊ะ" (ตั้งใจให้แปลว่าไม่มีโต๊ะ)
 *  หมายเหตุ: ชื่อกรอบอาจมียอดค่าแรงต่อท้าย (" · แผน …") — ตัดออกก่อนเทียบชื่อ */
export function deskFrames(els: CanvasEl[], departments: DeskDept[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const el of els) {
    if (el?.type !== "frame" || !el.id) continue;
    const d = el.customData as { kind?: string; id?: string } | undefined | null;
    if (d?.kind === "wb_desk") { out.set(String(el.id), d.id ? String(d.id) : null); continue; }
    const base = String(el.name ?? "").split(" · ")[0].trim();
    const byName = departments.find((x) => x.name === base);
    if (byName) out.set(String(el.id), byName.id);
  }
  return out;
}

/** การ์ด "แผน" แต่ละใบอยู่โต๊ะไหนบนกระดานตอนนี้ (เฉพาะใบที่อยู่ในกรอบที่รู้จัก) */
export function deskOfPlanCards(els: CanvasEl[], departments: DeskDept[]): Map<string, string | null> {
  const frames = deskFrames(els, departments);
  const out = new Map<string, string | null>();
  for (const el of els) {
    const d = el?.customData as { kind?: string; id?: string } | undefined | null;
    if (d?.kind !== "wb_plan" || !d.id) continue;
    const fid = el.frameId ? String(el.frameId) : "";
    if (!fid || !frames.has(fid)) continue;          // นอกกรอบที่รู้จัก → ไม่ยุ่ง
    out.set(String(d.id), frames.get(fid) ?? null);
  }
  return out;
}

/** เทียบกับครั้งก่อน → ใบที่ต้องเขียนกลับเข้าแผน
 *  - ใบที่เพิ่งเห็นครั้งแรก = แค่จำไว้ ไม่ถือว่าย้าย (กันเขียนทับตอนเปิดกระดานครั้งแรก)
 *  - ฟังก์ชันนี้ไม่แก้ seen — ผู้เรียกอัปเดตเองหลังใช้ (จะได้ตัดสินใจตอน error ได้) */
export function diffDeskMoves(
  now: Map<string, string | null>,
  seen: Map<string, string | null>,
): { lineId: string; deptId: string | null }[] {
  const moves: { lineId: string; deptId: string | null }[] = [];
  for (const [lineId, deskNow] of now) {
    if (!seen.has(lineId)) continue;                       // ครั้งแรกที่เห็นใบนี้
    if ((seen.get(lineId) ?? null) === deskNow) continue;  // อยู่ที่เดิม
    moves.push({ lineId, deptId: deskNow });
  }
  return moves;
}

export type DeskLayout = {
  /** element ที่ต้องขยับ (snap เข้าช่อง) */
  moves: { id: string; x: number; y: number }[];
  /** สรุปรายกรอบ — ไว้ตั้งความสูงกรอบ + เขียนหัวกรอบ (จำนวน/ค่าแรง) */
  frames: {
    id: string; deptId: string | null;
    cards: number; planQty: number; planLabor: number; realQty: number; realLabor: number;
    height?: number;             // ใส่มาเมื่อความสูงกรอบควรเปลี่ยน
    stampDesk?: boolean;         // กรอบนี้รู้จักจาก "ชื่อ" เฉย ๆ → ควรประทับ customData ให้ถาวร
  }[];
};

/**
 * จัดการ์ดในแต่ละกรอบโต๊ะให้เข้าช่องกริด (snap) + สรุปจำนวน/ค่าแรงของโต๊ะนั้น
 * - ลำดับช่อง = ตำแหน่งที่ผู้ใช้วางไว้ (บน→ล่าง, ซ้าย→ขวา) แล้วค่อยจัดให้ตรงช่อง
 * - การ์ด 1 ใบ = element ที่ groupIds[0] เดียวกัน (กรอบ+ข้อความ+รูป) → ขยับทั้งใบพร้อมกัน
 * - ค่าแรง/จำนวน อ่านจาก customData ของการ์ด (labor, qty) — ไม่ต้องยิง API
 */
export function layoutDesks(els: CanvasEl[], departments: DeskDept[]): DeskLayout {
  const frames = deskFrames(els, departments);
  const frameEl = new Map<string, CanvasEl>();
  for (const el of els) if (el?.type === "frame" && el.id && frames.has(String(el.id))) frameEl.set(String(el.id), el);

  // รวม element เป็น "การ์ด" (ตาม groupIds[0]) เฉพาะการ์ดงานของบอร์ดนี้
  type Card = { key: string; frameId: string; kind: string; qty: number; labor: number; minX: number; minY: number; els: CanvasEl[] };
  const cards = new Map<string, Card>();
  for (const el of els) {
    const d = el?.customData as { kind?: string; id?: string; qty?: unknown; labor?: unknown } | undefined | null;
    if (d?.kind !== "wb_plan" && d?.kind !== "wb_real") continue;
    const fid = el.frameId ? String(el.frameId) : "";
    if (!fid || !frames.has(fid)) continue;
    const key = (el.groupIds && el.groupIds[0]) || `${d.kind}:${d.id ?? ""}`;
    const hit = cards.get(key);
    if (hit) { hit.minX = Math.min(hit.minX, num(el.x)); hit.minY = Math.min(hit.minY, num(el.y)); hit.els.push(el); continue; }
    cards.set(key, { key, frameId: fid, kind: String(d.kind), qty: num(d.qty), labor: num(d.labor), minX: num(el.x), minY: num(el.y), els: [el] });
  }

  const byFrame = new Map<string, Card[]>();
  for (const c of cards.values()) { const a = byFrame.get(c.frameId) ?? []; a.push(c); byFrame.set(c.frameId, a); }

  const moves: DeskLayout["moves"] = [];
  const out: DeskLayout["frames"] = [];
  for (const [fid, deptId] of frames) {
    const f = frameEl.get(fid); if (!f) continue;
    const list = (byFrame.get(fid) ?? []).sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
    const fx = num(f.x), fy = num(f.y);
    let planQty = 0, planLabor = 0, realQty = 0, realLabor = 0;
    list.forEach((c, j) => {
      if (c.kind === "wb_plan") { planQty += c.qty; planLabor += c.labor; } else { realQty += c.qty; realLabor += c.labor; }
      const slot = slotPos(fx, fy, j);
      const dx = slot.x - c.minX, dy = slot.y - c.minY;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;      // อยู่ตรงช่องแล้ว
      for (const el of c.els) if (el.id) moves.push({ id: String(el.id), x: num(el.x) + dx, y: num(el.y) + dy });
    });
    const want = frameHeight(list.length);
    const d = f.customData as { kind?: string } | undefined | null;
    out.push({
      id: fid, deptId, cards: list.length, planQty, planLabor, realQty, realLabor,
      ...(Math.abs(num(f.height) - want) > 0.5 ? { height: want } : {}),
      ...(d?.kind === "wb_desk" ? {} : { stampDesk: true }),
    });
  }
  return { moves, frames: out };
}
