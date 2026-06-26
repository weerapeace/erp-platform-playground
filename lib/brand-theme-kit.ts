/**
 * Brand Theme Kit — "แม่แบบสไตล์แบบช่อง ๆ" (ของกลาง)
 *
 * แนวคิด: ดาวน์โหลดรูปแม่แบบ (แผ่นเดียว มีกรอบเส้นประหลายช่อง + แถวช่องสี)
 *   → ให้ AI เติมรูป/เติมสีในแต่ละกรอบ → อัปกลับ → ระบบตัดแต่ละช่องเข้า slot + ดูดสีเข้าธีม
 *
 * ไฟล์นี้เก็บเฉพาะ "ผัง" (เรขาคณิตของช่อง) + ชื่อไฟล์ต่อช่อง + คำสั่ง AI — ไม่มีโค้ด DOM/canvas
 * การวาด/ตัดรูปอยู่ที่ components/brand-theme-builder/theme-kit.tsx (ใช้ผังนี้ร่วมกัน → ตัดตรงช่องเป๊ะ)
 */
import { SLOT_REGISTRY, wfIconSlotId, type BrandTheme } from "./brand-theme";

export type KitCell = {
  id: string;                    // slot id (image) เช่น page_tl / wf_icon:<key> · หรือ color:<field> (สี)
  kind: "image" | "color";
  label: string;
  colorKey?: keyof BrandTheme;   // เฉพาะ kind=color → ฟิลด์สีในธีม
  tileX: number; tileY: number; tileW: number; tileH: number;   // กรอบเต็ม (รวมป้ายล่าง)
  rx: number; ry: number; rw: number; rh: number;               // กรอบในสุด (พื้นที่รูป/สีจริง — ใช้ตอนตัด/ดูดสี)
};
export type KitLayout = { width: number; height: number; cells: KitCell[]; sections: { title: string; y: number }[] };

// ช่องสีที่ให้ AI เติม (แมปกับฟิลด์สีจริงในธีม)
export const KIT_COLOR_FIELDS: { key: keyof BrandTheme; label: string }[] = [
  { key: "primary_color", label: "สีหลัก" },
  { key: "secondary_color", label: "สีรอง" },
  { key: "accent_color", label: "สีเน้น" },
  { key: "background_color", label: "พื้นหลัง" },
  { key: "card_background_color", label: "พื้นการ์ด" },
  { key: "heading_text_color", label: "สีหัวข้อ" },
  { key: "body_text_color", label: "สีตัวอักษร" },
  { key: "button_primary_bg", label: "พื้นปุ่มหลัก" },
];

// จัดกลุ่มช่องรูปตาม section (อ้าง id จาก SLOT_REGISTRY → label ตรงกับใน Builder)
const IMAGE_SECTIONS: { title: string; ids: string[] }[] = [
  { title: "มุมหน้า & พื้นที่ว่าง", ids: ["page_tl", "page_tr", "page_bl", "page_br", "page_empty"] },
  { title: "หัว / Mascot", ids: ["header_left", "header_right"] },
  { title: "แถบแบรนด์ (sidebar)", ids: ["sidebar_top", "sidebar_bottom"] },
  { title: "ไอคอนการ์ดสถิติ", ids: ["stat_icon_0", "stat_icon_1", "stat_icon_2", "stat_icon_3"] },
  { title: "การ์ดงาน", ids: ["task_corner", "task_placeholder"] },
  { title: "แผงประวัติ", ids: ["audit_badge"] },
];

const slotLabel = (id: string): string => SLOT_REGISTRY.find((d) => d.id === id)?.label ?? id;

// ── ขนาดผัง (พิกัดคงที่ → วาดและตัดใช้พิกัดชุดเดียวกัน) ──
const W = 1600, PAD = 62, GAP = 30;
const IMG = { tw: 472, th: 364, inner: 300, cols: 3 };   // กรอบรูป: พื้นที่รูป 300 + ป้าย 64
const COL = { tw: 346, th: 156, inner: 100, cols: 4 };    // กรอบสี: พื้นที่สี 100 + ป้าย 56
const SECTION_H = 64;

type Item = { id: string; label: string; colorKey?: keyof BrandTheme; kind: "image" | "color" };

function placeGrid(cells: KitCell[], items: Item[], startY: number, g: { tw: number; th: number; inner: number; cols: number }): number {
  let y = startY;
  items.forEach((it, i) => {
    const col = i % g.cols;
    if (i > 0 && col === 0) y += g.th + GAP;
    const tx = PAD + col * (g.tw + GAP);
    cells.push({
      id: it.id, kind: it.kind, label: it.label, colorKey: it.colorKey,
      tileX: tx, tileY: y, tileW: g.tw, tileH: g.th,
      rx: tx + 8, ry: y + 8, rw: g.tw - 16, rh: g.inner - 16,
    });
  });
  return y + g.th;
}

/** สร้างผังแม่แบบ — รวมช่องรูปทุก slot + ช่องไอคอนต่อสถานะจริง + ช่องสี */
export function buildKitLayout(statuses: { key: string; label: string }[] = []): KitLayout {
  const cells: KitCell[] = [];
  const sections: { title: string; y: number }[] = [];
  let y = 132;

  const imageSections = IMAGE_SECTIONS.map((s) => ({
    title: s.title, items: s.ids.map((id): Item => ({ id, label: slotLabel(id), kind: "image" })),
  }));
  if (statuses.length) {
    imageSections.push({
      title: "ไอคอนสถานะงาน",
      items: statuses.map((st): Item => ({ id: wfIconSlotId(st.key), label: `สถานะ: ${st.label}`, kind: "image" })),
    });
  }

  for (const sec of imageSections) {
    sections.push({ title: sec.title, y }); y += SECTION_H;
    y = placeGrid(cells, sec.items, y, IMG);
    y += 40;
  }

  sections.push({ title: "ชุดสี (ให้ AI ใส่สีของแบรนด์)", y }); y += SECTION_H;
  y = placeGrid(cells, KIT_COLOR_FIELDS.map((cf): Item => ({ id: `color:${String(cf.key)}`, label: cf.label, colorKey: cf.key, kind: "color" })), y, COL);
  y += 40;

  return { width: W, height: y, cells, sections };
}

// ── ชื่อไฟล์ต่อช่อง (สำหรับโหมด "รายรูป") — แปลง id ให้ปลอดภัยกับชื่อไฟล์ (ตัด ":" ฯลฯ) ──
export function kitFilename(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") + ".png";
}
const normId = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** หา slot id จากชื่อไฟล์ที่อัปกลับ (เทียบแบบ normalize → ทน "_", "-", เลขนำ, ตัวพิมพ์) */
export function slotIdFromFilename(name: string, validIds: string[]): string | null {
  const key = normId(name.replace(/\.[a-z0-9]+$/i, ""));
  return validIds.find((id) => normId(id) === key) ?? null;
}

// ── ZIP writer (store/no-compress) — สำหรับดาวน์โหลด template รายชิ้นเป็น .zip โดยไม่พึ่ง lib ภายนอก ──
// (PNG บีบอัดในตัวอยู่แล้ว → store พอ · รองรับชื่อไฟล์ UTF-8 ผ่าน flag 0x0800)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  const body: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0),
    ]);
    body.push(local, name, f.data);
    central.push(Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), name);
    offset += local.length + name.length + size;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]);
  const out = new Uint8Array(offset + cdSize + end.length);
  let p = 0;
  for (const c of [...body, ...central, end]) { out.set(c, p); p += c.length; }
  return out;
}

/** คำสั่ง AI พร้อมคัดลอก (ให้เติมในแผ่นโดยไม่ขยับกรอบ) */
export function kitAiPrompt(brandName: string): string {
  return [
    `นี่คือ "แม่แบบสไตล์" ของแบรนด์ "${brandName}" — รูปแผ่นเดียวที่มีกรอบเส้นประหลายช่อง`,
    `ช่วยวาด/ใส่ภาพในแต่ละกรอบเส้นประให้เข้าธีมแบรนด์ ตามกติกาสำคัญ:`,
    `1) ห้ามขยับ/ย้าย/เปลี่ยนขนาดกรอบ — วาดให้อยู่ภายในกรอบเดิมเท่านั้น`,
    `2) ส่งกลับเป็นรูปขนาด/สัดส่วนเท่าแผ่นเดิม (ห้าม crop)`,
    `3) พื้นรอบ ๆ นอกกรอบให้เป็นสีขาวล้วน`,
    `4) ช่อง "ชุดสี" ด้านล่าง ให้ทาสีทึบเต็มช่องเป็นชุดสีของแบรนด์ (1 ช่อง = 1 สี)`,
    `5) ไอคอน/ภาพควรพื้นโปร่งหรือพื้นเรียบ อ่านง่าย เหมาะกับระบบงาน B2B`,
    `อารมณ์แบรนด์ที่ต้องการ: (เติมเอง เช่น น่ารัก / หรูหรา / มินิมอล / สดใส)`,
  ].join("\n");
}
