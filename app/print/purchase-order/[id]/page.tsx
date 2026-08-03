"use client";

/**
 * พิมพ์ใบสั่งซื้อ — /print/purchase-order/<id>
 *
 * ⚠️ เดิมหน้านี้อ่านจากระบบจัดซื้อชุดเก่า (erp_playground_purchase_orders ซึ่งว่างเปล่า 0 แถว)
 *    ทำให้ปุ่ม "พิมพ์" หลังสร้างใบสั่งซื้อขึ้น "ไม่พบเอกสาร" ทุกครั้ง
 *    ตอนนี้อ่านใบจริง (purchase_orders_v2) ก่อน แล้วค่อย fallback ระบบเก่า
 *
 * มี QR ชี้หน้ากลาง /s/<เลขใบ> → พิมพ์แขวนไว้ที่โต๊ะรับของ พนักงานส่องมือถือเปิดใบนี้ได้เลย
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtml } from "@/lib/template";
import { scanUrl, scanQrHtml } from "@/lib/scan-code";
import { thaiBahtText } from "@/lib/quotation-print";
import type { PoDetail } from "@/app/api/purchasing/po-detail/route";
import type { PODetail } from "@/app/api/purchase-orders/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", received: "รับของแล้ว",
  completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
  unpaid: "รอจ่าย", paid: "จ่ายแล้ว", partial: "รับบางส่วน",
};

const CURRENCY_SYMBOL: Record<string, string> = { THB: "฿", RMB: "¥", YUAN: "¥", CNY: "¥", USD: "$" };

/** ตัวเลือกการแสดงผลบนใบ — จำต่อเครื่อง (ไม่ผูกกับใบใดใบหนึ่ง) */
const PRINT_OPTS_KEY = "po_print_opts";

const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

type PoView = { poNumber: string; data: Record<string, unknown> };

/** ใบสั่งซื้อจริง (purchase_orders_v2) */
function viewFromV2(po: PoDetail): PoView {
  const cur = String(po.currency ?? "THB").toUpperCase();
  const symbol = CURRENCY_SYMBOL[cur] ?? "";
  const isTHB = cur === "THB" || !cur;
  const hasVat = Number(po.vat_rate) > 0;
  const subtotal = po.subtotal;          // ยอดก่อนภาษี (คิดจาก lib/po-total ฝั่ง API)
  const grand = subtotal + po.vat_amount;
  const si = po.seller_info;
  return {
    poNumber: po.po_no,
    data: {
      po_number:       po.po_no,
      status_label:    STATUS_LABELS[String(po.payment_status ?? "")] ?? (po.payment_status ?? "—"),
      // ชื่อบนเอกสารต้องเป็น "ชื่อบริษัทตามทะเบียน" ก่อน — ชื่อเล่นร้านใช้เฉพาะตอนยังไม่ได้กรอก
      supplier_name:   si?.company_name || po.seller || "—",
      supplier_code:   "",
      supplier_address: si?.address_full || si?.address || "",
      supplier_phone:  si?.phone ?? "",
      supplier_tax_id: si?.tax_id_full ?? "",
      payment_terms:   si?.payment_terms ?? "",
      warehouse_name:  "",
      warehouse_code:  "",
      buyer_name:      "",
      order_date_th:   thaiDate(po.order_date),
      order_date_iso:  po.order_date ?? "",
      arrival_date_th: thaiDate(po.expected_date),
      note:            po.note ?? "",
      currency_symbol: symbol,
      currency_code:   cur === "YUAN" ? "RMB" : cur,
      is_foreign:      isTHB ? "" : "1",
      vat_rate:        hasVat ? String(po.vat_rate) : "",
      vat_rate_label:  hasVat ? `${po.vat_rate}%${po.vat_included ? " (รวมในราคาแล้ว)" : ""}` : "",
      subtotal:        money(subtotal),
      taxable:         money(subtotal),
      total_vat:       hasVat ? money(po.vat_amount) : "",
      total_wht:       "",
      has_wht:         "",
      show_due:        "",
      grand_total:     money(grand),
      amount_due:      money(grand),
      // ตัวอักษรกำกับยอดเงิน — เฉพาะสกุลบาท (ของกลาง lib/quotation-print)
      amount_in_words: isTHB ? thaiBahtText(grand) : "",
      line_count:      String(po.lines.length),
      lines: po.lines.map((l, i) => ({
        idx:          i + 1,
        sku:          l.sku ?? "",
        product_name: l.name,
        qty:          Number(l.qty).toLocaleString("th-TH"),
        unit:         l.uom ?? "",
        unit_price:   money(l.price),
        line_total:   money(l.total),
      })),
    },
  };
}

/** ระบบจัดซื้อชุดเก่า (ยังไม่มีข้อมูลจริง แต่เก็บไว้กันหน้าเดิมพัง) */
function viewFromLegacy(po: PODetail): PoView {
  return {
    poNumber: po.po_number ?? "",
    data: {
      po_number:       po.po_number ?? "(ยังไม่ออกเลข)",
      status_label:    STATUS_LABELS[po.status] ?? po.status,
      supplier_name:   po.supplier_name ?? "—",
      supplier_code:   po.supplier_code ?? "",
      warehouse_name:  po.to_warehouse_name ?? "",
      warehouse_code:  po.to_warehouse_code ?? "",
      buyer_name:      po.buyer_name ?? "",
      supplier_address: "",
      supplier_phone:  "",
      supplier_tax_id: "",
      payment_terms:   "",
      order_date_iso:  po.order_date ?? "",
      is_foreign:      "",
      vat_rate:        String(po.vat_rate ?? ""),
      subtotal:        money(po.taxable),
      amount_in_words: thaiBahtText(po.grand_total),
      line_count:      String(po.lines.length),
      order_date_th:   thaiDate(po.order_date),
      arrival_date_th: thaiDate(po.expected_arrival_date),
      note:            po.note ?? "",
      currency_symbol: "฿",
      currency_code:   "THB",
      vat_rate_label:  po.vat_included ? `${po.vat_rate}% รวมแล้ว` : `${po.vat_rate}%`,
      taxable:         money(po.taxable),
      total_vat:       money(po.total_vat),
      total_wht:       money(po.total_wht),
      has_wht:         po.total_wht > 0 ? "1" : "",
      show_due:        "1",
      grand_total:     money(po.grand_total),
      amount_due:      money(po.amount_due),
      lines: po.lines.map((l, i) => ({
        idx:          i + 1,
        sku:          l.sku ?? "",
        product_name: l.product_name,
        qty:          Number(l.qty).toLocaleString("th-TH"),
        unit:         l.unit,
        unit_price:   money(l.unit_price),
        line_total:   money(l.line_total ?? 0),
      })),
    },
  };
}

export default function PrintPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [view, setView] = useState<PoView | null>(null);
  const [qrHtml, setQrHtml] = useState("");
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * ตัวเลือก "แสดงบนใบ" — จำค่าไว้ในเครื่อง (ตั้งครั้งเดียว ใช้ทุกใบ)
   * QR ปิดเป็นค่าเริ่มต้นตามที่เจ้าของสั่ง — เปิดได้ถ้าจะพิมพ์ใบไว้สแกนรับของที่โกดัง
   */
  const [showQr, setShowQr] = useState(false);
  const [showTerms, setShowTerms] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRINT_OPTS_KEY);
      if (raw) {
        const o = JSON.parse(raw) as { qr?: boolean; terms?: boolean };
        if (typeof o.qr === "boolean") setShowQr(o.qr);
        if (typeof o.terms === "boolean") setShowTerms(o.terms);
      }
    } catch { /* ไม่มีค่าเก่า = ใช้ค่าเริ่มต้น */ }
  }, []);
  const setOpt = (patch: { qr?: boolean; terms?: boolean }) => {
    const next = { qr: patch.qr ?? showQr, terms: patch.terms ?? showTerms };
    setShowQr(next.qr); setShowTerms(next.terms);
    try { localStorage.setItem(PRINT_OPTS_KEY, JSON.stringify(next)); } catch { /* โควตาเต็ม = ข้าม */ }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const tplPromise = apiFetch("/api/admin/report-templates?entity_type=po").then((r) => r.json());

        // 1) ใบจริง (v2)
        let next: PoView | null = null;
        const v2 = await apiFetch(`/api/purchasing/po-detail?id=${encodeURIComponent(id)}`)
          .then((r) => r.json()).catch(() => null) as { data?: PoDetail; error?: string } | null;
        if (v2?.data) next = viewFromV2(v2.data);

        // 2) ระบบเก่า (เผื่อมีใบค้างอยู่)
        if (!next) {
          const legacy = await apiFetch(`/api/purchase-orders/${id}`)
            .then((r) => r.json()).catch(() => null) as { data?: PODetail; error?: string } | null;
          if (legacy?.data) next = viewFromLegacy(legacy.data);
        }

        const tplRes = (await tplPromise) as ReportTemplatesResponse;
        if (cancelled) return;

        if (!next) { setError("ไม่พบใบสั่งซื้อนี้"); return; }

        const tpls = tplRes.data?.filter((t) => t.active) ?? [];
        setTemplate(tpls.find((t) => t.is_default) ?? tpls[0] ?? null);
        setView(next);

        const qr = await scanQrHtml(scanUrl(next.poNumber || id), { className: "po-qr", alt: "QR ใบสั่งซื้อ" });
        if (!cancelled) setQrHtml(qr);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "โหลดไม่ได้");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  // ชื่อไฟล์ตอนบันทึก PDF — "ใบสั่งซื้อ - PO-2026-00070" (ของกลาง lib/print-filename)
  const fileName = docFileName("ใบสั่งซื้อ", view?.poNumber);

  const html = useMemo(() => {
    if (!view || !template) return "";
    return buildReportHtml(
      {
        paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css,
      },
      {
        ...view.data,
        qr_html: showQr ? qrHtml : "",
        // เทมเพลตห่อบรรทัดนี้ด้วย {{#show_payment_terms}} → ส่ง "" = ซ่อนทั้งบรรทัด
        show_payment_terms: showTerms && view.data.payment_terms ? "1" : "",
      },
      docFileName("ใบสั่งซื้อ", view.poNumber),
    );
  }, [view, template, qrHtml, showQr, showTerms]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={view ? fileName : undefined} />
      {/* แถบ "แสดงบนใบ" — ไม่ติดไปตอนพิมพ์ (no-print) · จำค่าไว้ในเครื่อง */}
      <div className="no-print flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-6 py-2.5">
        <span className="text-xs font-medium text-slate-400">แสดงบนใบ</span>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={showTerms} onChange={(e) => setOpt({ terms: e.target.checked })} className="rounded border-slate-300" />
          เงื่อนไขชำระเงิน
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={showQr} onChange={(e) => setOpt({ qr: e.target.checked })} className="rounded border-slate-300" />
          QR สแกน
          <span className="text-[11px] text-slate-400">(สำหรับพิมพ์ไว้สแกนรับของ — ใบที่ส่งซัพไม่ต้องมี)</span>
        </label>
      </div>
      <div className="py-6 px-4">
        {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
         : error || !view ? <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
         : !template ? <div className="text-center py-20 text-amber-600">⚠️ ยังไม่มี template สำหรับ PO</div>
         : (
          <PrintFrame html={html} fileName={fileName} />
        )}
      </div>
    </div>
  );
}
