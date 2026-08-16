"use client";

/**
 * พิมพ์ "ใบตีราคาสินค้าสั่งจากร้าน" — เอกสารภายใน (มีต้นทุน/กำไร/ส่วนแบ่ง)
 *
 * ข้อมูล: /api/design-sheets/[id]/supplier-lines + ใบงาน + เรตกลาง (หยวน/ค่าส่ง)
 * เทมเพลตกลาง erp_report_templates entity_type='design_sheet_supplier' (แก้ที่ /admin/report-templates)
 * สูตรทุกช่องมาจากของกลาง lib/supplier-quote (ตัวเดียวกับหน้าจอ — เลขตรงกันเสมอ)
 *
 * 🔒 มีต้นทุน/กำไร → เปิดได้เฉพาะคนที่มีสิทธิ์ products.cost.view
 * กรองตามไซส์ (?parent=) ได้เหมือนใบตีราคาต้นทุน
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { usePermission } from "@/components/auth";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import {
  calcSupplierLine, sumSupplierLines, splitAmount, fmtBaht, fmtNum,
  DEFAULT_FREIGHT, DEFAULT_FX, type SupplierLine, type FreightRates, type ProfitSplit,
} from "@/lib/supplier-quote";

const ALL = "__ALL__";
const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";
const pkey = (s: string | null | undefined) => s ?? "";

type Sheet = Record<string, unknown> & { brand?: { name?: string } | Array<{ name?: string }> | null };

function buildData(sheet: Sheet, lines: SupplierLine[], splits: ProfitSplit[], fx: number, rates: FreightRates, sizeLabel: string | null) {
  const brand = (Array.isArray(sheet.brand) ? sheet.brand[0] : sheet.brand) as { name?: string } | null;
  const t = sumSupplierLines(lines, fx, rates);
  const sheetSplit = splitAmount(splits, t.profitAfterLine);

  return {
    code: sheet.code ?? "", name: sheet.name ?? "",
    brand_name: brand?.name ?? "—",
    print_date_th: thaiDate(new Date().toISOString()),
    size_label: sizeLabel ?? "",
    lines: lines.map((l) => {
      const c = calcSupplierLine(l, fx, rates);
      const offer = Number(l.offer_price) || 0;
      return {
        item_name: `${l.in_total === false ? "(ไม่รวมยอด) " : ""}${l.item_name ?? "—"}`,
        supplier_name: l.supplier_name ?? "—",
        price_src: `${fmtBaht(Number(l.price) || 0)} ${l.currency === "CNY" ? "¥" : "฿"}${l.price_unit === "pack" ? `/แพ็ค(${fmtNum(l.pack_qty ?? 1)})` : ""}`,
        price_baht: fmtBaht(c.priceBaht),
        freight_pc: fmtBaht(c.freightPerPc),
        cost_pc: fmtBaht(c.costPerPc),
        qty: fmtNum(Number(l.qty) || 0),
        offer: fmtBaht(offer),
        margin_pc: `${fmtBaht(c.profitPerPc)}${offer > 0 ? ` (${((c.profitPerPc / offer) * 100).toFixed(1)}%)` : ""}`,
        sale_total: fmtBaht(c.saleTotal),
        profit_total: fmtBaht(c.profitTotal),
        margin_cls: c.profitPerPc >= 0 ? "ok" : "bad",
      };
    }),
    no_lines: lines.length === 0,
    counted_note: t.lines < t.linesAll ? `นับรวม ${t.lines}/${t.linesAll} รายการ (ที่ขึ้น "ไม่รวมยอด" ไม่ถูกนับ)` : "",
    total_qty: fmtNum(t.qty), total_cbm: t.cbm.toFixed(3),
    total_freight: `${fmtBaht(t.freight)} ฿`, total_cost: `${fmtBaht(t.cost)} ฿`,
    total_sale: `${fmtBaht(t.sale)} ฿`, total_profit: `${fmtBaht(t.profit)} ฿`,
    total_split: `${fmtBaht(t.splitLine + sheetSplit)} ฿`,
    net_profit: `${fmtBaht(t.profitAfterLine - sheetSplit)} ฿`,
    has_splits: (t.splitLine + sheetSplit) > 0,
    splits: [
      ...lines.flatMap((l) => (l.split_json ?? []).filter((s) => s.on !== false).map((s) => {
        const c = calcSupplierLine(l, fx, rates);
        return { name: s.name || "ไม่ระบุชื่อ", basis: `${l.item_name ?? "รายการ"} · ${s.type === "pct" ? `${s.value}%` : "จำนวนเงิน"}`,
          amount: `${fmtBaht(s.type === "pct" ? c.profitTotal * (Number(s.value) || 0) / 100 : (Number(s.value) || 0))} ฿` };
      })),
      ...splits.filter((s) => s.on !== false).map((s) => ({
        name: s.name || "ไม่ระบุชื่อ", basis: s.type === "pct" ? `ทั้งใบ ${s.value}%` : "ทั้งใบ · จำนวนเงิน",
        amount: `${fmtBaht(s.type === "pct" ? t.profitAfterLine * (Number(s.value) || 0) / 100 : (Number(s.value) || 0))} ฿`,
      })),
    ],
  };
}

export default function PrintSupplierQuotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const canSeeCost = usePermission("products.cost.view");

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [lines, setLines] = useState<SupplierLine[]>([]);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [fx, setFx] = useState(DEFAULT_FX);
  const [rates, setRates] = useState<FreightRates>(DEFAULT_FREIGHT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(ALL);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("parent");
    if (p != null) setSel(p);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/design-sheets/${id}`).then((r) => r.json()),
      apiFetch(`/api/design-sheets/${id}/supplier-lines`).then((r) => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=design_sheet_supplier").then((r) => r.json()),
      apiFetch("/api/ui-config?key=rmb_to_thb_rate").then((r) => r.json()).catch(() => ({})),
      apiFetch("/api/ui-config?key=design_freight_rates").then((r) => r.json()).catch(() => ({})),
    ]).then(([sRes, lRes, tRes, fxRes, frRes]) => {
      if (sRes.error) throw new Error(sRes.error);
      setSheet(sRes.data as Sheet);
      if (!lRes.error) setLines((lRes.data ?? []) as SupplierLine[]);
      const tpls = ((tRes as ReportTemplatesResponse).data ?? []).filter((t) => t.active);
      setTemplate(tpls.find((t) => t.is_default) ?? tpls[0] ?? null);
      const rr = Number((fxRes?.value ?? {}).rate); if (Number.isFinite(rr) && rr > 0) setFx(rr);
      const g = (frRes?.value ?? {}) as Partial<FreightRates>;
      setRates({ truck: Number(g.truck) > 0 ? Number(g.truck) : DEFAULT_FREIGHT.truck, ship: Number(g.ship) > 0 ? Number(g.ship) : DEFAULT_FREIGHT.ship });
    }).catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) { const k = pkey(l.parent_code); counts.set(k, (counts.get(k) ?? 0) + 1); }
    return [...counts.entries()].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])))
      .map(([key, count]) => ({ key, label: key === "" ? "ทั่วไป" : key, count }));
  }, [lines]);
  const shown = useMemo(() => (sel === ALL ? lines : lines.filter((l) => pkey(l.parent_code) === sel)), [lines, sel]);

  const html = useMemo(() => {
    if (!sheet || !template) return "";
    const allSplits = (sheet.profit_splits ?? {}) as Record<string, ProfitSplit[]>;
    const splits = sel === ALL ? Object.values(allSplits).flat() : (allSplits[sel] ?? []);
    return buildReportHtml(
      { paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css },
      buildData(sheet, shown, splits, fx, rates, sel === ALL ? null : (sel === "" ? "ทั่วไป" : sel)),
    );
  }, [sheet, shown, template, sel, fx, rates]);

  if (!canSeeCost) {
    return (
      <div className="min-h-screen bg-slate-100">
        <PrintToolbar onBack={() => router.back()} fileName="" />
        <div className="py-20 text-center text-amber-700">🔒 ใบนี้มีต้นทุนและกำไร — ต้องมีสิทธิ์ &ldquo;ดูราคาต้นทุน&rdquo; จึงจะเปิดได้</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={docFileName("ใบตีราคาสั่งจากร้าน", sheet ? String(sheet.code ?? "") : null)} />
      <div className="px-4 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          : error || !sheet ? <div className="py-20 text-center text-red-500">⚠️ {error ?? "ไม่พบใบงาน"}</div>
          : !template ? (
            <div className="py-20 text-center text-amber-600">
              ⚠️ ยังไม่มี template ใบตีราคาสั่งจากร้าน — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
            </div>
          ) : (
            <>
              <div className="no-print mx-auto mb-4 max-w-[1000px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                🔒 เอกสารภายใน — มีต้นทุนและกำไร <b>อย่าส่งให้ลูกค้า</b> (ใบเสนอราคาลูกค้าใช้ปุ่ม &ldquo;ส่งไปใบเสนอราคา&rdquo;)
              </div>
              {tabs.length > 1 && (
                <div className="no-print mx-auto mb-4 flex max-w-[1000px] flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <span className="mr-1 text-sm font-medium text-slate-700">📐 เลือกไซส์ที่จะพิมพ์:</span>
                  <button onClick={() => setSel(ALL)}
                    className={`h-8 rounded-lg border px-3 text-sm ${sel === ALL ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    ทั้งหมด <span className="text-xs text-slate-400">({lines.length})</span>
                  </button>
                  {tabs.map((t) => (
                    <button key={t.key} onClick={() => setSel(t.key)}
                      className={`h-8 rounded-lg border px-3 text-sm ${sel === t.key ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      {t.label} <span className="text-xs text-slate-400">({t.count})</span>
                    </button>
                  ))}
                </div>
              )}
              <PrintFrame html={html} maxWidth={1000} fileName={docFileName("ใบตีราคาสั่งจากร้าน", sheet ? String(sheet.code ?? "") : null)} />
            </>
          )}
      </div>
    </div>
  );
}
