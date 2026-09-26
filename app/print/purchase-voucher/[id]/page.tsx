"use client";

/**
 * พิมพ์ "ใบซื้อ / ใบสำคัญรับ" — /print/purchase-voucher/<id>
 *   ราคา ¥ และ ฿ · ค่าส่ง (คิว/น้ำหนัก) แยกบรรทัด ไม่รวมในราคาสินค้า · ต้นทุนถึงมือ/ชิ้น
 *   เทมเพลตจากระบบพิมพ์กลาง (entity pv) ไม่มีใน DB = ใช้ค่าเริ่มต้น · ใบร่างพิมพ์ได้ (มีลายน้ำ "ร่าง")
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { thaiBahtText } from "@/lib/quotation-print";
import { DEFAULT_PV_TEMPLATE } from "@/lib/report-designer";
import { fmtMoney, curSymbol, isForeignCurrency } from "@/lib/landed-cost";
import type { VoucherHeader, VoucherLine } from "@/lib/purchase-voucher-server";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

type Detail = { header: VoucherHeader; lines: VoucherLine[] };
type Tpl = ReportTemplate;
const thaiDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";
const qty = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const stripCode = (name: string) => name.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;
const SHIP_LABEL: Record<string, string> = { none: "ไม่คิดค่าส่ง", cube: "ตามคิว (CBM)", weight: "ตามน้ำหนัก (กก.)" };
const defaultTpl = (): Tpl => ({ paper_size: "A4", orientation: "portrait", ...DEFAULT_PV_TEMPLATE });

export default function PrintPurchaseVoucherPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [data, setData] = useState<Detail | null>(null);
  const [template, setTemplate] = useState<Tpl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [d, tplRes] = await Promise.all([
          apiFetch(`/api/purchasing/vouchers/${encodeURIComponent(id)}`).then((r) => r.json()) as Promise<{ data?: Detail; error?: string }>,
          apiFetch("/api/admin/report-templates?entity_type=pv").then((r) => r.json()).catch(() => ({ data: [] })) as Promise<ReportTemplatesResponse>,
        ]);
        if (cancelled) return;
        if (!d.data) { setError(d.error ?? "ไม่พบใบสำคัญรับ"); return; }
        setData(d.data);
        const tpls = (tplRes.data ?? []).filter((t: ReportTemplateRow) => t.active);
        const t = tpls.find((x: ReportTemplateRow) => x.is_default) ?? tpls[0];
        setTemplate(t ? { paper_size: t.paper_size as Tpl["paper_size"], orientation: t.orientation as Tpl["orientation"], header_html: t.header_html, body_html: t.body_html, footer_html: t.footer_html, custom_css: t.custom_css } : defaultTpl());
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "โหลดไม่ได้"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const h = data?.header;
  const fileName = docFileName("ใบสำคัญรับ", h?.pv_no ?? "ร่าง");
  const html = useMemo(() => {
    if (!data || !template || !h) return "";
    const foreign = isForeignCurrency(h.currency);
    const sym = curSymbol(h.currency).trim();
    const basis = h.ship_method === "cube" ? `${(h.total_cbm ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว` : h.ship_method === "weight" ? `${(h.total_kg ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก.` : "";
    const draftMark = h.status !== "confirmed" ? `<div style="position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72px;color:rgba(220,38,38,.12);font-weight:700;transform:rotate(-20deg);pointer-events:none">ร่าง</div>` : "";
    return buildReportHtml({ ...template, header_html: draftMark + template.header_html }, {
      pv_number: h.pv_no ?? "(ร่าง)", voucher_date_th: thaiDate(h.voucher_date), supplier_name: h.seller_name ?? "—",
      gr_numbers: h.gr_nos.join(", ") || "—", po_numbers: h.po_nos.join(", ") || "—", tracking_no: h.tracking_no ?? "",
      currency_code: h.currency === "YUAN" ? "RMB" : h.currency, currency_symbol: sym, is_foreign: foreign ? "1" : "",
      fx_rate: h.fx_rate != null ? String(h.fx_rate) : "",
      subtotal_foreign: fmtMoney(h.subtotal_foreign), subtotal_thb: fmtMoney(h.subtotal_thb),
      has_shipping: h.ship_method !== "none" && h.ship_total_thb > 0 ? "1" : "",
      ship_method_label: `${SHIP_LABEL[h.ship_method] ?? h.ship_method}${h.carrier_name ? ` · ${h.carrier_name}` : ""}`, ship_basis_label: basis,
      ship_rate: h.ship_manual_total != null ? "(ยอดจริง)" : fmtMoney(h.ship_rate),
      ship_total_thb: fmtMoney(h.ship_total_thb), grand_total_thb: fmtMoney(h.grand_total_thb),
      grand_total_text: thaiBahtText(h.grand_total_thb), note: h.note ?? "", confirmed_by: h.confirmed_by ?? "",
      lines: data.lines.map((l, i) => ({
        idx: i + 1, sku: l.code, product_name: stripCode(l.item_name), gr_number: l.gr_no ?? "",
        qty: qty(l.qty), unit: l.uom ?? "",
        unit_price: l.unit_price != null ? `${foreign ? sym : ""}${fmtMoney(l.unit_price)}` : "—",
        unit_price_thb: l.unit_price_thb != null ? fmtMoney(l.unit_price_thb) : "—",
        line_total_thb: l.line_total_thb != null ? fmtMoney(l.line_total_thb) : "—",
        ship_alloc_thb: l.ship_alloc_thb > 0 ? fmtMoney(l.ship_alloc_thb) : "-",
        landed_unit_thb: l.landed_unit_thb != null ? fmtMoney(l.landed_unit_thb) : "—",
      })),
    }, fileName);
  }, [data, template, h, fileName]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={data ? fileName : undefined} />
      {h && h.status !== "confirmed" && <div className="no-print bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-6 py-2">⚠ ใบนี้ยังเป็นร่าง (ยังไม่ออกเลข) — พิมพ์ได้แต่มีลายน้ำ "ร่าง"</div>}
      <div className="py-6 px-4">
        {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        : error || !data ? <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        : <div className="relative mx-auto" style={{ maxWidth: 840 }}><PrintFrame html={html} fileName={fileName} /></div>}
      </div>
    </div>
  );
}
