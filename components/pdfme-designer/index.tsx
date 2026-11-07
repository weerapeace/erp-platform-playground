"use client";
/**
 * 🎨 PdfmeDesigner — ตัวออกแบบเอกสารแบบลากวาง (ของกลาง · ใช้ pdfme)
 * ลากช่องข้อความ/ตาราง/รูป/เส้น/กล่อง วางบนกระดาษ · ฟอนต์ไทย Sarabun โหลดจาก CDN ตอนเปิด
 *
 *   <PdfmeDesigner value={row.body_html} onChange={json => update({ body_html: json })} />
 *   value = JSON ของ pdfme (เก็บในช่อง body_html ของ erp_report_templates) · ว่าง/ไม่ใช่ JSON = เริ่มกระดาษเปล่า
 *   เปลี่ยนแม่แบบ → ให้หน้าแม่ใส่ key ใหม่ (remount) · onChange ยิงทุกครั้งที่ลาก/แก้
 * ใช้ที่: /admin/report-templates (แท็บลากวาง) · /admin/report-builder · หน้าพิมพ์ที่รองรับ: /print/work-order
 */
import { useEffect, useRef, useState } from "react";
import type { Designer } from "@pdfme/ui";
import type { Template, Font, Plugins } from "@pdfme/common";

const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf";

export function isPdfmeJson(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t.startsWith("{")) return false;
  try { const o = JSON.parse(t) as Record<string, unknown>; return !!o && typeof o === "object" && "schemas" in o; }
  catch { return false; }
}

async function loadKit(): Promise<{ font: Font; plugins: Plugins; blank: string }> {
  const [schemas, common] = await Promise.all([import("@pdfme/schemas"), import("@pdfme/common")]);
  const fontData = await fetch(FONT_URL).then(r => r.arrayBuffer());
  return {
    font: { Sarabun: { data: new Uint8Array(fontData), fallback: true } },
    plugins: { Text: schemas.text, Table: schemas.table, Image: schemas.image, Line: schemas.line, Box: schemas.rectangle },
    blank: common.BLANK_PDF as string,
  };
}

/** JSON กระดาษเปล่า (ใช้ตอนสร้างแม่แบบลากวางใหม่) */
export async function blankPdfmeJson(): Promise<string> {
  const common = await import("@pdfme/common");
  return JSON.stringify({ basePdf: common.BLANK_PDF, schemas: [[]] });
}

/** เปิด PDF ตัวอย่างจากแม่แบบ (เติมค่าตัวอย่างที่ตั้งไว้ในช่อง) ในแท็บใหม่ */
export async function openPdfmeSample(json: string): Promise<void> {
  const [{ font, plugins }, { generate }, common] = await Promise.all([loadKit(), import("@pdfme/generator"), import("@pdfme/common")]);
  const template = JSON.parse(json) as Template;
  const pdf = await generate({ template, inputs: common.getInputFromTemplate(template), options: { font }, plugins });
  window.open(URL.createObjectURL(new Blob([new Uint8Array(pdf)], { type: "application/pdf" })), "_blank");
}

export function PdfmeDesigner({ value, onChange, height = "100%" }: {
  value: string | null | undefined;
  onChange?: (json: string) => void;
  height?: number | string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef(value);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [{ Designer: DesignerClass }, kit] = await Promise.all([import("@pdfme/ui"), loadKit()]);
        const template: Template = isPdfmeJson(initial.current)
          ? JSON.parse(initial.current as string) as Template
          : { basePdf: kit.blank, schemas: [[]] };
        if (disposed || !boxRef.current) return;
        const d = new DesignerClass({ domContainer: boxRef.current, template, options: { font: kit.font, lang: "en" }, plugins: kit.plugins });
        d.onChangeTemplate(t => onChangeRef.current?.(JSON.stringify(t)));
        designerRef.current = d;
        setLoading(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "โหลดตัวออกแบบไม่สำเร็จ");
        setLoading(false);
      }
    })();
    return () => { disposed = true; try { designerRef.current?.destroy(); } catch { /* ignore */ } designerRef.current = null; };
  }, []);

  if (err) return <div className="flex h-full items-center justify-center p-8 text-sm text-red-600">{err} — ลองรีเฟรชหน้า</div>;
  return (
    <div className="relative h-full w-full">
      {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-400">กำลังโหลดตัวออกแบบ + ฟอนต์ไทย…</div>}
      <div ref={boxRef} style={{ width: "100%", height, minHeight: 480 }} />
    </div>
  );
}

/** ชื่อช่องที่หน้าพิมพ์ใบสั่งงานเติมข้อมูลจริงให้ */
export function PdfmeFieldHint() {
  return (
    <div className="mt-2 text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
      <b>วิธีให้ระบบเติมข้อมูลจริงตอนพิมพ์:</b> ตั้ง<b>ชื่อช่อง (name)</b> ให้ตรงตามนี้ —
      <code className="mx-0.5">mo_number</code>(เลขที่) · <code className="mx-0.5">product_name</code>(สินค้า) · <code className="mx-0.5">product_sku</code>(รหัส) ·
      <code className="mx-0.5">qty</code>(จำนวน) · <code className="mx-0.5">bom_version</code>(สูตร) · <code className="mx-0.5">due_date_th</code>(กำหนดส่ง) ·
      <code className="mx-0.5">created_at_th</code>(วันที่สั่ง) · <code className="mx-0.5">status_label</code>(สถานะ) · <code className="mx-0.5">note</code>(หมายเหตุ).
      วาง <b>ตาราง (Table)</b> 1 อัน ตั้ง 9 คอลัมน์ตามลำดับ: ลำดับ · วัตถุดิบ · ชนิด · บล็อกตัด · กว้าง×ยาว · ชิ้น · ยอดรวมชิ้น · รวมต้องใช้ · หน่วย → ระบบจะเติมรายการวัตถุดิบให้เอง
    </div>
  );
}
