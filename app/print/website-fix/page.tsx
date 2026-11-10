"use client";

/**
 * 🖨 พิมพ์เช็กลิสต์ "ต้องแก้" ของสินค้าบนเว็บ — /print/website-fix?k=<รหัส> (เจ้าของเลือก 2026-11-10: ทั้ง 2 แบบ เริ่มที่ B)
 *   เปิดจากปุ่ม "พิมพ์เช็กลิสต์" หน้า สินค้าบนเว็บ · ข้อมูล = รุ่นตามตัวกรองที่เลือกอยู่ ส่งมาทาง localStorage (WEB_FIX_PRINT_STORE)
 *   ตัวสร้างใบ = lib/website-fix-print (เทสต์ได้) · ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print + ListPrintPanel · JPG = SaveImageButton
 *   ไม่บันทึกประวัติพิมพ์ (เช็กลิสต์พิมพ์ใหม่ได้ทุกครั้งจากตัวกรองล่าสุด — เจ้าของเห็นด้วย 2026-11-10)
 */
import { shortcutKey } from "@/lib/shortcut-key";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintFrame } from "@/components/report/list-print-frame";
import { Check, ListPrintPanel, Section } from "@/components/report/list-print-panel";
import { SaveImageButton } from "@/components/report/save-image-button";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { estimateListPages } from "@/lib/list-print";
import {
  WEB_FIX_GROUPS, WEB_FIX_PRESETS, WEB_FIX_PRINT_GROUPS, WEB_FIX_PRINT_SORTS, WEB_FIX_PRINT_STORE, WEB_FIX_TITLE,
  buildWebFixPrint, webFixColumns, webFixCounts, webFixDefaults, type WebFixGroupKey, type WebFixPayload,
} from "@/lib/website-fix-print";

const PANEL_KEY = "print:panel-open";
type Company = { id: string; name: string; logo_key: string | null };
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function WebFixPrintInner() {
  const sp = useSearchParams();
  const k = sp.get("k") ?? "";
  const [payload, setPayload] = useState<WebFixPayload | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    try {
      const raw = k ? localStorage.getItem(WEB_FIX_PRINT_STORE + k) : null;
      const p = raw ? (JSON.parse(raw) as WebFixPayload) : null;
      if (p && Array.isArray(p.rows)) setPayload(p); else setMissing(true);
    } catch { setMissing(true); }
  }, [k]);
  if (missing) return <div className="min-h-screen bg-slate-100 py-20 text-center text-slate-500"><Icon value="i:alert-triangle" className="mr-1" />ไม่พบรายการที่จะพิมพ์ — กลับไปกด “พิมพ์เช็กลิสต์” จากหน้า สินค้าบนเว็บ อีกครั้ง</div>;
  if (!payload) return <div className="min-h-screen bg-slate-100 py-20 text-center text-slate-400">กำลังโหลด…</div>;
  return <WebFixPrintView payload={payload} />;
}

function WebFixPrintView({ payload }: { payload: WebFixPayload }) {
  const router = useRouter();
  const { can } = useAuth();
  const available = useMemo(() => webFixColumns(), []);
  const defaults = useMemo(() => webFixDefaults(), []);
  const print = useListPrintSettings({ reportKey: "website-fix", family: "website-fix", available, defaults });
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

  // เรื่องที่จะพิมพ์: เปิดจากตัวกรองเรื่องเดียว (เช่น ยังไม่มีรูปบนเว็บเลย) = เรื่องนั้นเรื่องเดียว · ไม่งั้น = ทุกเรื่อง
  const counts = useMemo(() => webFixCounts(payload.rows), [payload]);
  const present = WEB_FIX_GROUPS.filter((g) => counts.get(g.key));
  const [include, setInclude] = useState<Set<WebFixGroupKey>>(() =>
    new Set(payload.focus && counts.get(payload.focus) ? [payload.focus] : present.map((g) => g.key)));
  const toggle = (key: WebFixGroupKey, on: boolean) => setInclude((cur) => { const n = new Set(cur); if (on) n.add(key); else n.delete(key); return n; });

  const result = useMemo(() => buildWebFixPrint({
    rows: payload.rows, settings: s, company, include, shop: payload.shop, scope: payload.scope,
    origin: typeof window !== "undefined" ? window.location.origin : "",
    printedAt: new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" }),
  }), [payload, s, company, include]);
  const html = result.html;
  const pages = estimateListPages(result.groupCounts, s);
  const doPrint = () => { if (html) printReportHtmlInNewWindow(html); };

  // Ctrl/Cmd+P → หน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจ)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "p") { e.preventDefault(); if (html) printReportHtmlInNewWindow(html); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  const frameWidth = s.orientation === "landscape" ? (s.paper === "A5" ? 840 : 1180) : s.paper === "A5" ? 600 : 840;
  const paperPx = s.orientation === "landscape" ? (s.paper === "A5" ? 794 : 1123) : s.paper === "A5" ? 559 : 794;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        <button onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
          <Icon value="i:arrow-left" /> กลับ
        </button>
        <span className="min-w-0 truncate text-sm text-slate-600"><Icon value="i:printer" className="mr-1.5" />{s.title.trim() || WEB_FIX_TITLE} · ร้าน {payload.shop} · {result.models.toLocaleString("th-TH")} รุ่น</span>
        <div className="flex-1" />
        <button onClick={togglePanel} aria-pressed={panelOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${panelOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:layout-sidebar-right" /> ตั้งค่าหน้าพิมพ์
        </button>
        <SaveImageButton html={html} fileName={`${s.title.trim() || WEB_FIX_TITLE} ${payload.shop} ${todayLocal()}`} pageWidthPx={paperPx} />
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
              sorts={WEB_FIX_PRINT_SORTS}
              groups={WEB_FIX_PRINT_GROUPS}
              builtinPresets={WEB_FIX_PRESETS}
              companies={companies}
              estimatedPages={pages}
              defaultTitle={WEB_FIX_TITLE}
              canSaveTeam={can("admin.users")}
              signatureHint="ผู้แก้ / ผู้ตรวจ"
              extra={
                <Section title="เรื่องที่จะพิมพ์" hint={`ตัวกรองที่เลือกไว้: ${payload.scope}`}>
                  <div className="space-y-1">
                    {present.map((g) => (
                      <Check key={g.key} checked={include.has(g.key)} onChange={(v) => toggle(g.key, v)}>
                        {g.label} <span className="text-slate-400">({counts.get(g.key)!.toLocaleString("th-TH")})</span>
                      </Check>
                    ))}
                    {present.length > 1 && (
                      <div className="flex gap-3 pt-1 text-xs">
                        <button type="button" className="text-blue-600 hover:underline" onClick={() => setInclude(new Set(present.map((g) => g.key)))}>เลือกทุกเรื่อง</button>
                        <button type="button" className="text-slate-500 hover:underline" onClick={() => setInclude(new Set())}>ไม่เลือกเลย</button>
                      </div>
                    )}
                  </div>
                </Section>
              }
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function WebFixPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><WebFixPrintInner /></Suspense>;
}
