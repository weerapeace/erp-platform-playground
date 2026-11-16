/**
 * 📤 สร้างไฟล์ Excel ของ "ส่งออกรายละเอียดสินค้า" (ทำงานในเบราว์เซอร์เท่านั้น)
 *   - ใช้ ExcelJS 4.4.0 (MIT) วางเป็นไฟล์สำเร็จรูป public/vendor/exceljs-4.4.0.min.js — ไม่ผ่านขั้น build
 *     เหตุผล: ไลบรารีหนัก ~950KB · ลงเป็นแพ็กเกจเสี่ยง build บน Vercel หน่วยความจำหมด (docs/build-memory.md)
 *     ไฟล์ตรวจ sha512 ของแพ็กเกจตรงกับทะเบียน npm แล้ว (2026-11-16) · โหลดครั้งเดียวตอนกดดาวน์โหลด
 *   - xlsx (SheetJS) ตัวที่ใช้ใน lib/export ใส่รูปในเซลล์ไม่ได้ → งานนี้ (เจ้าของเลือกฝังรูป) ใช้ ExcelJS
 *   - รองรับ: หัว 2 ชั้น · ช่องรวม (รุ่นแม่สูงหลายแถว) · รูปย่อฝังในเซลล์ / ลิงก์รูป · ช่องยังไม่แปล = สีเหลือง
 *   กฎกลาง: lib/spec-export (buildSheetPlan) · หน้าใช้: app/master/parent-skus/export
 */
import { r2ImageUrl, fetchR2Blob } from "@/lib/r2-image";
import type { SheetPlan } from "@/lib/spec-export";

// ExcelJS ไม่มีไฟล์ชนิดข้อมูลในโปรเจกต์ (ไม่ได้ลงเป็นแพ็กเกจ) → ใช้ any เฉพาะจุดนี้
/* eslint-disable @typescript-eslint/no-explicit-any */
type ExcelJS = any;
const EXCELJS_SRC = "/vendor/exceljs-4.4.0.min.js";
let loader: Promise<ExcelJS> | null = null;

export function loadExcelJS(): Promise<ExcelJS> {
  const w = window as unknown as { ExcelJS?: ExcelJS };
  if (w.ExcelJS) return Promise.resolve(w.ExcelJS);
  loader ??= new Promise<ExcelJS>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = EXCELJS_SRC;
    s.async = true;
    s.onload = () => (w.ExcelJS ? resolve(w.ExcelJS) : reject(new Error("โหลดตัวสร้าง Excel ไม่สำเร็จ")));
    s.onerror = () => reject(new Error("โหลดตัวสร้าง Excel ไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่"));
    document.head.appendChild(s);
  }).catch((e) => { loader = null; throw e; });
  return loader;
}

/** ขนาดรูปย่อในเซลล์ (px) */
const THUMB = 80;
/** ความสูงแถวที่มีรูป (point ≈ px × 0.75) */
const IMG_ROW_PT = THUMB * 0.75 + 8;

/** รูป r2 key → JPEG เล็ก (ย่อด้วย canvas ให้ไฟล์ไม่บวม) · โหลดไม่ได้ = null */
async function thumbJpeg(key: string): Promise<ArrayBuffer | null> {
  try {
    const url = r2ImageUrl(key, THUMB * 2);
    if (!url) return null;
    const blob = await fetchR2Blob(url);
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, (THUMB * 2) / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.82));
    return out ? await out.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export interface XlsxOptions {
  plan: SheetPlan;
  images: "embed" | "link" | "none";
  twoTier: boolean;
  sheetName?: string;
  /** แจ้งความคืบหน้าตอนโหลดรูป (done / total) */
  onProgress?: (done: number, total: number) => void;
}

/** สร้างไฟล์ .xlsx → Blob */
export async function buildSpecXlsx(opts: XlsxOptions): Promise<Blob> {
  const { plan, images, twoTier } = opts;
  const X = await loadExcelJS();
  const wb = new X.Workbook();
  wb.creator = "ERP";
  wb.created = new Date();
  const ws = wb.addWorksheet((opts.sheetName ?? "Products").slice(0, 31));

  const cols = plan.columns.filter((c) => !(images === "none" && c.kind === "image"));
  const colIdx = plan.columns.map((c) => cols.indexOf(c));   // index เดิม → index ในไฟล์ (-1 = ตัดทิ้ง)
  ws.columns = cols.map((c) => ({ width: c.kind === "image" ? (images === "embed" ? 13 : 40) : c.width }));

  const headRows = twoTier ? 2 : 1;
  const border = { top: { style: "thin", color: { argb: "FFD0D5DD" } }, left: { style: "thin", color: { argb: "FFD0D5DD" } }, bottom: { style: "thin", color: { argb: "FFD0D5DD" } }, right: { style: "thin", color: { argb: "FFD0D5DD" } } };
  const headFill = (sku: boolean) => ({ type: "pattern", pattern: "solid", fgColor: { argb: sku ? "FFEDE9FE" : "FFF1F5F9" } });

  if (twoTier) {
    const top = ws.getRow(1);
    for (const b of plan.bands) {
      const c1 = colIdx.slice(b.c1, b.c2 + 1).filter((i) => i >= 0);
      if (!c1.length) continue;
      const a = Math.min(...c1) + 1, z = Math.max(...c1) + 1;
      if (z > a) ws.mergeCells(1, a, 1, z);
      const cell = top.getCell(a);
      cell.value = b.label;
      cell.font = { bold: true, color: { argb: b.level === "sku" ? "FF5B21B6" : "FF334155" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      for (let i = a; i <= z; i++) { top.getCell(i).fill = headFill(b.level === "sku"); top.getCell(i).border = border; }
    }
    top.height = 20;
  }
  const head = ws.getRow(headRows);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: c.level === "sku" ? "FF5B21B6" : "FF334155" } };
    cell.fill = headFill(c.level === "sku");
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = border;
  });
  head.height = 30;

  // รูปที่ต้องฝัง: (แถว, คอลัมน์, key) — แถวที่เป็นช่องรวม วางรูปที่แถวแรกของช่องรวม
  const embeds: { r: number; c: number; key: string }[] = [];
  const hasImg = new Set<number>();
  plan.rows.forEach((row, r) => {
    const xr = ws.getRow(headRows + 1 + r);
    row.forEach((cell, ci) => {
      const c = colIdx[ci];
      if (c < 0) return;
      const xc = xr.getCell(c + 1);
      xc.border = border;
      xc.alignment = { vertical: "top", wrapText: true };
      if (cell.image) {
        if (cell.v && images === "embed") { embeds.push({ r, c, key: String(cell.v) }); hasImg.add(r); }
        else if (cell.v && images === "link") {
          const url = `${window.location.origin}${r2ImageUrl(String(cell.v))}`;
          xc.value = { text: url, hyperlink: url };
          xc.font = { color: { argb: "FF2563EB" }, underline: true };
        }
        return;
      }
      if (cell.missing) {
        xc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        if (cell.v != null) xc.value = cell.v;   // ช่องอังกฤษที่ยังเป็นภาษาไทย = ใส่ค่าเดิม (สีเหลือง)
        return;
      }
      if (cell.v != null) xc.value = cell.v;
    });
  });

  // ช่องรวม (รุ่นแม่สูงหลายแถว)
  for (const m of plan.merges) {
    const c = colIdx[m.c1];
    if (c < 0) continue;
    ws.mergeCells(headRows + 1 + m.r1, c + 1, headRows + 1 + m.r2, c + 1);
  }
  // แถวที่มีรูป: สูงพอให้รูปเห็นครบ
  if (images === "embed") for (const r of hasImg) ws.getRow(headRows + 1 + r).height = IMG_ROW_PT;

  // โหลดรูปทีละ 6 พร้อมกัน (key เดียวกันโหลดครั้งเดียว)
  if (embeds.length) {
    const uniq = [...new Set(embeds.map((e) => e.key))];
    const ids = new Map<string, number | null>();
    let done = 0;
    opts.onProgress?.(0, uniq.length);
    for (let i = 0; i < uniq.length; i += 6) {
      await Promise.all(uniq.slice(i, i + 6).map(async (key) => {
        const buf = await thumbJpeg(key);
        ids.set(key, buf ? wb.addImage({ buffer: buf, extension: "jpeg" }) : null);
        done++;
        opts.onProgress?.(done, uniq.length);
      }));
    }
    for (const e of embeds) {
      const id = ids.get(e.key);
      if (id == null) {
        ws.getRow(headRows + 1 + e.r).getCell(e.c + 1).value = "(โหลดรูปไม่ได้)";
        continue;
      }
      ws.addImage(id, { tl: { col: e.c + 0.08, row: headRows + e.r + 0.06 }, ext: { width: THUMB, height: THUMB }, editAs: "oneCell" });
    }
  }

  ws.views = [{ state: "frozen", ySplit: headRows, xSplit: 0 }];
  const buf: ArrayBuffer = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
