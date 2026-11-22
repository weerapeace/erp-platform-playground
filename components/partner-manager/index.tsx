"use client";

// ============================================================
// PartnerManager (ของกลาง) — หน้า Partner: ลูกค้า + ผู้จำหน่าย (partners_v2)
//   list (ออกแบบใหม่ 2026-11-22 · เจ้าของเลือกแบบ A ตารางแน่น): การ์ดสรุป + แท็บประเภท + ตารางกลาง DataTable
//     (ค้น/กรอง/มุมมองที่บันทึก/จัดคอลัมน์/ส่งออก/การ์ดบนมือถือ) · สรุปต่อรายจาก /api/partners/summary
//     ป้าย "น่าจะเป็นผู้จำหน่าย" (lib/partner-insights) · แก้หลายรายผ่าน bulk-update + ย้อนกลับ · ถังขยะ = is_active false กู้คืนได้
//     ยอดค้าง/ครบกำหนด/วงเงิน = เฉพาะสิทธิ์ cashflow.view
//   แท็บ "⚠️ ข้อมูลไม่ครบ" (ย้ายมาจากหน้า /master/partner-data-check 2026-11-11 · ลิงก์ ?tab=incomplete)
//     → กดแถวเปิดป๊อปบนหน้านี้ มีกล่องเติมเฉพาะช่องที่ขาด + ข้ามไปรายถัดไป · กติกา lib/partner-data-check
//   drawer: ดู (view) + แก้ไข/เพิ่ม (form) · โซนร้านจีนเฉพาะผู้ขาย
//   บันทึกผ่าน master-v2 กลาง (POST/PATCH) → เคารพ field permission + audit
// ============================================================

import { useState, useEffect, useMemo, useCallback, Fragment, type ReactNode } from "react";
import { createPortal } from "react-dom";
import nextDynamic from "next/dynamic";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type BulkAction, type DataTableView, type RowAction } from "@/components/data-table";
import { AppLogo, LogoPicker } from "@/components/logo-picker";
import { formatDate } from "@/lib/date";
import { todayTH } from "@/lib/partner-insights";
import type { PartnerSummaryRow } from "@/app/api/partners/summary/route";
import { apiFetch } from "@/lib/api";
import { useOpenParam, useNewParam } from "@/lib/open-param";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { Spinner } from "@/components/spinner";
import { Pager } from "@/components/pager";
import { ConfirmDialog } from "@/components/modal";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { PurchaseLeadTimeInput } from "@/components/purchase-lead-time-input";
import { formatCreditTerm, formatLeadTime, salesCreditTermOf } from "@/lib/credit-term";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { shopNameSimilarity } from "@/lib/partner-match";
import { checkRow, isChinaPartner, isIncomplete, partnerGaps, sortCheckRows, type PartnerCheckRow } from "@/lib/partner-data-check";
import { PartnerIncompleteTab } from "./incomplete-tab";
import { PartnerQuickFix } from "./quick-fix";

// drawer รายละเอียด record ของกลาง (คลิกวัตถุดิบ → เปิด SKU ตัวจริง) — โหลดเฉพาะตอนใช้
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
// popup สแกนร้านซ้ำ — โหลดเฉพาะตอนกดใช้
const RecordHistoryDrawer = nextDynamic(() => import("@/components/activity-feed/record-history-drawer").then((m) => m.RecordHistoryDrawer), { ssr: false });
const DuplicateScanModal = nextDynamic(() => import("./duplicate-scan").then((m) => m.DuplicateScanModal), { ssr: false });

type Partner = Record<string, unknown> & { id: string };
type Tab = "all" | "customer" | "supplier" | "china" | "suspect" | "incomplete" | "trash";
type Mode = "view" | "edit" | "create";

const s = (p: Partner | null, k: string): string => { const v = p?.[k]; return v == null ? "" : String(v); };
const b = (p: Partner | null, k: string): boolean => p?.[k] === true;
const nameOf = (p: Partner) => s(p, "display_name") || s(p, "name_th") || s(p, "name_en") || s(p, "code") || "(ไม่มีชื่อ)";
const isChina = (p: Partner) => isChinaPartner(p);   // กติกาเดียวกับแท็บข้อมูลไม่ครบ (lib/partner-data-check)

const AV = ["#4f46e5", "#0891b2", "#7c3aed", "#db2777", "#059669", "#d97706", "#2563eb", "#dc2626"];
function initials(n: string) { const m = n.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/); return ((m[0]?.[0] || "") + (m.length > 1 ? m[m.length - 1][0] : (m[0]?.[1] || ""))).toUpperCase() || "?"; }
function avColor(code: string) { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; }
// สัญลักษณ์เงิน — ข้อมูลจริงใช้ทั้ง RMB / YUAN / CNY (จีน), THB, USD
const CUR_SYM: Record<string, string> = { CNY: "¥", RMB: "¥", YUAN: "¥", USD: "$", THB: "฿" };
function money(v: unknown, cur: string) { const n = Number(v); return n > 0 ? (CUR_SYM[(cur || "THB").toUpperCase()] ?? "") + n.toLocaleString("th-TH") + (CUR_SYM[(cur || "").toUpperCase()] ? "" : ` ${cur}`) : ""; }

function Badges({ p }: { p: Partner }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {b(p, "is_customer") && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">ลูกค้า</span>}
      {b(p, "is_supplier") && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">ผู้จำหน่าย</span>}
    </div>
  );
}

/** ตัวย่อวงกลม หรือโลโก้ร้าน (partners_v2.logo_url) */
function PartnerAvatar({ p, size = 36 }: { p: Partner; size?: number }) {
  if (s(p, "logo_url")) return <AppLogo src={s(p, "logo_url")} name={nameOf(p)} size={size} className="rounded-[10px] flex-none" />;
  return <div style={{ width: size, height: size, background: avColor(s(p, "code") || p.id) }}
    className="rounded-[10px] flex-none flex items-center justify-center font-bold text-[12px] text-white">{initials(nameOf(p))}</div>;
}

/** แถวที่ส่งเข้าตารางกลาง = ข้อมูลคู่ค้า + สรุป + ช่องข้อความสำเร็จรูป (ใช้ค้นหา/กรอง/โหมดการ์ดบนมือถือ) */
type Row = Partner & {
  _name: string; _type: string; _country: string; _contact: string; _last: string; _lastDate: string;
  _credit: string; _gaps: string; _gapCount: number; _open: number; _suspect: boolean;
};

const lineUrl = (id: string) => `https://line.me/R/ti/p/${id.startsWith("@") ? id : "~" + id}`;
const THB = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

export function PartnerManager() {
  const toast = useToast();
  const router = useRouter();
  const { can } = useAuth();
  const canEdit = can("products.edit" as Parameters<typeof can>[0]);
  const canCreate = can("products.create" as Parameters<typeof can>[0]);
  const showMoney = can("cashflow.view");

  const [all, setAll] = useState<Partner[]>([]);   // รวมรายที่อยู่ในถังขยะ (is_active=false)
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // ลิงก์ ?tab=incomplete (หน้า /master/partner-data-check เดิมพามาที่นี่) → เปิดแท็บข้อมูลไม่ครบเลย
  const [tab, setTab] = useState<Tab>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "incomplete" ? "incomplete" : "all");
  const [sel, setSel] = useState<Partner | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [fix, setFix] = useState(false);   // ป๊อปเปิดจากแท็บข้อมูลไม่ครบ → โชว์กล่องเติมช่องที่ขาด
  const [dupOpen, setDupOpen] = useState(false);
  const [sum, setSum] = useState<Record<string, PartnerSummaryRow>>({});
  const [resetSel, setResetSel] = useState(0);
  const [history, setHistory] = useState<Partner | null>(null);
  const [toTrash, setToTrash] = useState<Partner[] | null>(null);
  const [busy, setBusy] = useState(false);
  // แท็บ "ข้อมูลไม่ครบ" — นับเอกสารที่เคยออกต้องใช้ฝั่ง server (ใบขาย/ใบสั่งซื้อ)
  const [inc, setInc] = useState<PartnerCheckRow[]>([]);
  const [incLoading, setIncLoading] = useState(true);
  const [incError, setIncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const res = await apiFetch("/api/master-v2/partners?limit=2000&sort_by=display_name&sort_dir=asc&include_inactive=true");
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setAll((j.data ?? []) as Partner[]);
    } catch (e) { setLoadErr(e instanceof Error ? e.message : "โหลดรายชื่อ Partner ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);
  const loadSum = useCallback(async () => {
    try {
      const res = await apiFetch("/api/partners/summary");
      const j = await res.json();
      if (res.ok && !j.error) setSum((j.data ?? {}) as Record<string, PartnerSummaryRow>);
    } catch { /* สรุปเป็นส่วนเสริม — โหลดไม่ได้ ตารางยังใช้ได้ */ }
  }, []);
  const loadInc = useCallback(async () => {
    setIncLoading(true); setIncError(null);
    try {
      const res = await apiFetch("/api/master/partner-data-check");
      const j = (await res.json()) as { data?: PartnerCheckRow[]; error?: string | null };
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setInc(j.data ?? []);
    } catch (e) { setIncError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setIncLoading(false); }
  }, []);
  useEffect(() => { void load(); void loadSum(); void loadInc(); }, [load, loadSum, loadInc]);

  const active = useMemo(() => all.filter((p) => p.is_active !== false), [all]);
  const trash = useMemo(() => all.filter((p) => p.is_active === false), [all]);

  const counts = useMemo(() => ({
    all: active.length,
    customer: active.filter((p) => b(p, "is_customer")).length,
    supplier: active.filter((p) => b(p, "is_supplier")).length,
    china: active.filter(isChina).length,
    suspect: active.filter((p) => sum[p.id]?.suspectSupplier).length,
    // ตัวเลขบนการ์ด = รายที่เคยออกเอกสารแล้ว และขาดช่องที่เอกสารต้องพิมพ์ (กรอกพวกนี้ก่อนคุ้มสุด)
    incomplete: inc.filter((r) => r.doc_count > 0 && r.missing_required).length,
    trash: trash.length,
  }), [active, trash, inc, sum]);

  // แปลงเป็นแถวของตารางกลาง (ช่อง _x = ข้อความสำเร็จรูปไว้ค้น/กรอง/โชว์การ์ดมือถือ)
  const toRow = useCallback((p: Partner): Row => {
    const sm = sum[p.id];
    const gaps = partnerGaps(p).map((g) => g.label);
    const sup = b(p, "is_supplier"), cus = b(p, "is_customer");
    const terms = [
      sup && s(p, "purchase_credit_term") ? `จ่ายร้าน ${formatCreditTerm(s(p, "purchase_credit_term"))}` : "",
      cus && salesCreditTermOf(p as { sales_credit_term?: unknown }) ? `ลูกค้าจ่าย ${formatCreditTerm(salesCreditTermOf(p as { sales_credit_term?: unknown }))}` : "",
    ].filter(Boolean);
    if (!terms.length) gaps.push("เครดิต");
    const lastDate = [sm?.buyLast, sm?.sellLast].filter(Boolean).sort().pop() ?? "";
    return {
      ...p,
      _name: nameOf(p),
      _type: [cus ? "ลูกค้า" : "", sup ? "ผู้จำหน่าย" : ""].filter(Boolean).join(" + "),
      _country: isChina(p) ? "จีน" : "ไทย",
      _contact: [s(p, "mobile") || s(p, "phone"), s(p, "line_id") && `LINE ${s(p, "line_id")}`, s(p, "wechat_id") && `WeChat ${s(p, "wechat_id")}`].filter(Boolean).join(" · "),
      _last: sm ? [sm.buyCount ? `ซื้อ ${sm.buyCount} ใบ` : "", sm.sellCount ? `ขาย ${sm.sellCount} ใบ` : "", lastDate ? `ล่าสุด ${formatDate(lastDate)}` : ""].filter(Boolean).join(" · ") : "",
      _lastDate: lastDate,
      _credit: terms.join(" · "),
      _gaps: gaps.length ? `ขาด ${gaps.join(", ")}` : "",
      _gapCount: gaps.length,
      _open: (sm?.payOpen ?? 0) + (sm?.recvOpen ?? 0),
      _suspect: !!sm?.suspectSupplier,
    };
  }, [sum]);

  const tabRows = useMemo<Row[]>(() => {
    const src = tab === "trash" ? trash : active;
    return src.filter((p) => {
      if (tab === "customer") return b(p, "is_customer");
      if (tab === "supplier") return b(p, "is_supplier");
      if (tab === "china") return isChina(p);
      if (tab === "suspect") return !!sum[p.id]?.suspectSupplier;
      return true;
    }).map(toRow);
  }, [tab, active, trash, sum, toRow]);

  const openView = (p: Partner) => { setSel(p); setMode("view"); setFix(false); };
  // จากแท็บข้อมูลไม่ครบ: เปิดป๊อปบนหน้านี้ + กล่องเติมช่องที่ขาด
  const openFix = useCallback((r: PartnerCheckRow) => {
    const p = all.find((x) => x.id === r.id);
    if (!p) { toast.error("ยังโหลดรายชื่อคู่ค้าไม่เสร็จ ลองอีกครั้ง"); return; }
    setSel(p); setMode("view"); setFix(true);
  }, [all, toast]);
  // รายถัดไปในแท็บข้อมูลไม่ครบ (ลำดับเดียวกับตาราง: ออกเอกสารบ่อยสุดก่อน)
  const nextFix = useMemo(() => {
    if (!sel || !fix) return null;
    const i = inc.findIndex((r) => r.id === sel.id);
    return inc.find((r, j) => j > i && r.id !== sel.id) ?? null;
  }, [inc, sel, fix]);
  // ลิงก์ตรงถึงคู่ค้า `?open=<id>` (จาก Global Search / หน้าอื่น) → เปิดป๊อปให้เลยเมื่อโหลดรายชื่อเสร็จ
  useOpenParam(!loading && all.length > 0, (id) => { const p = all.find((x) => x.id === id); if (p) openView(p); });
  const openCreate = () => {
    setSel({ id: "", default_currency: "THB", is_customer: tab === "customer", is_supplier: tab === "supplier" || tab === "china", is_company: true } as Partner);
    setMode("create");
  };
  useNewParam(canCreate && !loading, openCreate);   // ลิงก์ `?new=1` (คำสั่งลัดจาก Global Search) → เปิดฟอร์มสร้างใหม่ให้เลย
  const afterSave = (saved: Partner) => {
    setAll((rows) => { const i = rows.findIndex((r) => r.id === saved.id); if (i < 0) return [saved, ...rows]; const c = [...rows]; c[i] = saved; return c; });
    // คิดแถว "ข้อมูลไม่ครบ" ใหม่ด้วยกติกาเดียวกับ server (ครบแล้ว = หายจากรายการ · คงจำนวนเอกสารเดิม)
    setInc((rows) => {
      const old = rows.find((r) => r.id === saved.id);
      const row = checkRow(saved, old?.so_count ?? 0, old?.po_count ?? 0);
      const rest = rows.filter((r) => r.id !== saved.id);
      return isIncomplete(row) ? sortCheckRows([...rest, row]) : rest;
    });
    setSel(saved); setMode("view");
  };

  /**
   * แก้หลายรายพร้อมกัน ผ่านของกลาง master-v2 bulk-update (โหมด edits ราย id · เช็กสิทธิ์ + ลงประวัติรายแถว)
   * แล้วขึ้นแจ้งผลมุมจอมีปุ่ม "ย้อนกลับ" = ส่งค่าเดิมกลับไปแบบเดียวกัน
   */
  const bulkPatch = useCallback(async (rows: Partner[], change: (p: Partner) => Record<string, unknown>, done: string) => {
    const edits = rows.map((p) => ({ id: p.id, changes: change(p) }))
      .filter((e) => Object.entries(e.changes).some(([k, v]) => (rows.find((r) => r.id === e.id)?.[k] ?? null) !== v));
    if (!edits.length) { toast.info("ทุกรายเป็นแบบนี้อยู่แล้ว"); return; }
    const before = edits.map((e) => { const p = rows.find((r) => r.id === e.id)!; return { id: e.id, changes: Object.fromEntries(Object.keys(e.changes).map((k) => [k, p[k] ?? null])) }; });
    const send = async (list: typeof edits) => {
      const res = await apiFetch("/api/master-v2/partners/bulk-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits: list }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      const map = new Map(list.map((e) => [e.id, e.changes]));
      setAll((cur) => cur.map((p) => (map.has(p.id) ? { ...p, ...map.get(p.id) } : p)));
    };
    setBusy(true);
    try {
      await send(edits);
      setResetSel((k) => k + 1);
      toast.undo(`${done} ${edits.length} ราย`, async () => {
        try { await send(before); toast.success("ย้อนกลับแล้ว"); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      }, { ms: 10000 });
      void loadSum(); void loadInc();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }, [toast, loadSum, loadInc]);

  const toSupplierOnly = (rows: Partner[]) => bulkPatch(rows, () => ({ is_supplier: true, is_customer: false }), "เปลี่ยนเป็นผู้จำหน่ายแล้ว");
  const addSupplier = (rows: Partner[]) => bulkPatch(rows, () => ({ is_supplier: true }), "ติดป้ายผู้จำหน่ายเพิ่มแล้ว");
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => toast.success(`คัดลอก ${text} แล้ว`)).catch(() => toast.error("คัดลอกไม่ได้")); };

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    {
      id: "_name", accessorKey: "_name", header: "Partner", size: 250,
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <PartnerAvatar p={p} />
          <div className="min-w-0"><div className="font-semibold text-[13px] truncate max-w-[210px]" title={p._name}>{p._name}</div><div className="text-[11px] text-slate-400 font-mono">{s(p, "code") || "—"}</div></div>
        </div>
      ),
    },
    {
      id: "_type", accessorKey: "_type", header: "ประเภท", size: 170, meta: { filterType: "select" },
      cell: ({ row: { original: p } }) => (
        <div className="space-y-1">
          <Badges p={p} />
          {p._suspect && (
            <div className="text-[10.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-1 leading-snug" onClick={(e) => e.stopPropagation()}>
              <span title={`มีสินค้า ${sum[p.id]?.items ?? 0} รายการ · ใบสั่งซื้อ ${sum[p.id]?.buyCount ?? 0} ใบ ผูกกับร้านนี้`}>น่าจะเป็นผู้จำหน่าย?</span>
              {canEdit && <span className="flex gap-1.5 mt-0.5">
                <button type="button" disabled={busy} className="underline hover:text-amber-950" onClick={() => void toSupplierOnly([p])}>เปลี่ยน</button>
                <button type="button" disabled={busy} className="underline hover:text-amber-950" onClick={() => void addSupplier([p])}>เป็นทั้งสอง</button>
              </span>}
            </div>
          )}
        </div>
      ),
    },
    { id: "_country", accessorKey: "_country", header: "ประเทศ", size: 80, meta: { filterType: "select" },
      cell: ({ getValue }) => <span className={`text-[11px] px-2 py-0.5 rounded-full ${getValue() === "จีน" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>{String(getValue())}</span> },
    {
      id: "_contact", accessorKey: "_contact", header: "ติดต่อ", size: 190, enableSorting: false,
      cell: ({ row: { original: p } }) => {
        const tel = s(p, "mobile") || s(p, "phone");
        if (!tel && !s(p, "line_id") && !s(p, "wechat_id")) return <span className="text-slate-300">—</span>;
        return (
          <div className="flex flex-col gap-0.5 text-[12px]" onClick={(e) => e.stopPropagation()}>
            {tel && <a href={`tel:${tel.replace(/[^\d+]/g, "")}`} className="text-slate-700 hover:text-indigo-600 no-underline">📞 {tel}</a>}
            {s(p, "line_id") && <a href={lineUrl(s(p, "line_id"))} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline no-underline">LINE {s(p, "line_id")}</a>}
            {s(p, "wechat_id") && <button type="button" onClick={() => copy(s(p, "wechat_id"))} title="กดเพื่อคัดลอก ไปวางใน WeChat" className="text-left text-green-700 hover:underline">WeChat {s(p, "wechat_id")}</button>}
          </div>
        );
      },
    },
    { id: "province", accessorKey: "province", header: "จังหวัด", size: 110, meta: { filterType: "select" },
      cell: ({ getValue }) => getValue() ? <span className="text-[12px]">{String(getValue())}</span> : <span className="text-slate-300">—</span> },
    { id: "default_currency", accessorKey: "default_currency", header: "สกุลเงิน", size: 80, meta: { filterType: "select" } },
    {
      id: "_lastDate", accessorKey: "_lastDate", header: "ซื้อขายล่าสุด", size: 150,
      cell: ({ row: { original: p } }) => {
        const sm = sum[p.id];
        if (!sm || (!sm.buyCount && !sm.sellCount && !sm.items)) return <span className="text-slate-300">—</span>;
        return (
          <div className="text-[12px] leading-snug">
            {p._lastDate && <div className="font-medium">{formatDate(p._lastDate)}</div>}
            <div className="text-[11px] text-slate-400">{[sm.buyCount ? `ซื้อ ${sm.buyCount}` : "", sm.sellCount ? `ขาย ${sm.sellCount}` : "", sm.items ? `สินค้า ${sm.items}` : ""].filter(Boolean).join(" · ")}</div>
          </div>
        );
      },
    },
    {
      id: "_open", accessorKey: "_open", header: "ยอดค้าง", size: 140, meta: { permission: "cashflow.view", filterType: "number" },
      cell: ({ row: { original: p } }) => {
        const sm = sum[p.id];
        if (!sm || !p._open) return <span className="text-slate-300">—</span>;
        return (
          <div className="text-[12px] leading-snug tabular-nums">
            {!!sm.payOpen && <div>ต้องจ่าย {THB(sm.payOpen)}</div>}
            {!!sm.recvOpen && <div>ต้องรับ {THB(sm.recvOpen)}</div>}
            {!!sm.overdueDocs && <span className="text-[10.5px] px-1.5 rounded bg-red-50 text-red-600">เลยกำหนด {sm.overdueDocs} ใบ</span>}
          </div>
        );
      },
    },
    {
      id: "nextDue", accessorFn: (p) => sum[p.id]?.nextDue ?? "", header: "ครบกำหนด", size: 110, meta: { permission: "cashflow.view" },
      cell: ({ getValue }) => { const d = String(getValue() || ""); return d ? <span className={`text-[12px] tabular-nums ${d < todayTH() ? "text-red-600 font-medium" : ""}`}>{formatDate(d)}</span> : <span className="text-slate-300">—</span>; },
    },
    {
      id: "_credit", accessorKey: "_credit", header: "เครดิต / วงเงิน", size: 170, enableSorting: false,
      cell: ({ row: { original: p } }) => {
        const lim = Number(p.credit_limit);
        if (!p._credit && !(showMoney && lim > 0)) return <span className="text-slate-300">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {p._credit.split(" · ").filter(Boolean).map((t) => <span key={t} className="text-[10.5px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">{t}</span>)}
            {showMoney && lim > 0 && <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">วงเงิน {money(lim, s(p, "default_currency") || "THB")}</span>}
          </div>
        );
      },
    },
    {
      id: "_gaps", accessorKey: "_gapCount", header: "ข้อมูลขาด", size: 150, meta: { filterType: "number" },
      cell: ({ row: { original: p } }) => p._gapCount
        ? <div className="flex flex-wrap gap-1">{p._gaps.replace(/^ขาด /, "").split(", ").map((g) => <span key={g} className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">ขาด{g}</span>)}</div>
        : <span className="text-[11px] text-emerald-600">ครบ</span>,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [sum, canEdit, busy, showMoney]);

  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "gaps", label: "ข้อมูลไม่ครบ", filter: (r) => Number((r as Row)._gapCount) > 0 },
    { id: "noterm", label: "ยังไม่ตั้งเครดิต", filter: (r) => !(r as Row)._credit },
    { id: "active90", label: "ซื้อขายใน 90 วัน", filter: (r) => { const d = String((r as Row)._lastDate || ""); return !!d && d >= new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10); } },
    ...(showMoney ? [
      { id: "open", label: "มียอดค้าง", filter: (r: Record<string, unknown>) => Number((r as Row)._open) > 0 },
      { id: "overdue", label: "เลยกำหนด", filter: (r: Record<string, unknown>) => Number(sum[String(r.id)]?.overdueDocs) > 0 },
    ] : []),
  ], [showMoney, sum]);

  const bulkActions = useMemo<BulkAction<Row>[]>(() => {
    if (!canEdit) return [];
    if (tab === "trash") return [{ label: "↩ กู้คืน", onClick: (rows) => void bulkPatch(rows, () => ({ is_active: true }), "กู้คืนแล้ว") }];
    return [
      { label: "เปลี่ยนเป็นผู้จำหน่าย", onClick: (rows) => void toSupplierOnly(rows) },
      { label: "+ ป้ายผู้จำหน่าย", onClick: (rows) => void addSupplier(rows) },
      { label: "+ ป้ายลูกค้า", onClick: (rows) => void bulkPatch(rows, () => ({ is_customer: true }), "ติดป้ายลูกค้าเพิ่มแล้ว") },
      { label: "เปลี่ยนเป็นลูกค้า", onClick: (rows) => void bulkPatch(rows, () => ({ is_customer: true, is_supplier: false }), "เปลี่ยนเป็นลูกค้าแล้ว") },
      { label: "ตั้งเครดิต →", onClick: (rows) => router.push(`/cashflow/credit-terms?side=${rows.every((r) => b(r, "is_supplier")) ? "supplier" : "customer"}`) },
      { label: "ย้ายไปถังขยะ", variant: "danger", onClick: (rows) => setToTrash(rows) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, tab, bulkPatch]);

  const rowActions = useMemo<RowAction<Row>[]>(() => [
    { id: "open", label: "เปิดดู", onClick: (p) => openView(p), defaultPlacement: "menu" },
    { id: "history", label: "ประวัติการแก้ไข", onClick: (p) => setHistory(p), defaultPlacement: "menu" },
    ...(canEdit ? [
      tab === "trash"
        ? { id: "restore", label: "↩ กู้คืน", onClick: (p: Row) => void bulkPatch([p], () => ({ is_active: true }), "กู้คืนแล้ว"), defaultPlacement: "menu" as const }
        : { id: "trash", label: "ย้ายไปถังขยะ", variant: "danger" as const, onClick: (p: Row) => setToTrash([p]), defaultPlacement: "menu" as const },
    ] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canEdit, tab, bulkPatch]);

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "all", label: "ทั้งหมด", n: counts.all },
    { key: "customer", label: "ลูกค้า", n: counts.customer },
    { key: "supplier", label: "ผู้จำหน่าย", n: counts.supplier },
    { key: "china", label: "ร้านจีน", n: counts.china },
    { key: "suspect", label: "ป้ายน่าสงสัย", n: counts.suspect },
    { key: "incomplete", label: "ข้อมูลไม่ครบ", n: counts.incomplete },
    { key: "trash", label: "ถังขยะ", n: counts.trash },
  ];
  const STATS: { key: Tab; label: string; n: number; color: string; rail: string; hint?: string }[] = [
    { key: "all", label: "ทั้งหมด", n: counts.all, color: "text-slate-800", rail: "bg-indigo-500" },
    { key: "customer", label: "ลูกค้า", n: counts.customer, color: "text-blue-600", rail: "bg-blue-500" },
    { key: "supplier", label: "ผู้จำหน่าย", n: counts.supplier, color: "text-emerald-600", rail: "bg-emerald-500" },
    { key: "china", label: "ร้านจีน", n: counts.china, color: "text-rose-600", rail: "bg-rose-500" },
    { key: "suspect", label: "ป้ายน่าสงสัย", n: counts.suspect, color: counts.suspect > 0 ? "text-amber-600" : "text-slate-300", rail: "bg-amber-500", hint: "ติดลูกค้า แต่มีสินค้า/ใบสั่งซื้อ" },
    { key: "incomplete", label: "ข้อมูลไม่ครบ", n: counts.incomplete, color: counts.incomplete > 0 ? "text-amber-600" : "text-slate-300", rail: "bg-amber-500", hint: "เฉพาะรายที่ออกเอกสารแล้ว" },
  ];

  return (
    <div className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight flex items-center gap-2.5">🤝 Partners <span className="text-[15px] font-semibold text-slate-400 tabular-nums">{counts.all}</span></h1>
          <p className="mt-1 text-[13px] text-slate-500">ลูกค้า &amp; ผู้จำหน่าย — ติดต่อ ที่อยู่ ภาษี เครดิต และธนาคาร รวมที่เดียว</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/cashflow/credit-terms" className="h-[38px] px-3.5 text-[12.5px] font-semibold border border-slate-200 bg-white text-slate-600 rounded-[10px] hover:bg-slate-50 inline-flex items-center no-underline">💳 จัดการเครดิตเทอม</Link>
          <button onClick={() => setDupOpen(true)} title="หาคู่ค้า/ร้านที่ชื่อคล้ายกันมาก (มักเกิดจากพิมพ์ชื่อไม่เหมือนเดิมตอนสร้างใหม่)"
            className="h-[38px] px-3.5 text-[12.5px] font-semibold border border-slate-200 bg-white text-slate-600 rounded-[10px] hover:bg-slate-50">🔍 สแกนร้านซ้ำ</button>
          {canCreate && <button onClick={openCreate} className="h-[38px] px-4 text-[13px] font-semibold bg-indigo-600 text-white rounded-[10px] hover:bg-indigo-700">＋ เพิ่ม Partner</button>}
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 mb-4">
        {STATS.map((st) => (
          <button key={st.key} onClick={() => setTab(st.key)} title={st.hint}
            className={`relative overflow-hidden text-left bg-white border rounded-[14px] px-3 sm:px-4 py-2.5 sm:py-3.5 transition hover:-translate-y-px ${tab === st.key ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
            <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${st.rail}`} />
            <div className="text-[11.5px] sm:text-[12px] text-slate-500 truncate">{st.label}</div>
            <div className={`text-[20px] sm:text-[26px] font-bold mt-0.5 tabular-nums ${st.color}`}>{st.key === "incomplete" && incLoading ? <Spinner /> : st.n}</div>
            {st.hint && <div className="text-[10.5px] text-slate-400 truncate hidden sm:block">{st.hint}</div>}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto mb-3 -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="inline-flex bg-white border border-slate-200 rounded-[11px] p-[3px] gap-0.5 whitespace-nowrap">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-[13px] font-semibold px-3 py-[7px] rounded-lg transition flex items-center gap-1.5 ${tab === t.key ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
              {t.label} <span className="text-[11px] text-slate-400 tabular-nums">{t.n}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === "suspect" && counts.suspect > 0 && (
        <div className="mb-3 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] px-3.5 py-2.5">
          รายเหล่านี้ติดป้าย &quot;ลูกค้า&quot; อย่างเดียว แต่มีสินค้าหรือใบสั่งซื้อผูกกับร้าน — น่าจะเป็นผู้จำหน่าย · กด &quot;เปลี่ยน&quot; ทีละราย หรือติ๊กหลายรายแล้วเลือกคำสั่งด้านล่าง (ย้อนกลับได้)
        </div>
      )}
      {tab === "trash" && (
        <div className="mb-3 text-[12.5px] bg-slate-50 border border-slate-200 text-slate-600 rounded-[10px] px-3.5 py-2.5">
          ถังขยะ = คู่ค้าที่ปิดใช้งานแล้ว ไม่โชว์ในตัวเลือกคู่ค้า แต่เอกสารเก่ายังอ้างถึงได้ · กด &quot;↩ กู้คืน&quot; เพื่อนำกลับมา
        </div>
      )}

      {tab === "incomplete" ? (
        <PartnerIncompleteTab rows={inc} loading={incLoading} error={incError} onRetry={() => void loadInc()} onOpen={openFix} />
      ) : (
        <DataTable<Row>
          tableId="master-partners"
          data={tabRows}
          columns={columns}
          loading={loading}
          error={loadErr ?? undefined}
          onRetry={() => void load()}
          views={views}
          searchPlaceholder="ค้นหาชื่อ / รหัส / เบอร์โทร / เลขภาษี / จังหวัด / LINE / WeChat…"
          searchableKeys={["_name", "code", "name_en", "phone", "mobile", "tax_id", "province", "line_id", "wechat_id"]}
          onRowClick={(p) => openView(p)}
          rowActions={rowActions}
          bulkActions={bulkActions}
          bulkBarPosition="bottom"
          bulkUnit="ราย"
          selectionResetKey={resetSel}
          pageSize={50}
          canCheck={(perm) => can(perm as Parameters<typeof can>[0])}
          exportFilename="partners"
          exportEntityType="partners_v2"
          enableCards
          cardConfig={{ primary: "_name", subtitle: "_type", lines: ["_contact", "_last", "_credit", "_gaps"] }}
          emptyMessage={tab === "trash" ? "ถังขยะว่าง" : "ไม่พบ Partner ที่ตรงเงื่อนไข"}
        />
      )}

      {sel && <PartnerDrawer partner={sel} mode={mode} canEdit={canEdit} others={active.filter((p) => p.id !== sel.id)}
        onMode={setMode} onClose={() => setSel(null)} onSaved={afterSave}
        onRemoved={() => { setSel(null); void load(); void loadInc(); }}
        fix={fix} onNext={nextFix ? () => openFix(nextFix) : undefined} />}

      <DuplicateScanModal open={dupOpen} onClose={() => setDupOpen(false)}
        onOpenPartner={(id) => { const p = all.find((r) => r.id === id); if (p) { setDupOpen(false); openView(p); } }} />

      <ConfirmDialog open={!!toTrash} onClose={() => { if (!busy) setToTrash(null); }} loading={busy} variant="danger"
        title={`ย้าย ${toTrash?.length ?? 0} รายไปถังขยะ?`} confirmText="ย้ายไปถังขยะ" cancelText="ไม่ย้าย"
        message="จะหายจากรายชื่อและตัวเลือกคู่ค้า — เอกสารเก่าที่อ้างถึงยังดูได้ตามเดิม · กู้คืนได้ที่แท็บ ถังขยะ (หรือกด ย้อนกลับ ที่แจ้งผลมุมจอ)"
        onConfirm={() => { const rows = toTrash ?? []; void bulkPatch(rows, () => ({ is_active: false }), "ย้ายไปถังขยะแล้ว").then(() => setToTrash(null)); }} />

      {history && <RecordHistoryDrawer target={{ entityType: "partners_v2", entityId: history.id, title: nameOf(history), subtitle: "ประวัติการแก้ไข" }} onClose={() => setHistory(null)} />}
    </div>
  );
}

// ============================================================
// PartnerDrawer — ดู / แก้ไข / เพิ่ม
// ============================================================
const CURRENCIES = ["THB", "CNY", "USD"];

function KV({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v != null && v !== "" && v !== "—");
  if (!shown.length) return <div className="text-[12.5px] text-slate-400 px-3.5 py-2.5 rounded-[10px] bg-slate-50 border border-slate-100">— ไม่มีข้อมูล —</div>;
  return (
    <dl className="grid grid-cols-[118px_1fr] gap-y-2 gap-x-3">
      {shown.map(([k, v], i) => (<Fragment key={i}><dt className="text-[12.5px] text-slate-400">{k}</dt><dd className="m-0 text-[13px] font-medium text-slate-700">{v}</dd></Fragment>))}
    </dl>
  );
}

function PartnerDrawer({ partner, mode, canEdit, others, onMode, onClose, onSaved, onRemoved, fix, onNext }: {
  partner: Partner; mode: Mode; canEdit: boolean; others: Partner[];
  onMode: (m: Mode) => void; onClose: () => void; onSaved: (p: Partner) => void;
  /** ปิดใช้งานสำเร็จ → หน้าแม่ปิดป๊อป + โหลดรายชื่อใหม่ */
  onRemoved: () => void;
  /** เปิดจากแท็บข้อมูลไม่ครบ → โชว์กล่องเติมช่องที่ขาดบนสุด */
  fix?: boolean;
  /** ไปรายถัดไปในแท็บข้อมูลไม่ครบ */
  onNext?: () => void;
}) {
  const toast = useToast();
  // ปิดใช้งาน (ไม่ลบทิ้ง — ใบสั่งซื้อ/ใบขาย/ราคาซัพพลายเออร์ ยังอ้างถึงคู่ค้านี้) · กู้คืนได้ที่หน้า ผู้จำหน่าย / ลูกค้า
  const [confirmOff, setConfirmOff] = useState(false);
  const [removing, setRemoving] = useState(false);
  const deactivate = async () => {
    setRemoving(true);
    try {
      const res = await apiFetch(`/api/master-v2/partners/${partner.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "ปิดใช้งานไม่สำเร็จ");
      toast.success("ปิดใช้งานแล้ว — เอกสารเก่ายังอ้างถึงได้ตามเดิม");
      setConfirmOff(false);
      onRemoved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ปิดใช้งานไม่สำเร็จ"); }
    finally { setRemoving(false); }
  };
  const { width, startResize } = useDrawerResize("partnerDrawerWidth", 560);   // ของกลาง: ลากขอบซ้ายปรับกว้าง + จำค่า
  const [form, setForm] = useState<Partner>(partner);
  const [tab, setTab] = useState<"info" | "rel">("info");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fixDirty, setFixDirty] = useState(false);   // กล่องเติมช่องที่ขาดมีค่าที่ยังไม่บันทึก
  const [confirmClose, setConfirmClose] = useState(false);
  const editing = mode === "edit" || mode === "create";

  useEffect(() => { setForm(partner); setDirty(false); setTab("info"); }, [partner, mode]);
  useEffect(() => { setFixDirty(false); }, [partner.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tryClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, dirty, fixDirty]);

  const set = (k: string, v: unknown) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const tryClose = () => { if ((editing && dirty) || (!editing && fixDirty)) setConfirmClose(true); else onClose(); };

  const cur = s(form, "default_currency") || "THB";
  const isSup = b(form, "is_supplier");
  const showChina = editing ? isSup : isChina(form);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      const FIELDS = ["code", "name_th", "name_en", "display_name", "is_customer", "is_supplier", "is_company",
        "phone", "mobile", "email", "line_id", "wechat_id", "website", "address_line", "sub_district", "district", "province", "postal_code", "country",
        "tax_id", "tax_branch", "credit_limit", "purchase_credit_term", "sales_credit_term", "purchase_lead_time", "default_currency",
        "bank_name_brief", "account_number", "bank_account_name", "sale_name", "shop_country", "is_taobao", "ship_before_pay", "buy_bill", "notes", "tags", "logo_url"];
      for (const k of FIELDS) if (form[k] !== partner[k]) payload[k] = form[k] ?? null;
      if (mode === "create") for (const k of FIELDS) if (form[k] != null && form[k] !== "") payload[k] = form[k];

      if (Object.keys(payload).length === 0) { toast.error("ไม่มีข้อมูลที่เปลี่ยน"); setSaving(false); return; }
      const url = mode === "create" ? "/api/master-v2/partners" : `/api/master-v2/partners/${partner.id}`;
      const res = await apiFetch(url, { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(mode === "create" ? "เพิ่ม Partner แล้ว" : "บันทึกแล้ว");
      onSaved({ ...form, ...(j.data as Partner) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const quick = ([
    (s(form, "mobile") || s(form, "phone")) && ["📞 โทร", `tel:${s(form, "mobile") || s(form, "phone")}`],
    s(form, "line_id") && ["💬 LINE", ""],
    s(form, "wechat_id") && ["💚 WeChat", ""],
    s(form, "email") && ["✉️ อีเมล", `mailto:${s(form, "email")}`],
    s(form, "website") && ["🌐 เว็บ", ""],
  ].filter(Boolean)) as [string, string][];

  const node = (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={tryClose} />
      <aside style={{ width }} className="fixed top-0 right-0 bottom-0 max-w-[97vw] bg-white shadow-2xl z-40 flex flex-col animate-[slidein_.25s_ease]">
        <style>{`@keyframes slidein{from{transform:translateX(100%)}to{transform:none}}`}</style>
        {/* จับลากปรับความกว้าง (ของกลาง useDrawerResize) */}
        <div onMouseDown={startResize} title="ลากเพื่อปรับความกว้าง"
          className="group absolute left-0 top-0 h-full w-1.5 cursor-ew-resize z-20 hover:bg-indigo-200/50 active:bg-indigo-300/60">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-r bg-slate-300 group-hover:bg-indigo-400" />
        </div>
        {/* header */}
        <div className="px-[22px] pt-5 relative border-b border-slate-100">
          <button onClick={tryClose} className="absolute top-4 right-4 w-8 h-8 rounded-[9px] border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100">✕</button>
          <div className="flex gap-3.5 items-start">
            {s(form, "logo_url")
              ? <AppLogo src={s(form, "logo_url")} name={nameOf(form)} size={56} className="rounded-[15px] flex-none" />
              : <div className="w-[56px] h-[56px] rounded-[15px] flex-none flex items-center justify-center font-bold text-[19px] text-white" style={{ background: avColor(s(form, "code") || partner.id || "P") }}>{initials(nameOf(form))}</div>}
            <div className="min-w-0 pr-8">
              <h2 className="text-[18px] font-bold tracking-tight truncate">{mode === "create" ? "เพิ่ม Partner ใหม่" : nameOf(form)}</h2>
              <div className="text-[12.5px] text-slate-500 mt-0.5">{s(form, "name_en") && <span>{s(form, "name_en")} · </span>}<span className="font-mono">{s(form, "code") || "—"}</span></div>
              {mode !== "create" && <div className="mt-2"><Badges p={form} /></div>}
            </div>
          </div>
          <div className="flex gap-2 mt-3.5 pb-3.5 flex-wrap">
            {!editing && quick.map(([label, href]) => (
              <a key={label} href={href || undefined} className="h-[34px] px-3 text-[12.5px] font-semibold rounded-[9px] border border-slate-200 bg-slate-50 text-slate-700 flex items-center hover:border-indigo-300 hover:text-indigo-700 no-underline">{label}</a>
            ))}
            {!editing && canEdit && <button onClick={() => setConfirmOff(true)} title="เลิกใช้คู่ค้านี้ (ไม่ลบทิ้ง เอกสารเก่ายังอ้างถึงได้)"
              className="h-[34px] px-3 text-[12.5px] font-semibold rounded-[9px] border border-red-200 text-red-600 bg-white hover:bg-red-50 ml-auto">🗑 ปิดใช้งาน</button>}
            {!editing && canEdit && <button onClick={() => onMode("edit")} className="h-[34px] px-3 text-[12.5px] font-semibold rounded-[9px] bg-indigo-50 text-indigo-700">✏️ แก้ไข</button>}
          </div>
        </div>

        {/* tabs (view only) */}
        {!editing && (
          <div className="flex gap-0.5 px-[22px] border-b border-slate-100">
            <button onClick={() => setTab("info")} className={`text-[13px] font-semibold px-3 py-2.5 border-b-2 -mb-px ${tab === "info" ? "text-indigo-700 border-indigo-500" : "text-slate-400 border-transparent"}`}>ข้อมูล</button>
            <button onClick={() => setTab("rel")} className={`text-[13px] font-semibold px-3 py-2.5 border-b-2 -mb-px ${tab === "rel" ? "text-indigo-700 border-indigo-500" : "text-slate-400 border-transparent"}`}>{isSup ? "วัตถุดิบ / PO" : "ออเดอร์ / วางบิล"}</button>
          </div>
        )}

        <div className="px-[22px] py-4.5 overflow-y-auto flex-1">
          {!editing && fix && tab === "info" && (
            <PartnerQuickFix partner={partner} canEdit={canEdit} onSaved={onSaved} onNext={onNext} onDirtyChange={setFixDirty} />
          )}
          {editing ? <EditForm form={form} set={set} isSup={isSup} showChina={showChina} cur={cur} others={others} />
            : tab === "info" ? <ViewInfo form={form} isSup={isSup} showChina={showChina} cur={cur} />
              : <RelData partner={form} />}
        </div>

        {editing && (
          <div className="border-t border-slate-100 px-[22px] py-3 flex items-center gap-2.5">
            {dirty && <span className="text-[11.5px] text-amber-600 mr-auto flex items-center gap-1.5">● มีการแก้ไขที่ยังไม่บันทึก</span>}
            <button onClick={tryClose} className={`h-[38px] px-4 text-[13px] font-semibold rounded-[10px] border border-slate-200 bg-slate-50 text-slate-600 ${!dirty ? "ml-auto" : ""}`}>ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-[38px] px-[18px] text-[13px] font-semibold bg-indigo-600 text-white rounded-[10px] hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">{saving && <Spinner />}💾 บันทึก</button>
          </div>
        )}
      </aside>
      <ConfirmDialog open={confirmOff} onClose={() => { if (!removing) setConfirmOff(false); }} onConfirm={() => void deactivate()} loading={removing}
        variant="danger" title="ปิดใช้งานคู่ค้านี้?" confirmText="ปิดใช้งาน" cancelText="ไม่ปิด"
        message={`"${nameOf(form)}" จะหายจากรายชื่อและตัวเลือกคู่ค้า — เอกสารเก่าที่อ้างถึงยังดูได้ตามเดิม · กู้คืนได้ที่หน้า ผู้จำหน่าย / ลูกค้า (เปิดดูรายการที่ลบ แล้วกด ↩ กู้คืน)`} />
      <ConfirmDialog open={confirmClose} onClose={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); onClose(); }}
        title="ออกโดยไม่บันทึก?" message="คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกหรือไม่?" confirmText="ออกโดยไม่บันทึก" variant="danger" />
    </>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

const Lab = ({ children }: { children: ReactNode }) => <div className="text-[11px] font-bold tracking-wide uppercase text-slate-400 mb-2.5 flex items-center gap-1.5">{children}</div>;

function ViewInfo({ form, isSup, showChina, cur }: { form: Partner; isSup: boolean; showChina: boolean; cur: string }) {
  const { can } = useAuth();
  const showLimit = can("cashflow.view");   // วงเงิน = ข้อมูลการเงินอ่อนไหว
  const fin: [string, ReactNode, string][] = [
    ...(showLimit ? [["วงเงินเครดิต", money(form.credit_limit, cur) || "ไม่จำกัด", Number(form.credit_limit) > 0 ? "text-amber-600" : "text-slate-400"] as [string, ReactNode, string]] : []),
    // ผู้จำหน่าย = เทอมที่เราจ่ายเขา (purchase_credit_term) · ลูกค้า = เทอมที่เขาจ่ายเรา (sales_credit_term / ค่าเก่า payment_terms_days)
    [isSup ? "เทอมการจ่าย" : "เทอมชำระ", formatCreditTerm(isSup ? (s(form, "purchase_credit_term") || null) : salesCreditTermOf(form as { sales_credit_term?: unknown })), "text-slate-800"],
    ["สกุลเงิน", cur, "text-slate-800"],
    [isSup ? "ระยะเวลาส่งของ" : "รอบวางบิล", formatLeadTime(s(form, "purchase_lead_time") || null), "text-sky-600"],
  ];
  return (
    <div className="space-y-5">
      <section><Lab>💰 การเงิน &amp; เครดิต</Lab>
        <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3.5 grid grid-cols-2 gap-3">
          {fin.map(([l, v, c]) => (<div key={l}><div className="text-[11px] text-slate-400">{l}</div><div className={`text-[16px] font-bold mt-0.5 ${c}`}>{v}</div></div>))}
        </div>
      </section>
      <section><Lab>📇 ข้อมูลติดต่อ</Lab>
        <KV rows={[["เบอร์โทร", s(form, "phone")], ["มือถือ", s(form, "mobile")], ["LINE", s(form, "line_id")], ["WeChat", s(form, "wechat_id")], ["อีเมล", s(form, "email")], ["เว็บไซต์", s(form, "website")]]} />
      </section>
      <section><Lab>📍 ที่อยู่</Lab>
        {(s(form, "address_line") || s(form, "province")) ? (
          <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3.5 text-[13px] text-slate-700">
            {s(form, "address_line")}<br />{[s(form, "sub_district"), s(form, "district"), s(form, "province"), s(form, "postal_code"), s(form, "country")].filter(Boolean).join(" · ")}
          </div>
        ) : <KV rows={[]} />}
      </section>
      <section><Lab>🧾 ภาษี</Lab><KV rows={[["เลขผู้เสียภาษี", s(form, "tax_id")], ["สาขา", s(form, "tax_branch")]]} /></section>
      {showChina && (
        <section><Lab>🇨🇳 ข้อมูลร้านจีน</Lab>
          <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-3.5">
            <KV rows={[["ผู้ติดต่อขาย", s(form, "sale_name")], ["WeChat", s(form, "wechat_id")], ["ประเทศร้าน", s(form, "shop_country")],
              ["ร้าน Taobao", b(form, "is_taobao") ? "✅ ใช่" : "❌ ไม่"], ["ส่งก่อนจ่าย", b(form, "ship_before_pay") ? "✅ ได้" : "❌ ต้องจ่ายก่อน"], ["ออกบิลซื้อ", b(form, "buy_bill") ? "✅ มีบิล" : "❌ ไม่มีบิล"]]} />
          </div>
        </section>
      )}
      <section><Lab>🏦 ธนาคาร</Lab><KV rows={[["ธนาคาร", s(form, "bank_name_brief")], ["เลขบัญชี", s(form, "account_number")], ["ชื่อบัญชี", s(form, "bank_account_name")]]} /></section>
      <section><Lab>🏷️ แท็ก &amp; โน้ต</Lab>
        <div className="flex gap-1.5 flex-wrap">{(Array.isArray(form.tags) ? form.tags as string[] : []).map((t, i) => <span key={i} className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5 text-slate-600">{t}</span>)}</div>
        {s(form, "notes") && <div className="mt-2.5 text-[12.5px] text-slate-600 leading-relaxed bg-amber-50/70 border border-slate-100 rounded-[10px] px-3.5 py-2.5">📌 {s(form, "notes")}</div>}
      </section>
    </div>
  );
}

const IN = "h-[38px] w-full border border-slate-200 rounded-[9px] px-2.5 text-[13px] focus:outline-2 focus:outline-indigo-500";
function Fld({ label, k, form, set, span, ph, prefix }: { label: string; k: string; form: Partner; set: (k: string, v: unknown) => void; span?: boolean; ph?: string; prefix?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${span ? "col-span-2" : ""}`}>
      <label className="text-[11.5px] font-semibold text-slate-600">{label}</label>
      <div className="relative">{prefix && <span className="absolute left-2.5 top-2 text-slate-400 text-[13px] pointer-events-none">{prefix}</span>}
        <input value={s(form, k)} onChange={(e) => set(k, e.target.value)} placeholder={ph} className={`${IN} ${prefix ? "pl-6" : ""}`} /></div>
    </div>
  );
}
function Tog({ label, k, form, set }: { label: string; k: string; form: Partner; set: (k: string, v: unknown) => void }) {
  const on = b(form, k);
  return (
    <button type="button" onClick={() => set(k, !on)} aria-pressed={on}
      className={`inline-flex items-center gap-2 border rounded-[10px] px-3 py-[7px] text-[12.5px] font-semibold ${on ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
      <span className={`w-[34px] h-5 rounded-full relative transition ${on ? "bg-indigo-500" : "bg-slate-300"}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-0.5"}`} /></span>
      {label}
    </button>
  );
}

/**
 * เตือนตอนพิมพ์ชื่อ: ชื่อนี้คล้ายกับร้านที่มีอยู่แล้วไหม (กันสร้างร้านซ้ำตั้งแต่ต้นทาง)
 * ใช้ของกลาง lib/partner-match — เตือนอย่างเดียว ไม่บล็อกการบันทึก (บางทีชื่อคล้ายกันจริง ๆ)
 */
function SimilarNameWarn({ form, others }: { form: Partner; others: Partner[] }) {
  const hits = useMemo(() => {
    const mine = [s(form, "display_name"), s(form, "name_th"), s(form, "name_en")].filter(Boolean);
    if (!mine.length) return [];
    return others
      .map((o) => {
        const theirs = [s(o, "display_name"), s(o, "name_th"), s(o, "name_en")].filter(Boolean);
        let best = 0;
        for (const a of mine) for (const b of theirs) best = Math.max(best, shopNameSimilarity(a, b));
        return { o, score: best };
      })
      .filter((h) => h.score >= 0.82)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [form, others]);

  if (!hits.length) return null;
  return (
    <div className="mt-2.5 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] px-3.5 py-2.5">
      ⚠️ ชื่อนี้คล้ายกับที่มีอยู่แล้ว — เช็กก่อนว่าเป็นร้านเดียวกันหรือเปล่า
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {hits.map(({ o, score }) => (
          <span key={o.id} className="text-[11.5px] font-medium px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-900">
            {nameOf(o)} <span className="text-amber-500">{Math.round(score * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function EditForm({ form, set, isSup, showChina, cur, others }: { form: Partner; set: (k: string, v: unknown) => void; isSup: boolean; showChina: boolean; cur: string; others: Partner[] }) {
  const tagsStr = Array.isArray(form.tags) ? (form.tags as string[]).join(", ") : s(form, "tags");
  const { can } = useAuth();
  const showLimit = can("cashflow.view");   // วงเงิน = ข้อมูลการเงินอ่อนไหว
  return (
    <div className="space-y-5">
      <section><Lab>🔖 ประเภท Partner</Lab>
        <div className="flex gap-2 flex-wrap"><Tog label="🛍️ เป็นลูกค้า" k="is_customer" form={form} set={set} /><Tog label="🏭 เป็นผู้จำหน่าย" k="is_supplier" form={form} set={set} /><Tog label="🏢 นิติบุคคล" k="is_company" form={form} set={set} /></div>
      </section>
      <section><Lab>🪪 ข้อมูลหลัก</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="รหัส" k="code" form={form} set={set} ph="เว้นว่าง = ตั้งให้อัตโนมัติ" />
          <div className="flex flex-col gap-1.5"><label className="text-[11.5px] font-semibold text-slate-600">สกุลเงินหลัก</label>
            <select value={cur} onChange={(e) => set("default_currency", e.target.value)} className={IN}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <Fld label="ชื่อ (ไทย)" k="name_th" form={form} set={set} span />
          <Fld label="ชื่อ (อังกฤษ/จีน)" k="name_en" form={form} set={set} span />
          <Fld label="ชื่อที่แสดง" k="display_name" form={form} set={set} span ph="เว้นว่าง = ใช้ชื่อไทย" />
          <div className="col-span-2 flex flex-col gap-1.5"><label className="text-[11.5px] font-semibold text-slate-600">โลโก้ / รูปหน้าร้าน <span className="font-normal text-slate-400">(ไม่ใส่ = ใช้ตัวย่อ)</span></label>
            <LogoPicker value={s(form, "logo_url")} name={nameOf(form)} url={s(form, "website") || null} folder="partner-logos" onChange={(v) => set("logo_url", v || null)} /></div>
        </div>
        <SimilarNameWarn form={form} others={others} />
      </section>
      <section><Lab>📇 ติดต่อ</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="เบอร์โทร" k="phone" form={form} set={set} /><Fld label="มือถือ" k="mobile" form={form} set={set} />
          <Fld label="LINE ID" k="line_id" form={form} set={set} /><Fld label="WeChat ID" k="wechat_id" form={form} set={set} />
          <Fld label="อีเมล" k="email" form={form} set={set} span /><Fld label="เว็บไซต์" k="website" form={form} set={set} span />
        </div>
      </section>
      <section><Lab>📍 ที่อยู่</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="ที่อยู่" k="address_line" form={form} set={set} span />
          <Fld label="ตำบล/แขวง" k="sub_district" form={form} set={set} /><Fld label="อำเภอ/เขต" k="district" form={form} set={set} />
          <Fld label="จังหวัด" k="province" form={form} set={set} /><Fld label="รหัสไปรษณีย์" k="postal_code" form={form} set={set} />
        </div>
      </section>
      <section><Lab>🧾 ภาษี</Lab>
        <div className="grid grid-cols-2 gap-3"><Fld label="เลขผู้เสียภาษี" k="tax_id" form={form} set={set} ph="13 หลัก" /><Fld label="สาขา" k="tax_branch" form={form} set={set} ph="สำนักงานใหญ่" /></div>
      </section>
      <section><Lab>💰 การเงิน &amp; เครดิต</Lab>
        <div className="grid grid-cols-2 gap-3 items-start">
          {showLimit ? <Fld label="วงเงินเครดิต" k="credit_limit" form={form} set={set} prefix={cur === "CNY" ? "¥" : "฿"} /> : <div />}
          <div />
          {isSup && <div className="flex flex-col gap-1.5 col-span-2"><label className="text-[11.5px] font-semibold text-slate-600">เทอมการจ่าย (เราจ่ายร้านนี้)</label>
            <PurchaseCreditTermInput value={s(form, "purchase_credit_term") || null} onChange={(v) => set("purchase_credit_term", v)} /></div>}
          {b(form, "is_customer") && <div className="flex flex-col gap-1.5 col-span-2"><label className="text-[11.5px] font-semibold text-slate-600">เทอมชำระ (ลูกค้าจ่ายเรา)</label>
            <PurchaseCreditTermInput value={s(form, "sales_credit_term") || null} onChange={(v) => set("sales_credit_term", v)} /></div>}
          <div className="flex flex-col gap-1.5 col-span-2"><label className="text-[11.5px] font-semibold text-slate-600">ระยะเวลาส่งของ</label>
            <PurchaseLeadTimeInput value={s(form, "purchase_lead_time") || null} onChange={(v) => set("purchase_lead_time", v)} /></div>
        </div>
      </section>
      <section><Lab>🏦 ธนาคาร</Lab>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="ธนาคาร" k="bank_name_brief" form={form} set={set} /><Fld label="เลขบัญชี" k="account_number" form={form} set={set} />
          <Fld label="ชื่อบัญชี" k="bank_account_name" form={form} set={set} span />
        </div>
      </section>
      {showChina && (
        <section><Lab>🇨🇳 ข้อมูลร้านจีน (เฉพาะผู้ขาย)</Lab>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="ผู้ติดต่อขาย (Sale)" k="sale_name" form={form} set={set} /><Fld label="ประเทศร้าน" k="shop_country" form={form} set={set} ph="เช่น จีน" />
          </div>
          <div className="flex gap-2 flex-wrap mt-3"><Tog label="🛒 ร้าน Taobao" k="is_taobao" form={form} set={set} /><Tog label="🚚 ส่งก่อนจ่ายได้" k="ship_before_pay" form={form} set={set} /><Tog label="🧾 ออกบิลซื้อได้" k="buy_bill" form={form} set={set} /></div>
        </section>
      )}
      <section><Lab>🏷️ แท็ก &amp; โน้ต</Lab>
        <div className="flex flex-col gap-1.5"><label className="text-[11.5px] font-semibold text-slate-600">แท็ก (คั่นด้วย ,)</label>
          <input value={tagsStr} onChange={(e) => set("tags", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} className={IN} /></div>
        <div className="flex flex-col gap-1.5 mt-3"><label className="text-[11.5px] font-semibold text-slate-600">โน้ต</label>
          <textarea value={s(form, "notes")} onChange={(e) => set("notes", e.target.value)} className="w-full border border-slate-200 rounded-[9px] px-2.5 py-2 text-[13px] min-h-[62px] focus:outline-2 focus:outline-indigo-500" /></div>
      </section>
    </div>
  );
}

const fmtDate = (v: unknown) => { const t = v ? String(v) : ""; if (!t) return ""; const d = new Date(t); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); };
const STATUS_LABEL: Record<string, string> = { draft: "ร่าง", confirmed: "ยืนยัน", ordered: "สั่งแล้ว", received: "รับแล้ว", closed: "ปิด", cancelled: "ยกเลิก", paid: "จ่ายแล้ว", sent: "ส่งแล้ว" };

function RelSection({ icon, title, count, empty, rows }: { icon: string; title: string; count: number; empty: string; rows: { t: string; s?: string; r?: string }[] }) {
  return (
    <section className="mb-5">
      <Lab>{icon} {title} {count > 0 && <span className="text-slate-300 tabular-nums">({count})</span>}</Lab>
      {rows.length === 0 ? (
        <div className="text-[12.5px] text-slate-400 px-3.5 py-2.5 rounded-[10px] bg-slate-50 border border-slate-100">{empty}</div>
      ) : (
        <div className="bg-slate-50 border border-slate-100 rounded-[10px] px-3.5">
          {rows.map((it, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className="w-8 h-8 rounded-lg flex-none flex items-center justify-center text-[14px] bg-white border border-slate-100">{icon}</div>
              <div className="min-w-0"><div className="text-[13px] font-semibold truncate">{it.t}</div>{it.s && <div className="text-[11.5px] text-slate-400">{it.s}</div>}</div>
              {it.r && <div className="ml-auto text-[12.5px] font-bold text-slate-600 shrink-0 tabular-nums">{it.r}</div>}
            </div>
          ))}
          {count > rows.length && <div className="text-[11px] text-slate-400 py-2 text-center">แสดง {rows.length} จาก {count}</div>}
        </div>
      )}
    </section>
  );
}

type Material = { id: string; sku_id: string | null; sku_code: string; sku_name: string; supplier_sku: string; price: number | null; currency: string; moq: number | null; lead_time_days: number | null; is_default: boolean };
const MAT_PAGE = 20;

// ตารางวัตถุดิบที่รับซื้อ (MiniTable ของกลาง) + ค้นหา + แบ่งหน้า (Pager ของกลาง) + คลิกดู SKU
function MaterialsTable({ rows, total, onOpenSku }: { rows: Material[]; total: number; onOpenSku: (skuId: string) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) => [r.sku_code, r.sku_name, r.supplier_sku].join(" ").toLowerCase().includes(kw));
  }, [rows, q]);
  useEffect(() => { setPage(0); }, [q]);
  const shown = filtered.slice(page * MAT_PAGE, page * MAT_PAGE + MAT_PAGE);

  const cols: MiniColumn<Material>[] = [
    { key: "code", header: "รหัส", width: "1.1fr", sortValue: (r) => r.sku_code, sortLabel: "รหัส",
      cell: (r) => (<div className="min-w-0"><div className="font-medium text-[12.5px] truncate">{r.sku_code}</div>{r.sku_name && <div className="text-[11px] text-slate-400 truncate">{r.sku_name}</div>}</div>) },
    // ราคา = ข้อมูลที่มีจริง (~85% ของ supplier_items) · MOQ/lead time/รหัสร้าน แทบไม่มีใครกรอก → ไม่ทำคอลัมน์เปล่า
    { key: "price", header: "ราคา/หน่วย", align: "right", width: "6.5rem", sortValue: (r) => r.price ?? -1,
      cell: (r) => r.price != null ? <span className="tabular-nums font-semibold text-[12.5px]">{money(r.price, r.currency)}</span> : <span className="text-slate-300">—</span> },
    { key: "def", header: "", align: "center", width: "2.8rem",
      cell: (r) => r.is_default ? <span title="ร้านหลักของวัตถุดิบนี้" className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">หลัก</span> : null },
  ];

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Lab>📦 วัตถุดิบที่รับซื้อ {total > 0 && <span className="text-slate-300 tabular-nums">({total})</span>}</Lab>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส / ชื่อ / รหัสร้าน…"
          className="ml-auto h-8 w-[190px] border border-slate-200 rounded-lg px-2.5 text-[12.5px] focus:outline-2 focus:outline-indigo-500" />
      </div>
      {rows.length === 0 ? (
        <div className="text-[12.5px] text-slate-400 px-3.5 py-2.5 rounded-[10px] bg-slate-50 border border-slate-100">ยังไม่มีวัตถุดิบผูกกับร้านนี้</div>
      ) : (
        <>
          <MiniTable<Material> rows={shown} columns={cols} rowKey={(r) => r.id} dense
            onRowClick={(r) => { if (r.sku_id) onOpenSku(r.sku_id); }}
            emptyText="ไม่พบวัตถุดิบที่ตรงคำค้น" countUnit="รายการ" />
          {filtered.length > MAT_PAGE && <div className="mt-2"><Pager page={page} pageSize={MAT_PAGE} total={filtered.length} onPage={setPage} unitLabel="รายการ" /></div>}
          <p className="text-[11px] text-slate-400 mt-1.5">คลิกแถวเพื่อดูรายละเอียดวัตถุดิบ (SKU){total > rows.length ? ` · โหลดมา ${rows.length} จาก ${total}` : ""}</p>
        </>
      )}
    </section>
  );
}

function RelData({ partner }: { partner: Partner }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [skuId, setSkuId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; setLoading(true);
    apiFetch(`/api/partners/${partner.id}/related`).then((r) => r.json()).then((j) => { if (alive) setData(j); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [partner.id]);

  if (loading) return <div className="py-10 text-center text-slate-400 text-[13px]"><Spinner /> กำลังโหลดรายการที่เกี่ยว…</div>;
  if (!data) return <div className="py-10 text-center text-slate-400 text-[13px]">โหลดไม่สำเร็จ</div>;

  const counts = (data.counts ?? {}) as Record<string, number>;
  const st = (v: unknown) => { const k = String(v ?? "").toLowerCase(); return STATUS_LABEL[k] ?? (v ? String(v) : ""); };
  const arr = (k: string) => (Array.isArray(data[k]) ? data[k] as Record<string, unknown>[] : []);

  return (
    <div>
      {data.is_supplier ? (
        <>
          <MaterialsTable rows={(data.materials ?? []) as Material[]} total={counts.materials ?? 0} onOpenSku={setSkuId} />
          <RelSection icon="🛒" title="ใบสั่งซื้อ (PO)" count={counts.purchase_orders ?? 0} empty="ยังไม่มีใบสั่งซื้อ"
            rows={arr("purchase_orders").map((o) => ({ t: String(o.po_no ?? "PO"), s: [fmtDate(o.order_date), st(o.status)].filter(Boolean).join(" · "), r: money(o.grand_total, "THB") }))} />
          <RelSection icon="🧾" title="บิลจีน" count={counts.china_bills ?? 0} empty="ยังไม่มีบิลจีน"
            rows={arr("china_bills").map((c) => ({ t: "บิลจีน", s: [fmtDate(c.created_at), st(c.status)].filter(Boolean).join(" · ") }))} />
        </>
      ) : null}
      {data.is_customer ? (
        <RelSection icon="📄" title="ใบเสนอราคา" count={counts.offer_sheets ?? 0} empty="ยังไม่มีใบเสนอราคา"
          rows={arr("offer_sheets").map((o) => ({ t: String(o.title || "ใบเสนอราคา"), s: [fmtDate(o.created_at), st(o.status)].filter(Boolean).join(" · ") }))} />
      ) : null}
      {skuId && <MasterRecordDrawer key={skuId} moduleKey="skus-v2" recordId={skuId} onClose={() => setSkuId(null)} />}
    </div>
  );
}
