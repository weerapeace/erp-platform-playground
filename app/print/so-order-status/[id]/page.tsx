"use client";

/**
 * 🖨 ใบเช็กสถานะใบสั่งขาย — /print/so-order-status/<id> (เปิดจากป๊อปใบสั่งขาย ปุ่ม "พิมพ์ใบเช็กสถานะ")
 *   ตัวสร้างใบ = lib/so-status-print (เทสต์ได้) · ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print + ListPrintPanel (จำต่อคน · แบบของฉัน/ทีม)
 *   ข้อมูล = GET /api/so-orders/<id>?print=1 · ประวัติพิมพ์ usePrintLog("so_order")
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintFrame } from "@/components/report/list-print-frame";
import { Check, ListPrintPanel, Section } from "@/components/report/list-print-panel";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { usePrintLog } from "@/components/report/use-print-log";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { estimateListPages } from "@/lib/list-print";
import { SO_LINE_STAGES, type SoLineStage } from "@/lib/so-order-stage";
import {
  SO_STATUS_GROUPS, SO_STATUS_PRESETS, SO_STATUS_SORTS, SO_STATUS_STAGE_QUICK, SO_STATUS_TITLE,
  buildSoStatusPrint, soStatusColumns, soStatusDefaults, soStatusInputFromApi, soStatusOpts,
  type SoStatusInput, type SoStatusOpts,
} from "@/lib/so-status-print";

const PANEL_KEY = "print:panel-open";
type Company = { id: string; name: string; logo_key: string | null; company_code?: string | null };
const chip = (on: boolean) => `inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors ${on ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

export default function SoOrderStatusPrintPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const available = useMemo(() => soStatusColumns(), []);
  const defaults = useMemo(() => soStatusDefaults(), []);
  const print = useListPrintSettings({ reportKey: "so-order-status", family: "so-order-status", available, defaults });
  const s = print.settings;
  const o = soStatusOpts(s);
  const setOpts = (patch: Partial<SoStatusOpts>) => print.setSettings({ ...s, opts: { ...s.opts, ...patch } });

  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(PANEL_KEY) === "0") setPanelOpen(false); } catch { /* ignore */ } }, []);
  const togglePanel = () => setPanelOpen((v) => { try { localStorage.setItem(PANEL_KEY, v ? "0" : "1"); } catch { /* ignore */ } return !v; });

  // ---- ข้อมูล ----
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null); setRaw(null);
    try {
      const r = await apiFetch(`/api/so-orders/${encodeURIComponent(id)}?print=1`);
      const j = (await r.json().catch(() => ({}))) as { data?: Record<string, unknown> | null; error?: string };
      if (r.status === 401 || r.status === 403) throw new Error("ไม่มีสิทธิ์ดูใบสั่งขายนี้");
      if (r.status === 404 || !j.data) throw new Error("ไม่พบใบสั่งขาย — อาจถูกลบไปแล้ว");
      if (!r.ok) throw new Error("โหลดใบสั่งขายไม่สำเร็จ");
      setRaw(j.data);
    } catch (e) { setError((e as Error).message || "โหลดใบสั่งขายไม่สำเร็จ"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((co: { data?: Company[] }) => setCompanies((co.data ?? []).map((c) => ({ id: c.id, name: c.name, logo_key: c.logo_key ?? null, company_code: c.company_code ?? null }))));
  }, []);
  const company = companies.find((c) => c.id === s.companyId) ?? null;
  const seller = raw ? companies.find((c) => c.company_code && c.company_code === raw.company_code)?.name ?? ((raw.company_code as string) || null) : null;

  const input: SoStatusInput | null = useMemo(() => (raw ? soStatusInputFromApi(raw, seller) : null), [raw, seller]);
  const result = useMemo(() => (input ? buildSoStatusPrint({
    ...input, settings: s, company,
    origin: typeof window !== "undefined" ? window.location.origin : "",
    printedAt: new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" }),
  }) : null), [input, s, company]);
  const html = result?.html ?? "";
  const pages = estimateListPages(result?.groupCounts ?? [0], s);

  // ประวัติพิมพ์: 1 ใบสั่งขาย = 1 รายการ (จำนวน = ชิ้นรวมทั้งใบ)
  const logItems = useMemo(() => (input && raw ? [{ doc_id: String(raw.id ?? id), doc_no: input.header.order_no, qty: input.lines.reduce((a, l) => a + l.qty, 0) }] : []), [input, raw, id]);
  usePrintLog("so_order", logItems);
  const doPrint = useCallback(() => { if (html) printReportHtmlInNewWindow(html); }, [html]);

  // Ctrl/Cmd+P → หน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่างเกินจาก iframe)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); doPrint(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doPrint]);

  const frameWidth = s.orientation === "landscape" ? (s.paper === "A5" ? 840 : 1180) : s.paper === "A5" ? 600 : 840;
  const stageCount = (st: SoLineStage) => input?.lines.filter((l) => l.stage === st).length ?? 0;
  const toggleStage = (st: SoLineStage) => setOpts({ stages: o.stages.includes(st) ? o.stages.filter((x) => x !== st) : [...o.stages, st].sort() });
  const same = (a: SoLineStage[], b: SoLineStage[]) => a.length === b.length && a.every((x) => b.includes(x));

  const extra = (
    <>
      <Section title="พิมพ์ขั้นไหนบ้าง" hint="กดเปิด/ปิด">
        <div className="flex flex-wrap gap-1.5">
          {SO_LINE_STAGES.map((st) => (
            <button key={st.key} type="button" aria-pressed={o.stages.includes(st.key)} onClick={() => toggleStage(st.key)} className={chip(o.stages.includes(st.key))}>
              {st.label} ({stageCount(st.key)})
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-500">แบบด่วน</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {SO_STATUS_STAGE_QUICK.map((q) => <button key={q.id} type="button" onClick={() => setOpts({ stages: [...q.stages] })} className={chip(same(o.stages, q.stages))}>{q.label}</button>)}
        </div>
      </Section>
      <Section title="หัวใบ">
        <Check checked={o.summary} onChange={(summary) => setOpts({ summary })}>กล่องตัวเลข 5 ขั้น</Check>
        <Check checked={o.warn} onChange={(warn) => setOpts({ warn })}>กล่อง “จุดที่ระบบเห็นว่าควรเช็ก”</Check>
        <Check checked={o.flags} onChange={(flags) => setOpts({ flags })}>ข้อความ “ต้องเช็ก” ใต้ชื่อสินค้า</Check>
        <Check checked={o.checker} onChange={(checker) => setOpts({ checker })}>ช่อง ผู้ตรวจ / วันที่ตรวจ (มุมขวาบน)</Check>
      </Section>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        <button onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
          <Icon value="i:arrow-left" /> กลับ
        </button>
        <span className="min-w-0 truncate text-sm text-slate-600">
          <Icon value="i:printer" className="mr-1.5" />{s.title.trim() || SO_STATUS_TITLE}{input ? ` · ${input.header.order_no} · ${result?.count ?? 0} รายการ` : ""}
        </span>
        <div className="flex-1" />
        <button onClick={togglePanel} aria-pressed={panelOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${panelOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:layout-sidebar-right" /> ตั้งค่าหน้าพิมพ์
        </button>
        <button onClick={doPrint} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="flex flex-col items-start gap-4 px-4 py-6 lg:flex-row">
        <div className="w-full min-w-0 flex-1">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-white py-16 text-center text-sm text-red-600">
              <Icon value="i:alert-triangle" className="mr-1" />{error}
              <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button>
            </div>
          ) : !input ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">กำลังโหลดใบสั่งขาย…</div>
          ) : input.lines.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">ใบสั่งขายนี้ยังไม่มีรายการสินค้า</div>
          ) : (
            <ListPrintFrame html={html} state={print} maxWidth={frameWidth} onPrint={doPrint} />
          )}
        </div>
        {panelOpen && (
          <aside className="no-print order-first w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:order-none lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:w-[340px] lg:overflow-y-auto" aria-label="ตั้งค่าหน้าพิมพ์">
            <ListPrintPanel
              state={print}
              available={available}
              sorts={SO_STATUS_SORTS}
              groups={SO_STATUS_GROUPS}
              builtinPresets={SO_STATUS_PRESETS}
              companies={companies}
              estimatedPages={pages}
              defaultTitle={SO_STATUS_TITLE}
              canSaveTeam={can("admin.users")}
              signatureHint="ผู้ตรวจนับ / หัวหน้าผลิต / ผู้คีย์เข้าระบบ"
              extra={extra}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
