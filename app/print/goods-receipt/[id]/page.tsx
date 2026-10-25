"use client";

/**
 * พิมพ์ "ใบรับสินค้า" — /print/goods-receipt/<id หรือ เลข GR>
 *   ใบของคนรับของ: รายการ + จำนวน สั่ง/รับ/เสีย ไม่มีราคา · เทมเพลตจากระบบพิมพ์กลาง (entity gr) ไม่มีใน DB = ใช้ค่าเริ่มต้น
 *   /print/goods-receipt/RB-… = พิมพ์รวมทั้ง "ชุดรับของ" เป็นใบเดียว (รายการเรียงตามใบสั่งซื้อ · ชื่อสินค้านำหน้าด้วยเลข PO)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { DEFAULT_GR_TEMPLATE } from "@/lib/report-designer";
import type { GrDetail } from "@/app/api/purchasing/goods-receipt/[id]/route";
import type { ReceiptBatch } from "@/app/api/purchasing/receipt-batch/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const thaiDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";
const qty = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;

type Tpl = ReportTemplate;
const defaultTpl = (): Tpl => ({ paper_size: "A4", orientation: "portrait", ...DEFAULT_GR_TEMPLATE });
const isBatchNo = (s: string) => /^RB-/i.test(s);
/** รวมใบรับทั้งชุดเป็นใบเดียว (ใช้เทมเพลตใบรับเดิม) — เลข = เลขชุด · PO = ช่วงเลข · รายการนำหน้าด้วยเลข PO */
function mergeBatch(batch: ReceiptBatch, grs: GrDetail[]): GrDetail {
  const first = grs[0];
  const poNos = grs.map((g) => g.po_no).filter(Boolean);
  const sellers = [...new Set(grs.map((g) => g.seller_name).filter(Boolean))];
  return {
    ...first, gr_no: batch.batch_no, voucher_id: null, pv_no: null,
    po_no: poNos.length <= 3 ? poNos.join(", ") : `${poNos[0]} … ${poNos[poNos.length - 1]} (${poNos.length} ใบ)`,
    seller_name: sellers.join(", "),
    note: `ชุดรับของ ${grs.length} ใบรับ: ${grs.map((g) => g.gr_no).join(", ")}${first.note ? ` · ${first.note}` : ""}`,
    lines: grs.flatMap((g) => g.lines.map((l) => ({ ...l, item_name: `${g.po_no} · ${stripCode(l.item_name)}` }))),
  };
}

export default function PrintGoodsReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [gr, setGr] = useState<GrDetail | null>(null);
  const [template, setTemplate] = useState<Tpl | null>(null);
  const [showImages, setShowImages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loadGr = async (): Promise<{ data?: GrDetail; error?: string }> => {
          if (!isBatchNo(id)) return apiFetch(`/api/purchasing/goods-receipt/${encodeURIComponent(id)}`).then((r) => r.json());
          // ชุดรับของ → โหลดทุกใบรับในชุด แล้วรวมเป็นใบเดียว
          const b = (await apiFetch(`/api/purchasing/receipt-batch?no=${encodeURIComponent(id)}`).then((r) => r.json())) as { data?: ReceiptBatch | null; error?: string };
          if (!b.data) return { error: b.error ?? "ไม่พบชุดรับ" };
          const all = await Promise.all(b.data.grs.map((g) => apiFetch(`/api/purchasing/goods-receipt/${g.id}`).then((r) => r.json()) as Promise<{ data?: GrDetail }>));
          const grs = all.map((x) => x.data).filter(Boolean) as GrDetail[];
          return grs.length ? { data: mergeBatch(b.data, grs) } : { error: "โหลดใบรับในชุดไม่สำเร็จ" };
        };
        const [d, tplRes] = await Promise.all([
          loadGr(),
          apiFetch("/api/admin/report-templates?entity_type=gr").then((r) => r.json()).catch(() => ({ data: [] })) as Promise<ReportTemplatesResponse>,
        ]);
        if (cancelled) return;
        if (!d.data) { setError(d.error ?? "ไม่พบใบรับ"); return; }
        setGr(d.data);
        const tpls = (tplRes.data ?? []).filter((t: ReportTemplateRow) => t.active);
        const t = tpls.find((x: ReportTemplateRow) => x.is_default) ?? tpls[0];
        setTemplate(t ? { paper_size: t.paper_size as Tpl["paper_size"], orientation: t.orientation as Tpl["orientation"], header_html: t.header_html, body_html: t.body_html, footer_html: t.footer_html, custom_css: t.custom_css } : defaultTpl());
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "โหลดไม่ได้"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const fileName = docFileName(isBatchNo(id) ? "ใบรับสินค้า-ชุด" : "ใบรับสินค้า", gr?.gr_no);
  const html = useMemo(() => {
    if (!gr || !template) return "";
    const totalReceived = gr.lines.reduce((a, l) => a + l.qty_received, 0);
    return buildReportHtml(template, {
      gr_number: gr.gr_no, po_number: gr.po_no || "—", supplier_name: gr.seller_name || "—",
      receive_date_th: thaiDate(gr.receive_date), receiver_name: gr.receiver || "—", pv_number: gr.pv_no ?? "",
      note: gr.note ?? "", line_count: String(gr.lines.length), total_received: qty(totalReceived),
      lines: gr.lines.map((l, i) => ({
        idx: i + 1,
        image_html: showImages && l.image_url ? `<img src="${esc(l.image_url)}" alt="" />` : "",
        sku: l.code, product_name: stripCode(l.item_name),
        qty_ordered: qty(l.qty_ordered), qty_received: qty(l.qty_received), qty_defective: l.qty_defective > 0 ? qty(l.qty_defective) : "-", unit: l.uom,
      })),
    }, fileName);
  }, [gr, template, showImages, fileName]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={gr ? fileName : undefined} />
      <div className="no-print flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-6 py-2.5">
        <span className="text-xs font-medium text-slate-400">แสดงบนใบ</span>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={showImages} onChange={(e) => setShowImages(e.target.checked)} className="rounded border-slate-300" /> รูปสินค้า
        </label>
        {gr?.voucher_id && <a href={`/print/purchase-voucher/${gr.voucher_id}`} className="ml-auto text-sm text-blue-600 hover:underline">🧾 เปิดใบซื้อ (ใบสำคัญรับ) {gr.pv_no ?? ""}</a>}
      </div>
      <div className="py-6 px-4">
        {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        : error || !gr ? <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        : <div className="relative mx-auto" style={{ maxWidth: 840 }}><PrintFrame html={html} fileName={fileName} /></div>}
      </div>
    </div>
  );
}
