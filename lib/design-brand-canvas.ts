/**
 * ตรรกะกระดานแคนวาสต่อแบรนด์ของ Design Dashboard (ฟังก์ชันล้วน ๆ เทสต์ได้) — เจ้าของสั่ง 2026-11-23
 *
 * ใช้คู่ components/design-dashboard/canvas-view.tsx — กระดาน Excalidraw (ของกลาง CanvasSketch) 1 กระดาน = 1 แบรนด์
 *  • 1 กรอบ (frame) = 1 สถานะ (customData.kind = "dd_zone", status = key สถานะ)
 *  • การ์ดใบงาน = การ์ดกลาง design_sheet (components/canvas-cards/skeletons · customData.kind = "design_sheet")
 *  • layoutZones()  : การ์ดใบไหนอยู่โซนไหน + จัดเข้าช่อง (snap 2 คอลัมน์) + ความสูงกรอบ + จำนวนต่อโซน
 *  • diffZoneMoves(): เทียบกับที่เห็นครั้งก่อน → ใบที่ถูกลากข้ามโซน (= เปลี่ยนสถานะใบงานจริง)
 *  • refsForSheet() : รูป/ลิงก์/ข้อความที่ลากเส้นผูกกับการ์ดใบงาน (ไว้โชว์ในใบงาน)
 *
 * กฎกันข้อมูลพัง (เหมือนบอร์ดจ่ายงาน): การ์ดที่อยู่นอกโซนที่รู้จัก = "ไม่นับ" ไม่ใช่แปลว่าเปลี่ยนสถานะ
 */

export type CanvasEl = {
  id?: string; type?: string; name?: string | null;
  frameId?: string | null; groupIds?: string[];
  x?: number; y?: number; width?: number; height?: number;
  isDeleted?: boolean; text?: string; link?: string | null; fileId?: string | null;
  startBinding?: { elementId?: string } | null; endBinding?: { elementId?: string } | null;
  customData?: Record<string, unknown> | null;
};

export const ZONE_KIND = "dd_zone";
export const SHEET_KIND = "design_sheet";
export const CARD_W = 240, GAPX = 16, GAPY = 16, COLS = 2, ZONE_HEAD = 40;
export const ZONE_W = COLS * CARD_W + (COLS + 1) * GAPX, ZONE_GAP = 60, ZONE_MIN_H = 220;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const live = (els: CanvasEl[]) => els.filter((e) => e && !e.isDeleted);

/** กรอบไหนคือสถานะไหน (เฉพาะกรอบที่ระบบประทับ dd_zone) */
export function zoneFrames(els: CanvasEl[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const el of live(els)) {
    const d = el.customData as { kind?: string; status?: string } | null | undefined;
    if (el.type === "frame" && el.id && d?.kind === ZONE_KIND && d.status) out.set(String(el.id), String(d.status));
  }
  return out;
}

type Card = { key: string; id: string; minX: number; minY: number; maxX: number; maxY: number; frameNow: string; els: CanvasEl[] };

/** รวม element ของการ์ดใบงานเป็นใบ ๆ (ตาม groupIds[0]) */
export function sheetCards(els: CanvasEl[]): Card[] {
  const cards = new Map<string, Card>();
  for (const el of live(els)) {
    const d = el.customData as { kind?: string; id?: string } | null | undefined;
    if (d?.kind !== SHEET_KIND || !d.id) continue;
    const key = (el.groupIds && el.groupIds[0]) || `${SHEET_KIND}:${d.id}`;
    const x = num(el.x), y = num(el.y), x2 = x + num(el.width), y2 = y + num(el.height);
    const hit = cards.get(key);
    if (hit) {
      hit.minX = Math.min(hit.minX, x); hit.minY = Math.min(hit.minY, y);
      hit.maxX = Math.max(hit.maxX, x2); hit.maxY = Math.max(hit.maxY, y2);
      if (!hit.frameNow && el.frameId) hit.frameNow = String(el.frameId);
      hit.els.push(el);
    } else {
      cards.set(key, { key, id: String(d.id), minX: x, minY: y, maxX: x2, maxY: y2, frameNow: el.frameId ? String(el.frameId) : "", els: [el] });
    }
  }
  return [...cards.values()];
}

export type ZoneLayout = {
  moves: { id: string; x: number; y: number }[];
  adopts: { id: string; frameId: string }[];
  /** ใบงาน → สถานะของโซนที่การ์ดอยู่ตอนนี้ (เฉพาะใบที่อยู่ในโซนที่รู้จัก) */
  sheetZone: Map<string, string>;
  frames: { id: string; status: string; cards: number; height?: number }[];
};

/**
 * อ่านกระดาน 1 รอบ: การ์ดอยู่โซนไหน (จุดกึ่งกลางการ์ด) · ผูกเข้ากรอบ · จัดเข้าช่อง 2 คอลัมน์ (แถวสูงตามการ์ดที่สูงสุดในแถว) · ความสูงกรอบพอดีการ์ด
 * ลำดับช่อง = ตามที่ผู้ใช้วาง (บน→ล่าง, ซ้าย→ขวา)
 */
export function layoutZones(els: CanvasEl[]): ZoneLayout {
  const zones = zoneFrames(els);
  const frameEl = new Map<string, CanvasEl>();
  for (const el of live(els)) if (el.type === "frame" && el.id && zones.has(String(el.id))) frameEl.set(String(el.id), el);

  const inFrame = (c: Card): string => {
    const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2;
    for (const [fid, f] of frameEl) {
      const fx = num(f.x), fy = num(f.y);
      if (cx >= fx && cx <= fx + num(f.width) && cy >= fy && cy <= fy + num(f.height)) return fid;
    }
    return c.frameNow && zones.has(c.frameNow) ? c.frameNow : "";
  };

  const byFrame = new Map<string, Card[]>();
  const sheetZone = new Map<string, string>();
  const adopts: ZoneLayout["adopts"] = [];
  for (const c of sheetCards(els)) {
    const fid = inFrame(c);
    if (!fid) continue;
    sheetZone.set(c.id, zones.get(fid)!);
    (byFrame.get(fid) ?? byFrame.set(fid, []).get(fid)!).push(c);
    for (const el of c.els) if (String(el.frameId ?? "") !== fid && el.id) adopts.push({ id: String(el.id), frameId: fid });
  }

  const moves: ZoneLayout["moves"] = [];
  const frames: ZoneLayout["frames"] = [];
  for (const [fid, f] of frameEl) {
    const list = (byFrame.get(fid) ?? []).sort((a, b) => (Math.abs(a.minY - b.minY) > 30 ? a.minY - b.minY : a.minX - b.minX));
    const fx = num(f.x), fy = num(f.y);
    let rowY = fy + ZONE_HEAD;
    for (let i = 0; i < list.length; i += COLS) {
      const row = list.slice(i, i + COLS);
      const rowH = Math.max(...row.map((c) => c.maxY - c.minY));
      row.forEach((c, j) => {
        const tx = fx + GAPX + j * (CARD_W + GAPX), ty = rowY;
        const dx = tx - c.minX, dy = ty - c.minY;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        for (const el of c.els) if (el.id) moves.push({ id: String(el.id), x: num(el.x) + dx, y: num(el.y) + dy });
      });
      rowY += rowH + GAPY;
    }
    const want = Math.max(ZONE_MIN_H, rowY - fy + GAPY);
    const fr: ZoneLayout["frames"][number] = { id: fid, status: zones.get(fid)!, cards: list.length };
    if (Math.abs(num(f.height) - want) > 1) fr.height = want;
    frames.push(fr);
  }
  return { moves, adopts, sheetZone, frames };
}

/** ใบที่ถูกลากข้ามโซน — ใบที่เพิ่งเห็นครั้งแรก = จำไว้เฉย ๆ (กันเขียนทับตอนเปิดกระดาน) · ผู้เรียกอัปเดต seen เอง */
export function diffZoneMoves(now: Map<string, string>, seen: Map<string, string>): { sheetId: string; status: string }[] {
  const out: { sheetId: string; status: string }[] = [];
  for (const [sheetId, st] of now) {
    if (!seen.has(sheetId)) continue;
    if (seen.get(sheetId) === st) continue;
    out.push({ sheetId, status: st });
  }
  return out;
}

export type SheetRef = { id: string; kind: "image" | "link" | "text"; url?: string | null; text?: string | null };

/**
 * ของอ้างอิงที่ลากเส้น (ลูกศร/เส้น) ผูกกับการ์ดใบงาน sheetId — ปลายอีกข้างเป็น รูป / กล่องฝังลิงก์ / ข้อความ / กล่องที่มีลิงก์
 * fileUrl(fileId) = URL รูป (scene.files[fileId].dataURL ที่ย้ายขึ้น R2 แล้ว) · รูปที่ยังเป็น data: ไม่คืน (ไม่ส่งก้อนใหญ่)
 */
export function refsForSheet(els: CanvasEl[], sheetId: string, fileUrl: (fileId: string) => string | null): SheetRef[] {
  const all = live(els);
  const byId = new Map(all.filter((e) => e.id).map((e) => [String(e.id), e]));
  const cardIds = new Set<string>();
  const cardGroups = new Set<string>();
  for (const el of all) {
    const d = el.customData as { kind?: string; id?: string } | null | undefined;
    if (d?.kind === SHEET_KIND && String(d.id) === sheetId && el.id) { cardIds.add(String(el.id)); if (el.groupIds?.[0]) cardGroups.add(el.groupIds[0]); }
  }
  if (!cardIds.size) return [];
  const isCard = (id?: string) => !!id && (cardIds.has(id) || (byId.get(id)?.groupIds ?? []).some((g) => cardGroups.has(g)));
  const out: SheetRef[] = [];
  const seen = new Set<string>();
  for (const ln of all) {
    if (ln.type !== "arrow" && ln.type !== "line") continue;
    const a = ln.startBinding?.elementId, b = ln.endBinding?.elementId;
    const other = isCard(a) ? b : isCard(b) ? a : undefined;
    if (!other || isCard(other) || seen.has(other)) continue;
    const el = byId.get(other); if (!el) continue;
    seen.add(other);
    if (el.type === "image") { const u = el.fileId ? fileUrl(el.fileId) : null; out.push({ id: other, kind: "image", url: u }); continue; }
    if (el.type === "embeddable" || el.type === "iframe") { out.push({ id: other, kind: "link", url: el.link ?? null }); continue; }
    if (el.link) { out.push({ id: other, kind: "link", url: el.link, text: el.text ?? null }); continue; }
    if (el.type === "text" && el.text) { out.push({ id: other, kind: "text", text: el.text }); continue; }
    // กล่องที่มีข้อความข้างใน (boundElements) — หาข้อความที่ containerId = กล่องนี้
    const inner = all.find((t) => t.type === "text" && (t as { containerId?: string }).containerId === other);
    if (inner?.text) out.push({ id: other, kind: "text", text: inner.text });
  }
  return out;
}
