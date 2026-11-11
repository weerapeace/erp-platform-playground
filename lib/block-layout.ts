/**
 * 🧱 จัดกล่องในหน้า (ของกลาง · ล้วน ๆ ไม่มี React — ใช้ได้ทั้งหน้าจอและเทสต์)
 *
 * หน้าไหนแบ่งเนื้อหาเป็น "กล่อง" (เช่น หน้าใบงานมือถือ: รูป / สถานะ / รออะไรอยู่ / ต้นทุน …) → ประกาศรายการกล่อง (BlockDef)
 * แล้วให้คนจัดเองได้: ลากสลับลำดับ · เปิด/ปิด · ขนาดเต็ม/ครึ่ง (ครึ่ง 2 ใบติดกัน = วางคู่ในแถวเดียว)
 * 2 ชั้น (เจ้าของเลือก 2026-11-11 จาก widget "ทั้งทีม / ของฉัน"):
 *   ทีม  = ui_config key `admin_block_layout:<pageKey>` (แก้ได้เฉพาะ admin.users · บันทึกมี audit) — หน้าตามาตรฐานของทุกคน
 *   ของฉัน = user_ui_prefs key `block_layout:<pageKey>` (ต่อคน ทุกเครื่อง) — ทับทีมเฉพาะเรื่องที่ตั้งเอง
 * ค่าที่เก็บ = เฉพาะที่ต่างจากค่าเริ่มต้น (กล่องใหม่ที่เพิ่มทีหลังโผล่เองตามค่าเริ่มต้นของมัน)
 * React: components/block-layout (useBlockLayout · BlockLayoutRows · BlockLayoutEditor) · คู่มือ docs/block-layout.md
 */

export type BlockSize = "full" | "half";

/** 1 กล่องที่หน้านั้นมี */
export type BlockDef = {
  key: string;
  label: string;
  /** ชื่อไอคอนกลาง (<Icon name>) */
  icon: string;
  /** ขนาดที่เลือกได้ (ไม่ใส่ = เต็มอย่างเดียว) */
  sizes?: BlockSize[];
  /** ขนาดเริ่มต้น (ไม่ใส่ = ตัวแรกของ sizes) */
  size?: BlockSize;
  /** ค่าเริ่มต้น = ซ่อน */
  hidden?: boolean;
  /** คำอธิบายสั้นในหน้าจัด */
  hint?: string;
};

/** ค่าที่ตั้ง (ทีมหรือของฉัน) — เก็บเฉพาะที่ต่างจากค่าเริ่มต้น */
export type BlockLayoutPref = { order?: string[]; vis?: Record<string, boolean>; size?: Record<string, BlockSize> };

export type ResolvedBlock = BlockDef & { on: boolean; sizeNow: BlockSize; sizesOk: BlockSize[] };

export const BLOCK_TEAM_PREFIX = "admin_block_layout:";
export const BLOCK_MINE_PREFIX = "block_layout:";
export const blockTeamKey = (pageKey: string) => `${BLOCK_TEAM_PREFIX}${pageKey}`;
export const blockMineKey = (pageKey: string) => `${BLOCK_MINE_PREFIX}${pageKey}`;

const KEY_RE = /^[a-z0-9_.-]{1,40}$/;
const sizesOf = (d: BlockDef): BlockSize[] => (d.sizes?.length ? d.sizes : ["full"]);

/** อ่านค่าที่เก็บไว้ (ค่าเพี้ยนทิ้ง · ว่างหมด = null) */
export function parseBlockLayout(raw: unknown): BlockLayoutPref | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: BlockLayoutPref = {};
  if (Array.isArray(r.order)) {
    const order = [...new Set(r.order.filter((k): k is string => typeof k === "string" && KEY_RE.test(k)))].slice(0, 60);
    if (order.length) out.order = order;
  }
  if (r.vis && typeof r.vis === "object" && !Array.isArray(r.vis)) {
    const vis: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(r.vis as Record<string, unknown>)) if (KEY_RE.test(k) && typeof v === "boolean") vis[k] = v;
    if (Object.keys(vis).length) out.vis = vis;
  }
  if (r.size && typeof r.size === "object" && !Array.isArray(r.size)) {
    const size: Record<string, BlockSize> = {};
    for (const [k, v] of Object.entries(r.size as Record<string, unknown>)) if (KEY_RE.test(k) && (v === "full" || v === "half")) size[k] = v;
    if (Object.keys(size).length) out.size = size;
  }
  return Object.keys(out).length ? out : null;
}

/** เรียงตามลำดับที่ตั้ง · key ที่ไม่อยู่ในลำดับ = ต่อท้ายตามลำดับที่หน้าประกาศ · key ที่หน้าไม่มีแล้ว = ทิ้ง */
function ordered(defs: BlockDef[], order?: string[]): BlockDef[] {
  if (!order?.length) return defs;
  const pos = new Map(order.map((k, i) => [k, i]));
  return defs
    .map((d, i) => ({ d, i, p: pos.get(d.key) ?? order.length + i }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.d);
}

/** รวมค่า: ของฉัน > ทีม > ค่าเริ่มต้นของหน้า (ลำดับ: ของฉันตั้ง = ใช้ของฉันทั้งชุด · ไม่ตั้ง = ของทีม) */
export function resolveBlocks(defs: BlockDef[], team?: BlockLayoutPref | null, mine?: BlockLayoutPref | null): ResolvedBlock[] {
  return ordered(defs, mine?.order ?? team?.order).map((d) => {
    const ok = sizesOf(d);
    const want = mine?.size?.[d.key] ?? team?.size?.[d.key] ?? d.size ?? ok[0];
    const on = mine?.vis?.[d.key] ?? team?.vis?.[d.key] ?? !d.hidden;
    return { ...d, on, sizeNow: ok.includes(want) ? want : ok[0], sizesOk: ok };
  });
}

/** จัดแถว: กล่องครึ่ง 2 ใบติดกัน = แถวเดียวกัน · ครึ่งที่ไม่มีคู่ = เต็มแถว (ไม่เว้นช่องโหว่) */
export function packRows<T extends { sizeNow: BlockSize }>(blocks: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], n = blocks[i + 1];
    if (b.sizeNow === "half" && n?.sizeNow === "half") { rows.push([b, n]); i++; }
    else rows.push([b]);
  }
  return rows;
}

/** แก้ค่า 1 อย่างจากหน้าจัด → คืนค่าที่เก็บใหม่ (ตัดส่วนที่เท่าค่าพื้นฐานทิ้ง ให้เก็บเฉพาะที่ต่าง)
 *  base = หน้าตาเมื่อไม่มีค่าชั้นนี้ — แก้ "ของฉัน" ใช้ resolveBlocks(defs, team) · แก้ "ทีม" ใช้ resolveBlocks(defs)
 *  (ของฉันที่ตั้งเท่ากับทีม = ไม่เก็บ → ทีมเปลี่ยนทีหลัง คนนั้นได้ตามทีม) */
export function withBlockChange(
  base: ResolvedBlock[], pref: BlockLayoutPref | null | undefined,
  change: { order?: string[]; vis?: [string, boolean]; size?: [string, BlockSize] },
): BlockLayoutPref | null {
  const next: BlockLayoutPref = { ...(pref ?? {}) };
  const baseOf = new Map(base.map((b) => [b.key, b]));
  if (change.order) {
    const baseOrder = base.map((b) => b.key);
    next.order = change.order.join("|") === baseOrder.join("|") ? undefined : change.order;
  }
  if (change.vis) {
    const [k, v] = change.vis;
    const vis = { ...(next.vis ?? {}) };
    if (baseOf.get(k)?.on === v) delete vis[k]; else vis[k] = v;
    next.vis = Object.keys(vis).length ? vis : undefined;
  }
  if (change.size) {
    const [k, v] = change.size;
    const size = { ...(next.size ?? {}) };
    if (baseOf.get(k)?.sizeNow === v) delete size[k]; else size[k] = v;
    next.size = Object.keys(size).length ? size : undefined;
  }
  return parseBlockLayout(next);
}
