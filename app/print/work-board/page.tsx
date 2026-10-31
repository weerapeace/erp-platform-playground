"use client";

/**
 * พิมพ์รายงานจากบอร์ดจ่ายงาน — /print/work-board?type=pending|piece|production|plan|all&group=<ชื่อกลุ่ม>&plan=<id>
 *   ตัวสร้างใบ = lib/work-board-print (เทสต์ได้) · ตั้งค่าหน้าพิมพ์ = ของกลาง lib/list-print + ListPrintPanel (แผงขวา)
 *   ค่าที่ตั้งจำต่อคน ต่อใบ (ตามไปทุกเครื่อง) · แบบของฉัน/ของทีม · ดึงข้อมูลจาก /api/mo/work-board ตัวเดียวกับบอร์ด
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintPanel } from "@/components/report/list-print-panel";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { defaultListPrintSettings, estimateListPages } from "@/lib/list-print";
import {
  WORK_BOARD_PRINT_PRESETS, WORK_BOARD_PRINT_TITLE, WORK_BOARD_SORTS, buildWorkBoardPrint, groupLabelOf, workBoardPrintColumns, workBoardPrintGroups,
  type AssigneeResp, type BoardResp, type MoGroup, type PlanResp, type PrintCompany, type WorkBoardPrintType,
} from "@/lib/work-board-print";

const TYPES: WorkBoardPrintType[] = ["pending", "piece", "production", "plan", "all"];
const PANEL_KEY = "print:panel-open";

function WorkBoardPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { can } = useAuth();
  const typeParam = sp.get("type") as WorkBoardPrintType | null;
  const type: WorkBoardPrintType = typeParam && TYPES.includes(typeParam) ? typeParam : "pending";
  const group = sp.get("group") ?? "__all__";
  const planId = sp.get("plan") ?? "";

  const available = useMemo(() => workBoardPrintColumns(type), [type]);
  const defaults = useMemo(() => defaultListPrintSettings(available, { sortBy: "opened" }), [available]);
  const print = useListPrintSettings({ reportKey: `work-board:${type}`, family: "work-board", available, defaults });
  const s = print.settings;

  // ย้ายค่าเดิมที่เคยจำในเครื่อง (เรียง + คอลัมน์) มาเป็นค่าตั้งใหม่ครั้งเดียว
  useEffect(() => {
    try {
      const oldSort = localStorage.getItem("print:work-board:sort");
      const oldCols = localStorage.getItem("print:work-board:cols");
      if (!oldSort && !oldCols) return;
      const next = { ...print.settings };
      if (oldSort && WORK_BOARD_SORTS.some((o) => o.value === oldSort)) next.sortBy = oldSort;
      if (oldCols) {
        const on = JSON.parse(oldCols) as Record<string, boolean>;
        next.columns = next.columns.map((c) => (c.key in on ? { ...c, on: !!on[c.key] } : c));
      }
      print.setSettings(next);
      localStorage.removeItem("print:work-board:sort");
      localStorage.removeItem("print:work-board:cols");
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(PANEL_KEY) === "0") setPanelOpen(false); } catch { /* ignore */ } }, []);
  const togglePanel = () => setPanelOpen((v) => { try { localStorage.setItem(PANEL_KEY, v ? "0" : "1"); } catch { /* ignore */ } return !v; });

  const [board, setBoard] = useState<BoardResp | null>(null);
  const [moGroups, setMoGroups] = useState<MoGroup[]>([]);
  const [plan, setPlan] = useState<PlanResp | null>(null);
  const [assignees, setAssignees] = useState<AssigneeResp>({ craftsmen: [], dept_wages: {} });
  const [companies, setCompanies] = useState<PrintCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const withStaff = type === "plan" || type === "production" || type === "all";   // ใบที่แยกตามโต๊ะ → โชว์พนักงานในโต๊ะ

  useEffect(() => {
    let on = true;
    Promise.all([
      apiFetch("/api/mo/work-board").then((r) => r.json()),
      apiFetch("/api/mo/groups").then((r) => r.json()).catch(() => ({ data: [] })),
      type === "plan" && planId
        ? apiFetch(`/api/mo/dispatch-plans/${planId}`).then((r) => r.json()).catch(() => ({ data: null }))
        : Promise.resolve({ data: null }),
      withStaff
        ? apiFetch("/api/mo/assignees").then((r) => r.json()).catch(() => ({ craftsmen: [], dept_wages: {} }))
        : Promise.resolve({ craftsmen: [], dept_wages: {} }),
      apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ])
      .then(([b, g, p, a, co]: [BoardResp & { error?: string }, { data?: { name: string; mo_nos: unknown }[] }, { data?: PlanResp | null; error?: string }, AssigneeResp, { data?: PrintCompany[] }]) => {
        if (!on) return;
        if (b.error) throw new Error(b.error);
        setBoard(b);
        setMoGroups((g.data ?? []).map((x) => ({ name: x.name, mo_nos: (Array.isArray(x.mo_nos) ? x.mo_nos : []) as string[] })));
        setAssignees({ craftsmen: a.craftsmen ?? [], dept_wages: a.dept_wages ?? {} });
        setCompanies((co.data ?? []).map((c) => ({ id: c.id, name: c.name, logo_key: c.logo_key ?? null })));
        if (type === "plan") {
          if (!p.data) throw new Error(p.error || "ไม่พบแผนที่เลือก");
          setPlan(p.data);
        }
      })
      .catch((e) => { if (on) setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); });
    return () => { on = false; };
  }, [type, planId, withStaff]);

  const company = companies.find((c) => c.id === s.companyId) ?? null;
  const result = useMemo(() => {
    if (!board || (type === "plan" && !plan)) return null;
    return buildWorkBoardPrint({
      type, group, board, moGroups, plan, assignees, settings: s, company,
      origin: typeof window !== "undefined" ? window.location.origin : "",
      printedAt: new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }),
    });
  }, [board, moGroups, plan, assignees, type, group, s, company]);
  const html = result?.html ?? "";
  const pages = result ? estimateListPages(result.groupCounts, s) : 0;
  const doPrint = () => { if (html) printReportHtmlInNewWindow(html); };

  // กด Ctrl/Cmd+P → เด้งหน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่างเกินจาก iframe)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); if (html) printReportHtmlInNewWindow(html); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  const defaultTitle = WORK_BOARD_PRINT_TITLE[type];
  const subLabel = type === "plan" ? (plan ? `แผน ${plan.name}` : "แผน…") : `กลุ่ม ${groupLabelOf(group)}`;
  const frameWidth = s.orientation === "landscape" ? (s.paper === "A5" ? 840 : 1180) : s.paper === "A5" ? 600 : 840;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        <button onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
          <Icon value="i:arrow-left" /> กลับ
        </button>
        <span className="min-w-0 truncate text-sm text-slate-600"><Icon value="i:printer" className="mr-1.5" />{s.title.trim() || defaultTitle} · {subLabel}</span>
        <div className="flex-1" />
        <button onClick={togglePanel} aria-pressed={panelOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${panelOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:layout-sidebar-right" /> ตั้งค่าหน้าพิมพ์
        </button>
        <button onClick={doPrint} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="flex flex-col items-start gap-4 px-4 py-6 lg:flex-row">
        <div className="w-full min-w-0 flex-1">
          {error ? <div className="py-20 text-center text-red-500"><Icon value="i:alert-triangle" className="mr-1" />{error}</div>
            : !result ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
            : <PrintFrame html={html} maxWidth={frameWidth} onPrint={doPrint} fit />}
        </div>
        {panelOpen && (
          <aside className="no-print order-first w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:order-none lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:w-[330px] lg:overflow-y-auto" aria-label="ตั้งค่าหน้าพิมพ์">
            <ListPrintPanel
              state={print}
              available={available}
              sorts={WORK_BOARD_SORTS}
              groups={workBoardPrintGroups(type)}
              builtinPresets={WORK_BOARD_PRINT_PRESETS}
              companies={companies}
              estimatedPages={pages}
              defaultTitle={defaultTitle}
              canSaveTeam={can("admin.users")}
              signatureHint={type === "production" ? "ผู้ตรวจ / หัวหน้าโต๊ะ" : "ผู้จ่ายงาน / ผู้รับงาน"}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function WorkBoardPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><WorkBoardPrintInner /></Suspense>;
}
