"use client";

/**
 * Report Builder (ลากวาง) — Phase B · ใช้ pdfme Designer
 * - ลากวางช่องข้อความ/ตาราง/รูป/เส้น/กล่อง บนกระดาษ A4 · ฟอนต์ไทย (Sarabun) โหลดจาก CDN
 * - เก็บเทมเพลต (JSON ของ pdfme) ในตาราง report_templates เดิม (body_html = JSON, ไม่แตะ schema)
 * - ดาวน์โหลด PDF ตัวอย่างจากเทมเพลตปัจจุบัน (พิสูจน์ว่าลากวาง+ไทยขึ้นจริง)
 * เริ่มที่เอกสาร "ใบสั่งงานผลิต (wo)" · ต่อข้อมูลจริง (B2) ที่หน้า /print/work-order
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { Designer } from "@pdfme/ui";
import type { Template, Font, Plugins } from "@pdfme/common";
import type { ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf";
const ENTITY = "wo";
const TEMPLATE_KEY = "wo_pdfme";

function isPdfmeJson(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t.startsWith("{")) return false;
  try { const o = JSON.parse(t) as Record<string, unknown>; return !!o && typeof o === "object" && "schemas" in o; }
  catch { return false; }
}

export default function ReportBuilderPage() {
  const canView = usePermission("reports.view");
  const canEdit = usePermission("admin.reports");
  const toast = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const fontRef = useRef<Font | null>(null);
  const pluginsRef = useRef<Plugins | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("ใบสั่งงานผลิต v1");
  const [rowId, setRowId] = useState<string | null>(null);

  useEffect(() => {
    let designer: Designer | null = null;
    let disposed = false;
    (async () => {
      try {
        const [{ Designer: DesignerClass }, schemas, common] = await Promise.all([
          import("@pdfme/ui"), import("@pdfme/schemas"), import("@pdfme/common"),
        ]);
        const fontData = await fetch(FONT_URL).then((r) => r.arrayBuffer());
        const font: Font = { Sarabun: { data: new Uint8Array(fontData), fallback: true } };
        fontRef.current = font;
        const plugins: Plugins = { Text: schemas.text, Table: schemas.table, Image: schemas.image, Line: schemas.line, Box: schemas.rectangle };
        pluginsRef.current = plugins;

        let template: Template = { basePdf: common.BLANK_PDF, schemas: [[]] };
        try {
          const res = await apiFetch(`/api/admin/report-templates?entity_type=${ENTITY}`);
          const j = (await res.json()) as ReportTemplatesResponse;
          const row = (j.data ?? []).find((t) => t.template_key === TEMPLATE_KEY && isPdfmeJson(t.body_html))
            ?? (j.data ?? []).find((t) => isPdfmeJson(t.body_html));
          if (row && isPdfmeJson(row.body_html)) { template = JSON.parse(row.body_html) as Template; setRowId(row.id); if (row.label) setLabel(row.label); }
        } catch { /* เริ่มจากกระดาษเปล่า */ }

        if (disposed || !containerRef.current) return;
        designer = new DesignerClass({ domContainer: containerRef.current, template, options: { font, lang: "en" }, plugins });
        designerRef.current = designer;
        setLoading(false);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "โหลดตัวออกแบบไม่สำเร็จ");
        setLoading(false);
      }
    })();
    return () => { disposed = true; try { designer?.destroy(); } catch { /* ignore */ } };
  }, []);

  const save = useCallback(async () => {
    const designer = designerRef.current; if (!designer) return;
    setSaving(true);
    try {
      const template = designer.getTemplate();
      const res = await apiFetch("/api/admin/report-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rowId ?? undefined, entity_type: ENTITY, template_key: TEMPLATE_KEY, label,
          paper_size: "A4", orientation: "portrait",
          header_html: "", body_html: JSON.stringify(template), footer_html: "", custom_css: "",
          is_default: true, active: true, description: "pdfme",
        }),
      });
      const j = (await res.json()) as { data?: { id?: string }; error?: string | null };
      if (j.error) throw new Error(j.error);
      if (j.data?.id) setRowId(j.data.id);
      toast.success("บันทึกเทมเพลตแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }, [rowId, label, toast]);

  const downloadSample = useCallback(async () => {
    const designer = designerRef.current, font = fontRef.current, plugins = pluginsRef.current;
    if (!designer || !font || !plugins) return;
    try {
      const [{ generate }, { getInputFromTemplate }] = await Promise.all([import("@pdfme/generator"), import("@pdfme/common")]);
      const template = designer.getTemplate();
      const inputs = getInputFromTemplate(template);
      const pdf = await generate({ template, inputs, options: { font }, plugins });
      const blob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้าง PDF ตัวอย่างไม่สำเร็จ"); }
  }, [toast]);

  if (!canView) return <AccessDenied />;

  return (
    <PlaygroundShell>
      <div className="max-w-[1400px] mx-auto px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🎨 ตัวออกแบบรายงาน (ลากวาง)</h1>
            <p className="text-sm text-slate-500 mt-0.5">ลากช่องข้อความ/ตาราง/รูป วางบนกระดาษ A4 · ฟอนต์ไทยพร้อม · เอกสาร: ใบสั่งงานผลิต</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/report-templates" className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">↩ แบบ HTML (เดิม)</a>
            <button onClick={downloadSample} disabled={loading || !!loadErr} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">⬇ PDF ตัวอย่าง</button>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ชื่อเทมเพลต" className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {canEdit && <button onClick={save} disabled={saving || loading || !!loadErr} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "💾 บันทึกเทมเพลต"}</button>}
          </div>
        </div>

        {loadErr ? <div className="text-center py-20 text-rose-500">⚠️ {loadErr}</div>
          : (
            <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-slate-400 text-sm">กำลังโหลดตัวออกแบบ + ฟอนต์ไทย…</div>}
              <div ref={containerRef} style={{ width: "100%", height: "calc(100vh - 210px)", minHeight: 480 }} />
            </div>
          )}
        <p className="text-[11px] text-slate-400 mt-2">ช่องในตารางใช้ชื่อให้ตรงกับข้อมูล MO (เช่น mo_number, product_name, qty, lines) เพื่อให้ B2 เติมข้อมูลจริงตอนพิมพ์ได้</p>
      </div>
    </PlaygroundShell>
  );
}
