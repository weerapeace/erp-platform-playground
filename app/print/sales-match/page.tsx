"use client";

/**
 * 🖨 พิมพ์สรุปจับคู่ใบขาย → ใบงาน — /print/sales-match?k=<รหัส>
 *   เปิดจากหน้าต่าง "อัปเดตงานจากใบขาย" (บอร์ดจ่ายงาน) · ข้อมูล = แถวที่หน้าต่างส่งมาทาง localStorage (ตามที่ติ๊ก/เลือกอยู่ตอนกด)
 *   ตัวสร้างใบ = lib/mo-sales-print (เทสต์ได้) · ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print + ListPrintPanel · ประวัติพิมพ์ usePrintLog("sale_line")
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintFrame } from "@/components/report/list-print-frame";
import { ListPrintPanel } from "@/components/report/list-print-panel";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { usePrintLog } from "@/components/report/use-print-log";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { estimateListPages } from "@/lib/list-print";
import {
  SALES_PRINT_GROUPS, SALES_PRINT_PRESETS, SALES_PRINT_SORTS, SALES_PRINT_STORE, SALES_PRINT_TITLE, buildSalesPrint, salesPrintColumns, salesPrintDefaults,
  type SalesPrintPayload,
} from "@/lib/mo-sales-print";

const PANEL_KEY = "print:panel-open";
type Company = { id: string; name: string; logo_key: string | null };

/** อ่านแถวที่หน้าต่างส่งมา แล้วค่อยเปิดหน้าพิมพ์ (ตั้งค่าหน้าพิมพ์จำแยกตามแท็บ — ต้องรู้ชนิดก่อน) */
function SalesMatchPrintInner() {
  const sp = useSearchParams();
  const k = sp.get("k") ?? "";
  const [payload, setPayload] = useState<SalesPrintPayload | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    try {
      const raw = k ? localStorage.getItem(SALES_PRINT_STORE + k) : null;
      const p = raw ? (JSON.parse(raw) as SalesPrintPayload) : null;
      if (p && Array.isArray(p.rows) && (p.kind === "open" || p.kind === "linked")) setPayload(p); else setMissing(true);
    } catch { setMissing(true); }
  }, [k]);
  if (missing) return <div className="min-h-screen bg-slate-100 py-20 text-center text-slate-500"><Icon value="i:alert-triangle" className="mr-1" />ไม่พบรายการที่จะพิมพ์ — กลับไปกด “พิมพ์” จากหน้าต่าง “อัปเดตงานจากใบขาย” อีกครั้ง</div>;
  if (!payload) return <div className="min-h-screen bg-slate-100 py-20 text-center text-slate-400">กำลังโหลด…</div>;
  return <SalesMatchPrintView payload={payload} />;
}

function SalesMatchPrintView({ payload }: { payload: SalesPrintPayload }) {
  const router = useRouter();
  const { can } = useAuth();
  const kind = payload.kind;

  const available = useMemo(() => salesPrintColumns(kind), [kind]);
  const defaults = useMemo(() => salesPrintDefaults(kind), [kind]);
  const print = useListPrintSettings({ reportKey: `sales-match:${kind}`, family: "sales-match", available, defaults });
  const s = print.settings;

  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(PANEL_KEY) === "0") setPanelOpen(false); } catch { /* ignore */ } }, []);
  const togglePanel = () => setPanelOpen((v) => { try { localStorage.setItem(PANEL_KEY, v ? "0" : "1"); } catch { /* ignore */ } return !v; });

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((co: { data?: Company[] }) => setCompanies((co.data ?? []).map((c) => ({ id: c.id, name: c.name, logo_key: c.logo_key ?? null }))));
  }, []);
  const company = companies.find((c) => c.id === s.companyId) ?? null;

  // แท็บยังไม่ผูก: ทุกบรรทัด (ทุกใบขาย — ค่าเริ่ม) / เฉพาะที่ติ๊ก
  const [onlyTicked, setOnlyTicked] = useState(false);
  const tickedN = payload.rows.filter((r) => r.ticked).length;
  const result = useMemo(() => buildSalesPrint({
    kind, rows: payload.rows, settings: s, company, onlyTicked: kind === "open" && onlyTicked,
    origin: typeof window !== "undefined" ? window.location.origin : "",
    printedAt: new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" }),
  }), [payload, kind, s, company, onlyTicked]);
  const html = result.html;
  const pages = estimateListPages(result.groupCounts, s);
  // ประวัติพิมพ์: 1 บรรทัดใบขาย = 1 รายการ (เฉพาะที่อยู่ในใบ)
  const logItems = useMemo(() => payload.rows.filter((r) => !(kind === "open" && onlyTicked) || r.ticked)
    .map((r) => ({ doc_id: r.line_id, doc_no: r.so_number, qty: r.qty })), [payload, kind, onlyTicked]);
  usePrintLog("sale_line", logItems);
  const doPrint = () => { if (html) printReportHtmlInNewWindow(html); };

  // กด Ctrl/Cmd+P → เด้งหน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่างเกินจาก iframe)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); if (html) printReportHtmlInNewWindow(html); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  const defaultTitle = SALES_PRINT_TITLE[kind];
  const frameWidth = s.orientation === "landscape" ? (s.paper === "A5" ? 840 : 1180) : s.paper === "A5" ? 600 : 840;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        <button onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
          <Icon value="i:arrow-left" /> กลับ
        </button>
        <span className="min-w-0 truncate text-sm text-slate-600"><Icon value="i:printer" className="mr-1.5" />{s.title.trim() || defaultTitle} · {kind === "open" && onlyTicked ? tickedN : payload.rows.length} บรรทัด</span>
        {kind === "open" && (
          <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
            {([[false, `ทุกใบขาย (${payload.rows.length})`], [true, `เฉพาะที่ติ๊ก (${tickedN})`]] as const).map(([v, label]) => (
              <button key={String(v)} type="button" onClick={() => setOnlyTicked(v)}
                className={`h-9 px-3 text-sm ${onlyTicked === v ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </span>
        )}
        <div className="flex-1" />
        <button onClick={togglePanel} aria-pressed={panelOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${panelOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:layout-sidebar-right" /> ตั้งค่าหน้าพิมพ์
        </button>
        <button onClick={doPrint} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="flex flex-col items-start gap-4 px-4 py-6 lg:flex-row">
        <div className="w-full min-w-0 flex-1">
          <ListPrintFrame html={html} state={print} maxWidth={frameWidth} onPrint={doPrint} />
        </div>
        {panelOpen && (
          <aside className="no-print order-first w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:order-none lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:w-[330px] lg:overflow-y-auto" aria-label="ตั้งค่าหน้าพิมพ์">
            <ListPrintPanel
              state={print}
              available={available}
              sorts={SALES_PRINT_SORTS}
              groups={SALES_PRINT_GROUPS}
              builtinPresets={SALES_PRINT_PRESETS}
              companies={companies}
              estimatedPages={pages}
              defaultTitle={defaultTitle}
              canSaveTeam={can("admin.users")}
              signatureHint="ผู้จับคู่ / ผู้ตรวจ"
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function SalesMatchPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><SalesMatchPrintInner /></Suspense>;
}
