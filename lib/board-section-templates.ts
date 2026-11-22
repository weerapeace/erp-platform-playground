/**
 * เทมเพลตโซนกระดาน (bento) — ชุดกรอบ Section ที่วางลงกระดานทีเดียว (เจ้าของเลือก 2026-11-22)
 *   • ตั้งได้ที่ /tasks/settings แท็บ "เทมเพลตโซนกระดาน" (ชื่อโซน · ขนาด/ตำแหน่งบนตาราง 4 ช่อง · ชนิดโซน)
 *   • เก็บที่ ui_config key BOARD_SECTION_TEMPLATES_KEY = { templates: BoardSectionTemplate[] }
 *   • กระดานที่ใช้: กระดานบรีฟของงาน (brief) · กระดานแคมเปญ (campaign) — ผ่านชุดการ์ดกลาง components/canvas-cards/use-card-kit
 *   • โซนชนิด task / content มีปุ่ม ＋ งาน / ＋ คอนเทนต์ ตอนกดเลือกกรอบบนกระดาน (การ์ดใหม่วางในกรอบนั้น)
 * pure (ไม่ยิง DB) · เทสต์ lib/__tests__/board-section-templates.test.ts
 */
export const BOARD_SECTION_TEMPLATES_KEY = "board_section_templates";
export const BENTO_COLS = 4;
export const BENTO_MAX_ROWS = 8;

export type BoardKind = "brief" | "campaign";
export type SectionKind = "none" | "task" | "content";
export type SectionBlock = { id: string; name: string; x: number; y: number; w: number; h: number; kind: SectionKind };
export type BoardSectionTemplate = { id: string; name: string; boards: BoardKind[]; blocks: SectionBlock[] };
export type BoardSectionConfig = { templates: BoardSectionTemplate[] };

export const SECTION_KIND_OPTIONS: { value: SectionKind; th: string; en: string }[] = [
  { value: "none", th: "โซนทั่วไป", en: "Plain zone" },
  { value: "task", th: "โซนงาน (มีปุ่ม ＋ งาน)", en: "Tasks zone (＋ Task button)" },
  { value: "content", th: "โซนคอนเทนต์ (มีปุ่ม ＋ คอนเทนต์)", en: "Content zone (＋ Content button)" },
];
export const BOARD_KIND_OPTIONS: { value: BoardKind; th: string; en: string }[] = [
  { value: "brief", th: "กระดานบรีฟของงาน", en: "Task brief board" },
  { value: "campaign", th: "กระดานแคมเปญ", en: "Campaign board" },
];

export const newId = () => `s${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export function cleanBlock(raw: unknown): SectionBlock | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
  if (!name) return null;
  const w = clampInt(o.w, 1, BENTO_COLS, 1);
  const h = clampInt(o.h, 1, 4, 1);
  const x = clampInt(o.x, 0, BENTO_COLS - w, 0);
  const y = clampInt(o.y, 0, BENTO_MAX_ROWS - h, 0);
  const kind: SectionKind = o.kind === "task" || o.kind === "content" ? o.kind : "none";
  return { id: typeof o.id === "string" && o.id ? o.id : newId(), name, x, y, w, h, kind };
}

export function cleanSectionConfig(raw: unknown): BoardSectionConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(o.templates)) return defaultSectionConfig();
  const templates: BoardSectionTemplate[] = [];
  for (const t of o.templates) {
    const r = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
    if (!name) continue;
    const boards = (Array.isArray(r.boards) ? r.boards : []).filter((b): b is BoardKind => b === "brief" || b === "campaign");
    const blocks = (Array.isArray(r.blocks) ? r.blocks : []).map(cleanBlock).filter((b): b is SectionBlock => !!b);
    templates.push({ id: typeof r.id === "string" && r.id ? r.id : newId(), name, boards: boards.length ? [...new Set(boards)] : ["brief", "campaign"], blocks });
  }
  return { templates };
}

/** ชุดตั้งต้น (ยังไม่เคยตั้ง) — แคมเปญ = ชื่อโซนสำเร็จรูปเดิมของกระดานแคมเปญ */
export function defaultSectionConfig(): BoardSectionConfig {
  return {
    templates: [
      { id: "tpl_brief", name: "บรีฟงาน", boards: ["brief"], blocks: [
        { id: "b1", name: "ไอเดีย (Brainstorming)", x: 0, y: 0, w: 2, h: 2, kind: "none" },
        { id: "b2", name: "Reference", x: 2, y: 0, w: 2, h: 1, kind: "none" },
        { id: "b3", name: "ข้อมูล (Information)", x: 2, y: 1, w: 1, h: 1, kind: "none" },
        { id: "b4", name: "สินค้า", x: 3, y: 1, w: 1, h: 1, kind: "none" },
        { id: "b5", name: "คอนเทนต์ (Content)", x: 0, y: 2, w: 4, h: 1, kind: "content" },
      ] },
      { id: "tpl_campaign", name: "แคมเปญ", boards: ["campaign"], blocks: [
        { id: "c1", name: "ไอเดีย (Brainstorming)", x: 0, y: 0, w: 2, h: 2, kind: "none" },
        { id: "c2", name: "Reference", x: 2, y: 0, w: 2, h: 1, kind: "none" },
        { id: "c3", name: "ข้อมูล (Information)", x: 2, y: 1, w: 1, h: 1, kind: "none" },
        { id: "c4", name: "สินค้าใน Campaign", x: 3, y: 1, w: 1, h: 1, kind: "none" },
        { id: "c5", name: "งาน (Tasks)", x: 0, y: 2, w: 2, h: 1, kind: "task" },
        { id: "c6", name: "คอนเทนต์ (Content)", x: 2, y: 2, w: 2, h: 1, kind: "content" },
      ] },
    ],
  };
}

export const templatesFor = (cfg: BoardSectionConfig, board: BoardKind) => cfg.templates.filter((t) => t.boards.includes(board) && t.blocks.length > 0);

/** กล่องสองกล่องทับกันไหม */
export const blocksOverlap = (a: Pick<SectionBlock, "x" | "y" | "w" | "h">, b: Pick<SectionBlock, "x" | "y" | "w" | "h">) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** ย้าย/ปรับขนาดกล่องได้ไหม (ไม่ล้นตาราง + ไม่ทับกล่องอื่น) */
export function canPlace(blocks: SectionBlock[], id: string, next: Pick<SectionBlock, "x" | "y" | "w" | "h">): boolean {
  if (next.w < 1 || next.h < 1 || next.x < 0 || next.y < 0 || next.x + next.w > BENTO_COLS || next.y + next.h > BENTO_MAX_ROWS) return false;
  return !blocks.some((b) => b.id !== id && blocksOverlap(b, next));
}

/** ช่องว่างแรกที่วางกล่องขนาด w×h ได้ (อ่านซ้าย→ขวา บน→ล่าง) · ไม่มี = null */
export function firstFreeSpot(blocks: SectionBlock[], w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= BENTO_MAX_ROWS; y++) for (let x = 0; x + w <= BENTO_COLS; x++) {
    if (canPlace(blocks, "__new__", { x, y, w, h })) return { x, y };
  }
  return null;
}

/** จำนวนแถวที่ใช้จริง (ไว้กำหนดความสูงตารางแก้ไข) */
export const usedRows = (blocks: SectionBlock[]) => blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);

/** ขนาดกรอบบนกระดานต่อ 1 ช่อง */
export const BENTO_CELL = { w: 320, h: 260, gap: 32 };

/** เทมเพลต → โครง frame ของ Excalidraw (x,y เริ่มจาก 0,0 — ตัวแทรกของกระดานเลื่อนไปกลางจอให้) */
export function templateFrames(tpl: BoardSectionTemplate): Record<string, unknown>[] {
  const { w: cw, h: ch, gap } = BENTO_CELL;
  return tpl.blocks.map((b) => ({
    type: "frame", children: [], name: b.name,
    x: b.x * (cw + gap), y: b.y * (ch + gap),
    width: b.w * cw + (b.w - 1) * gap, height: b.h * ch + (b.h - 1) * gap,
    customData: { sectionKind: b.kind, sectionTemplate: tpl.id },
  }));
}

/** ชนิดโซนของกรอบบนกระดาน — ดู customData ก่อน · ไม่มี (กรอบเก่า/วางเอง) = เดาจากชื่อที่ตรงกับเทมเพลต */
export function frameSectionKind(frame: { name?: unknown; customData?: unknown }, cfg: BoardSectionConfig | null): SectionKind {
  const d = (frame.customData ?? {}) as Record<string, unknown>;
  if (d.sectionKind === "task" || d.sectionKind === "content") return d.sectionKind;
  if (d.sectionKind === "none") return "none";
  const name = typeof frame.name === "string" ? frame.name.trim() : "";
  if (!name || !cfg) return "none";
  for (const t of cfg.templates) for (const b of t.blocks) if (b.name === name && b.kind !== "none") return b.kind;
  return "none";
}

/** ตำแหน่งการ์ดใบที่ n ในกรอบ (เรียงซ้าย→ขวา แล้วขึ้นแถวใหม่) */
export function slotInFrame(frame: { x: number; y: number; width: number }, n: number, card = { w: 260, h: 200, gap: 16, pad: 24, top: 48 }): { x: number; y: number } {
  const perRow = Math.max(1, Math.floor((frame.width - card.pad * 2 + card.gap) / (card.w + card.gap)));
  const col = n % perRow, row = Math.floor(n / perRow);
  return { x: frame.x + card.pad + col * (card.w + card.gap), y: frame.y + card.top + row * (card.h + card.gap) };
}
