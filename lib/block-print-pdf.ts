/**
 * 🧱 บล็อกพิมพ์ — เขียน PDF ส่งโรงงาน (ฝั่งหน้าเว็บเท่านั้น)
 *   มีแค่ "ลายสีดำเป็นเวกเตอร์" + เส้นไกด์สีเทา + เส้นบอกขนาดสีม่วง + ตัวเลข (เจ้าของขอ: ไม่ต้องมีข้อความอื่น)
 *   ขนาดจริง 1:1 ตามที่ตั้ง · ตำแหน่ง/เส้นบอกขนาดมาจาก layoutPage + dimGeometry ตัวเดียวกับภาพบนจอ
 *   ใช้ jsPDF ที่มีอยู่แล้วใน public/vendor (ไม่ผ่านขั้น build)
 *   buildLayoutPdf = โหมด "จัดวางในบล็อก": กรอบบล็อก + ลายดำล้วน + ขนาดบล็อก + ระยะตำแหน่ง (blockPage ตัวเดียวกับภาพบนจอ)
 */
import { DIM, DIM_COLORS, dimGeometry, eachOp, layoutPage, mapOps, OP, pieceShapes, type BlockPaper, type BlockPiece, type BlockUnit, type DrawOps } from "@/lib/block-print";
import { blockPage, itemInk, POS_COLOR, type BlockLayout } from "@/lib/block-print-layout";

const JSPDF_SRC = "/vendor/jspdf-2.5.1.umd.min.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type JsPdf = any;
type Win = Window & { jspdf?: { jsPDF: new (o: Record<string, unknown>) => JsPdf } };

let loader: Promise<void> | null = null;
function loadJsPdf(): Promise<void> {
  if ((window as Win).jspdf) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = JSPDF_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error("โหลดตัวทำ PDF ไม่สำเร็จ ลองใหม่อีกครั้ง")); };
    document.head.appendChild(s);
  });
  return loader;
}

/** ส่งเส้นเข้า jsPDF (ยังไม่เติม/ไม่ลากเส้น) */
function tracePath(doc: JsPdf, d: DrawOps, fn: (x: number, y: number) => [number, number]) {
  eachOp(mapOps(d, fn), (op, a) => {
    if (op === OP.M) doc.moveTo(a[0], a[1]);
    else if (op === OP.L) doc.lineTo(a[0], a[1]);
    else if (op === OP.C) doc.curveTo(a[0], a[1], a[2], a[3], a[4], a[5]);
    else if (op === OP.Z) doc.close();
  });
}

const hex = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** สร้าง PDF ทุกชิ้นที่ติ๊กไว้ในหน้าเดียว → Blob (ใส่ไม่พอ = throw พร้อมข้อความภาษาคน) */
export async function buildBlockPdf(pieces: BlockPiece[], opts: { paper: BlockPaper; unit: BlockUnit; title?: string }): Promise<Blob> {
  const lay = layoutPage(pieces, opts.paper);
  if (!lay.ok) throw new Error(lay.error);
  await loadJsPdf();
  const { jsPDF } = (window as Win).jspdf!;
  const doc = new jsPDF({ unit: "mm", format: opts.paper.toLowerCase(), orientation: lay.orientation, compress: true });
  if (opts.title) doc.setProperties({ title: opts.title, creator: "ERP บล็อกพิมพ์" });
  const byId = new Map(pieces.map((p) => [p.id, p]));

  // ลาย: เวกเตอร์สีดำล้วน
  doc.setFillColor(0, 0, 0);
  for (const it of lay.items) {
    const p = byId.get(it.id)!;
    const sx = it.w / p.ow, sy = it.h / p.oh;
    // ชิ้นรวม = วาดทีละเส้นด้วยวิธีเติมสีของเส้นนั้น (รูในตัวอักษรไม่ถูกถมทับ)
    for (const s of pieceShapes(p)) {
      eachOp(mapOps(s.d, (x, y) => [it.x + x * sx, it.y + y * sy]), (op, a) => {
        if (op === OP.M) doc.moveTo(a[0], a[1]);
        else if (op === OP.L) doc.lineTo(a[0], a[1]);
        else if (op === OP.C) doc.curveTo(a[0], a[1], a[2], a[3], a[4], a[5]);
        else if (op === OP.Z) doc.close();
      });
      if (s.fill === "evenodd") doc.fillEvenOdd(); else doc.fill();
    }
  }

  // เส้นไกด์ + เส้นบอกขนาด + ตัวเลข
  doc.setFont("courier", "normal");
  doc.setFontSize(DIM.text / 0.3528);
  doc.setTextColor(...hex(DIM_COLORS.text));
  for (const it of lay.items) {
    const g = dimGeometry(it, opts.unit);
    for (const l of g.lines) {
      doc.setDrawColor(...hex(l.kind === "guide" ? DIM_COLORS.guide : DIM_COLORS.dim));
      doc.setLineWidth(l.kind === "guide" ? 0.15 : 0.3);
      doc.line(l.x1, l.y1, l.x2, l.y2);
    }
    for (const t of g.texts) {
      const tw = doc.getTextWidth(t.text);
      if (t.rotate === 90) doc.text(t.text, t.x, t.y - tw / 2, { angle: -90 });
      else doc.text(t.text, t.x - tw / 2, t.y);
    }
  }
  return doc.output("blob") as Blob;
}

/** PDF โหมด "จัดวางในบล็อก" — บล็อกเดียวต่อไฟล์ ขนาดจริง 1:1 · ลาย/รูปทรง/ข้อความเป็นสีดำล้วน (สีบนจอไม่ติดไป) */
export async function buildLayoutPdf(layout: BlockLayout, pieces: BlockPiece[], opts: { paper: BlockPaper; unit: BlockUnit; title?: string }): Promise<Blob> {
  const page = blockPage(layout, opts.paper, opts.unit);
  if (!page.ok) throw new Error(page.error);
  if (!layout.items.length) throw new Error("บล็อกนี้ยังไม่มีชิ้น — เพิ่มชิ้นจากไฟล์ ข้อความ หรือรูปทรงก่อน");
  await loadJsPdf();
  const { jsPDF } = (window as Win).jspdf!;
  const doc = new jsPDF({ unit: "mm", format: opts.paper.toLowerCase(), orientation: page.orientation, compress: true });
  if (opts.title) doc.setProperties({ title: opts.title, creator: "ERP บล็อกพิมพ์" });
  const { ox, oy } = page;
  const at = (x: number, y: number): [number, number] => [ox + x, oy + y];
  const byId = new Map(pieces.map((p) => [p.id, p]));

  // ลาย: เติมดำ / เส้นดำ
  doc.setFillColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  for (const it of layout.items) {
    for (const s of itemInk(it, byId)) {
      tracePath(doc, s.d, at);
      if (s.mode === "fill") { if (s.rule === "evenodd") doc.fillEvenOdd(); else doc.fill(); }
      else { doc.setLineWidth(s.width); doc.setLineJoin("round"); doc.stroke(); }
    }
  }
  // กรอบบล็อก + เส้นไกด์ชมพู + เส้นบอกขนาด + ตัวเลข
  const COLOR = { outline: DIM_COLORS.guide, guide: DIM_COLORS.guide, pos: POS_COLOR, dim: DIM_COLORS.dim } as const;
  const WIDTH = { outline: 0.2, guide: 0.15, pos: 0.15, dim: 0.3 } as const;
  for (const l of page.dims.lines) {
    doc.setDrawColor(...hex(COLOR[l.kind]));
    doc.setLineWidth(WIDTH[l.kind]);
    doc.line(ox + l.x1, oy + l.y1, ox + l.x2, oy + l.y2);
  }
  doc.setFont("courier", "normal");
  doc.setFontSize(DIM.text / 0.3528);
  doc.setTextColor(...hex(DIM_COLORS.text));
  for (const t of page.dims.texts) {
    const tw = doc.getTextWidth(t.text);
    if (t.rotate === 90) doc.text(t.text, ox + t.x, oy + t.y - tw / 2, { angle: -90 });
    else doc.text(t.text, ox + t.x - tw / 2, oy + t.y);
  }
  return doc.output("blob") as Blob;
}
