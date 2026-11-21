/**
 * 🔷 รูปทรง flowchart มาตรฐานเพิ่มเติม (เจ้าของสั่ง 2026-11-21 แบบ A + ข้อ 1-4)
 *   กล่องชนิด "shape" ของกระดาน flowchart กลาง · data.shape = key ในทะเบียนนี้
 *   รูปวาดใน viewBox 100×60 ยืดตามขนาดกล่อง (preserveAspectRatio none) — ใช้ทั้งบนจอ (components/flowchart-board/nodes)
 *   ตอนบันทึกเป็นรูป (export-html) และไอคอนในแผงเลือก (shape-palette) → แก้ที่นี่ที่เดียว
 *   pad = ระยะขอบข้อความในกล่อง (CSS padding) ให้ตัวหนังสืออยู่ในรูปทรง
 * ไม่มี React · ไม่ import อะไร · เทสต์: lib/__tests__/flowchart-shapes.test.ts
 */

export type FlowShapeDef = {
  key: string; th: string; en: string;
  /** ความหมายมาตรฐาน (ชี้ที่ปุ่มแล้วโชว์) */
  meanTh: string; meanEn: string;
  /** เส้นที่ระบายพื้น (รูปหลัก) */
  fill: string[];
  /** เส้นประกอบที่ไม่ระบายพื้น (เช่น ขีดคู่ของกระบวนการย่อย) */
  line?: string[];
  w: number; h: number;
  pad: string;
};

export const FLOW_SHAPES: FlowShapeDef[] = [
  { key: "io",      th: "ข้อมูลเข้า/ออก", en: "Input / output",   meanTh: "รับข้อมูลเข้า หรือส่งข้อมูลออก เช่น กรอกฟอร์ม · ออกรายงาน", meanEn: "Data in or out, e.g. a form or a report",
    fill: ["M12,1 L99,1 L88,59 L1,59 Z"], w: 180, h: 72, pad: "6px 16%" },
  { key: "doc",     th: "เอกสาร",        en: "Document",         meanTh: "เอกสาร 1 ใบ เช่น ใบสั่งซื้อ · ใบเสร็จ", meanEn: "One document, e.g. a PO or a receipt",
    fill: ["M1,1 H99 V48 C75,62 25,36 1,52 Z"], w: 170, h: 80, pad: "6px 8% 18%" },
  { key: "docs",    th: "หลายเอกสาร",     en: "Documents",        meanTh: "เอกสารหลายใบ เช่น ใบส่งของทั้งชุด", meanEn: "Several documents, e.g. a batch of delivery notes",
    fill: ["M9,1 H99 V41 H91 V9 H9 Z", "M5,5 H95 V45 H91 V9 H5 Z", "M1,9 H91 V50 C70,62 22,40 1,54 Z"], w: 180, h: 90, pad: "16% 14% 18% 6%" },
  { key: "sub",     th: "กระบวนการย่อย",  en: "Subprocess",       meanTh: "ขั้นตอนที่มีผังรายละเอียดแยกไว้อีกที่", meanEn: "A step detailed in another chart",
    fill: ["M1,1 H99 V59 H1 Z"], line: ["M11,1 V59", "M89,1 V59"], w: 180, h: 70, pad: "6px 14%" },
  { key: "manual",  th: "กรอกเอง",       en: "Manual input",     meanTh: "คนพิมพ์/กรอกข้อมูลเองด้วยมือ", meanEn: "Someone types the data in by hand",
    fill: ["M1,18 L99,1 V59 H1 Z"], w: 170, h: 80, pad: "28% 8% 6px" },
  { key: "prep",    th: "เตรียมการ",      en: "Preparation",      meanTh: "ตั้งค่า / เตรียมก่อนเริ่มงาน", meanEn: "Setup before the work starts",
    fill: ["M16,1 H84 L99,30 L84,59 H16 L1,30 Z"], w: 180, h: 70, pad: "6px 17%" },
  { key: "delay",   th: "รอ",            en: "Delay",            meanTh: "รอเวลา เช่น รอของ 3 วัน · รออนุมัติ", meanEn: "Waiting, e.g. 3 days for goods · approval",
    fill: ["M1,1 H64 A35,29 0 0 1 64,59 H1 Z"], w: 160, h: 70, pad: "6px 20% 6px 8%" },
  { key: "handop",  th: "ทำด้วยมือ",      en: "Manual task",      meanTh: "งานที่คนทำเอง ไม่ใช่ระบบ เช่น แพ็คของ", meanEn: "Done by a person, not the system, e.g. packing",
    fill: ["M1,1 H99 L83,59 H17 Z"], w: 180, h: 70, pad: "6px 19%" },
  { key: "display", th: "แสดงบนจอ",      en: "Display",          meanTh: "ข้อมูลที่โชว์บนหน้าจอ / แดชบอร์ด", meanEn: "Shown on a screen / dashboard",
    fill: ["M1,30 L20,1 H78 A21,29 0 0 1 78,59 H20 Z"], w: 180, h: 70, pad: "6px 18% 6px 20%" },
  { key: "conn",    th: "จุดเชื่อม",      en: "Connector",        meanTh: "ต่อเส้นข้ามไปจุดอื่นในผังเดียวกัน (ใส่ตัวอักษร A, B)", meanEn: "Jumps to another point on this chart (label A, B)",
    fill: ["M1,30 A49,29 0 1 0 99,30 A49,29 0 1 0 1,30 Z"], w: 72, h: 72, pad: "18%" },
  { key: "offpage", th: "ไปอีกหน้า",      en: "Off-page link",    meanTh: "ต่อไปยังผังอื่น / หน้าอื่น", meanEn: "Continues on another chart / page",
    fill: ["M1,1 H99 V38 L50,59 L1,38 Z"], w: 110, h: 90, pad: "6px 8% 30%" },
  { key: "merge",   th: "รวม",           en: "Merge",            meanTh: "รวมหลายทางเข้าด้วยกัน", meanEn: "Several paths join into one",
    fill: ["M1,1 H99 L50,59 Z"], w: 120, h: 90, pad: "4px 24% 42%" },
];

const BY_KEY = new Map(FLOW_SHAPES.map((s) => [s.key, s]));
export const DEFAULT_SHAPE = "io";
export const isShapeKey = (v: unknown): v is string => typeof v === "string" && BY_KEY.has(v);
export const flowShapeOf = (key?: string): FlowShapeDef => BY_KEY.get(key ?? "") ?? BY_KEY.get(DEFAULT_SHAPE)!;

/** รูปทรงเป็น SVG (สตริง) — ใช้ตอนบันทึกเป็นรูป · บนจอใช้ path ชุดเดียวกันผ่าน React */
export function flowShapeSvg(key: string | undefined, w: number, h: number, fill: string, stroke: string): string {
  const s = flowShapeOf(key);
  const p = (d: string, f: string) => `<path d="${d}" fill="${f}" stroke="${stroke}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 100 60" preserveAspectRatio="none" style="position:absolute;left:0;top:0;overflow:visible">`
    + s.fill.map((d) => p(d, fill)).join("") + (s.line ?? []).map((d) => p(d, "none")).join("") + `</svg>`;
}

/** รูปทรงที่ใช้ล่าสุด (ข้อ 3): เอาตัวที่เพิ่งใช้ขึ้นหน้า ไม่ซ้ำ เก็บ 4 ตัว · ค่าที่ไม่รู้จักทิ้ง */
export function pushRecentShape(list: unknown, key: string, max = 4): string[] {
  const prev = Array.isArray(list) ? list.filter(isShapeKey) : [];
  return isShapeKey(key) ? [key, ...prev.filter((k) => k !== key)].slice(0, max) : prev.slice(0, max);
}
