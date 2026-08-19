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
  /** element ที่ต้อง "ผูกเข้ากรอบ" (โยนเข้ามาแล้ว แต่ Excalidraw ยังไม่นับเป็นลูกของกรอบ เช่นการ์ดล้นขอบกรอบ) */
  adopts: { id: string; frameId: string }[];
  /** การ์ดแผนใบไหนอยู่โต๊ะไหน (รวมใบที่เพิ่งถูกผูกเข้ากรอบ) — ใช้เขียนกลับเข้าแผน */
  planDesk: Map<string, string | null>;
  /** สรุปรายกรอบ — ไว้ตั้งความสูงกรอบ + เขียนหัวกรอบ (จำนวน/ค่าแรง) */
  frames: {
    id: string; deptId: string | null;
    cards: number; planQty: number; planLabor: number; realQty: number; realLabor: number;
    height?: number;             // ใส่มาเมื่อความสูงกรอบควรเปลี่ยน
    stampDesk?: boolean;         // กรอบนี้รู้จักจาก "ชื่อ" เฉย ๆ → ควรประทับ customData ให้ถาวร
  }[];
};

/**
 * อ่านกระดาน 1 รอบ แล้วบอกทุกอย่างที่ต้องทำ: การ์ดใบไหนอยู่โต๊ะไหน · ต้องผูกเข้ากรอบไหม · ต้องขยับเข้าช่องตรงไหน · ยอดรวมของแต่ละโต๊ะ
 *
 * - การ์ด 1 ใบ = element ที่ groupIds[0] เดียวกัน (กรอบการ์ด + ข้อความ + รูป) → ขยับ/ผูกกรอบทั้งใบพร้อมกัน
 * - "โยนเข้ากรอบ" นับจาก **จุดกึ่งกลางการ์ดอยู่ในกรอบ** ไม่ใช่รอให้ Excalidraw ผูกให้ (การ์ดที่ล้นขอบกรอบ Excalidraw จะไม่ผูกให้ → เคยทำให้ไม่จัดเรียง)
 * - ลำดับช่อง = ตำแหน่งที่ผู้ใช้วางไว้ (บน→ล่าง, ซ้าย→ขวา) แล้วค่อยจัดให้ตรงช่อง
 * - ค่าแรง/จำนวน อ่านจาก customData ของการ์ด (qty, labor) — ไม่ต้องยิง API
 */
export function layoutDesks(els: CanvasEl[], departments: DeskDept[]): DeskLayout {
  const frames = deskFrames(els, departments);
  const frameEl = new Map<string, CanvasEl>();
  for (const el of els) if (el?.type === "frame" && el.id && frames.has(String(el.id))) frameEl.set(String(el.id), el);

  // รวม element เป็น "การ์ด" (ตาม groupIds[0]) — เก็บกรอบครอบการ์ดไว้หาจุดกึ่งกลาง
  type Card = {
    key: string; kind: string; id: string; qty: number; labor: number;
    minX: number; minY: number; maxX: number; maxY: number;
    frameNow: string; els: CanvasEl[];
  };
  const cards = new Map<string, Card>();
  for (const el of els) {
    const d = el?.customData as { kind?: string; id?: string; qty?: unknown; labor?: unknown } | undefined | null;
    if (d?.kind !== "wb_plan" && d?.kind !== "wb_real") continue;
    const key = (el.groupIds && el.groupIds[0]) || `${d.kind}:${d.id ?? ""}`;
    const x = num(el.x), y = num(el.y), x2 = x + num(el.width), y2 = y + num(el.height);
    const hit = cards.get(key);
    if (hit) {
      hit.minX = Math.min(hit.minX, x); hit.minY = Math.min(hit.minY, y);
      hit.maxX = Math.max(hit.maxX, x2); hit.maxY = Math.max(hit.maxY, y2);
      if (!hit.frameNow && el.frameId) hit.frameNow = String(el.frameId);
      hit.els.push(el);
      continue;
    }
    cards.set(key, {
      key, kind: String(d.kind), id: String(d.id ?? ""), qty: num(d.qty), labor: num(d.labor),
      minX: x, minY: y, maxX: x2, maxY: y2, frameNow: el.frameId ? String(el.frameId) : "", els: [el],
    });
  }

  // การ์ดใบนี้ควรอยู่กรอบไหน — กรอบเดิมถ้ายังใช่ · ไม่งั้นดูว่าจุดกึ่งกลางการ์ดตกอยู่ในกรอบโต๊ะไหน
  const inFrame = (c: Card): string => {
    if (c.frameNow && frames.has(c.frameNow)) return c.frameNow;
    const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2;
    for (const [fid, f] of frameEl) {
      const fx = num(f.x), fy = num(f.y);
      if (cx >= fx && cx <= fx + num(f.width) && cy >= fy && cy <= fy + num(f.height)) return fid;
    }
    return "";
  };

  const byFrame = new Map<string, Card[]>();
  const adopts: DeskLayout["adopts"] = [];
  const planDesk = new Map<string, string | null>();
  for (const c of cards.values()) {
    const fid = inFrame(c);
    if (!fid) continue;                                        // ลอยนอกกรอบโต๊ะ → ไม่ยุ่ง (กันเผลอล้างโต๊ะออกจากแผน)
    const a = byFrame.get(fid) ?? []; a.push(c); byFrame.set(fid, a);
    if (c.kind === "wb_plan" && c.id) planDesk.set(c.id, frames.get(fid) ?? null);
    for (const el of c.els) {
      if (!el.id) continue;
      if ((el.frameId ? String(el.frameId) : "") !== fid) adopts.push({ id: String(el.id), frameId: fid });
    }
  }

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
  return { moves, adopts, planDesk, frames: out };
}
