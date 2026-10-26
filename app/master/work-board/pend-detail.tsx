"use client";

/**
 * แผงรายละเอียดของใบ "รอจ่าย" (ตารางบอร์ดจ่ายงาน) — กดช่องไหน กางแท็บของช่องนั้น + สลับแท็บในแผงได้
 * แท็บ: รายละเอียดงาน · BOM/ซื้อของ · เตรียม/ตัด · ขั้นตอน · จ่ายงาน · กำหนดส่ง+งวดส่ง · กลุ่ม · ประวัติ
 * ใช้ API เดิมของเช็กลิสต์ทั้งหมด (ไม่มี API ใหม่): /api/mo/[id] · /api/mo/material · /api/mo/material-line
 *   · /api/mo/delivery-plan · /api/mo/dispatch-history · (วันส่ง/จ่ายงาน/กลุ่ม = ฟังก์ชันที่ตารางส่งมา)
 * รอบ 2 (ยังไม่ทำ): ปุ่มขอซื้อ / ติ๊ก "มีของแล้ว" / รับของ / ตั้งราคา ในแผง
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { formatDate, formatDateTime, todayBangkok, addDaysYmd } from "@/lib/date";
import { HoverImage } from "@/components/hover-image";
import { MoShortMaterials } from "@/components/mo-material-progress";
import { ERPModal } from "@/components/modal";
import { needsCut, type CutFields } from "@/lib/cut-rules";
import type { MoProgress } from "@/app/api/mo/material-progress/route";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import type { DispatchHistRow } from "@/app/api/mo/dispatch-history/route";
import type { MoCost } from "@/app/api/mo/[id]/cost/route";
import type { MoIssue } from "@/app/api/mo/issues/route";
import type { WorkStep } from "@/app/api/bom/work-steps/route";
import type { MoPieceRow } from "@/app/api/mo/piecework/route";
import { WorkStepsTab } from "./work-steps-tab";
import { BomEditorModal } from "@/components/bom-editor-modal";

export type PendPane = "job" | "bom" | "prep" | "stage" | "dispatch" | "due" | "group" | "hist";
export const PEND_PANES: [PendPane, string][] = [
  ["job", "📋 รายละเอียดงาน"], ["bom", "🛒 BOM / ซื้อของ"], ["prep", "✂️ เตรียม / ตัด"], ["stage", "🚦 ความคืบหน้า"],
  ["dispatch", "🚚 จ่ายงาน"], ["due", "📅 กำหนดส่ง"], ["group", "🗂 กลุ่ม"], ["hist", "🕘 ประวัติ"],
];
/** คอลัมน์ → แท็บที่เปิด (ไม่มีในนี้ = กดแล้วไม่กาง เช่น ช่องค่าแรงที่ไว้ดับเบิลคลิกแก้) */
export const CELL_PANE: Record<string, PendPane> = {
  img: "job", prod: "job", brand: "job", prio: "job", issues: "job", price: "job", value: "job",
  created: "hist", qty: "dispatch", prep: "prep", buy: "bom", eta: "bom", stage: "stage", due: "due", group: "group",
};

export type PendMoLite = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null; image_url: string | null;
  qty: number; dispatched: number; remaining: number; due_date: string | null; internal_due_date?: string | null;
  created_at?: string | null; priority?: number; priority_note?: string | null; brand: string | null; brand_oem?: boolean;
  has_bom: boolean; prep_total: number; prep_ready: number; cut_total: number; cut_ready: number; issue_count?: number;
};
export type PlanLite = { id: string; mo_id: string; due_date: string; qty: number; note?: string | null; shipped?: boolean; dn_number?: string | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const daysFromToday = (ymd: string) => {
  const [y1, m1, d1] = todayBangkok().split("-").map(Number), [y2, m2, d2] = ymd.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
const DaysTag = ({ ymd }: { ymd: string | null | undefined }) => {
  if (!ymd) return null;
  const d = daysFromToday(ymd);
  return <span className={`text-[11px] ${d < 0 ? "text-rose-600 font-medium" : d <= 3 ? "text-amber-600" : "text-slate-400"}`}>{d < 0 ? `เลย ${fmt(-d)} วัน` : d === 0 ? "วันนี้" : `อีก ${fmt(d)} วัน`}</span>;
};

// ---- ประวัติการจ่ายงาน (ใช้ทั้งในแผงนี้และแท็บ "ประวัติ" ของเช็กลิสต์) ----
export const HIST_BADGE: Record<string, { t: string; c: string }> = {
  dispatched: { t: "จ่ายแล้ว", c: "bg-blue-50 text-blue-700" }, in_progress: { t: "กำลังทำ", c: "bg-indigo-50 text-indigo-700" },
  partial_return: { t: "คืนบางส่วน", c: "bg-amber-50 text-amber-700" }, done: { t: "เสร็จ", c: "bg-emerald-50 text-emerald-700" },
};
const shortDate = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("th-TH", { day: "2-digit", month: "short" }); } catch { return s; } };
export function HistTab({ rows }: { rows: DispatchHistRow[] | null }) {
  if (rows === null) return <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>;
  if (rows.length === 0) return <div className="text-center py-8 text-slate-300 text-sm">ยังไม่เคยจ่ายงานนี้</div>;
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
        {rows.map((r) => {
          const b = HIST_BADGE[r.status] ?? { t: r.status, c: "bg-slate-100 text-slate-600" };
          return (
            <div key={r.id} className={`flex items-center gap-2 px-3 py-2 ${r.is_active ? "" : "opacity-50"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 truncate">{r.assignee_name ?? r.department_name ?? "—"}{!r.is_active && <span className="text-[10px] text-rose-500"> · ยกเลิก</span>}</p>
                <p className="text-[10px] text-slate-400">{r.wo_no} · {shortDate(r.dispatch_date)} · จ่าย {fmt(r.qty)}{r.received_qty ? ` · คืน ${fmt(r.received_qty)}` : ""}</p>
              </div>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${b.c}`}>{b.t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- แท็บเตรียม/ตัด: ติ๊กได้ในแผงเลย (API เดียวกับเช็กลิสต์) ----
type PrepRow = { id: string; sku: string | null; name: string | null; qty: number; uom: string | null; is_ready: boolean };
type CutRow = { id: string; sku: string | null; name: string | null; block: string | null; size: string; pieces: number | null; cut_done: boolean };
function PrepPane({ moId, canEdit, onChanged }: { moId: string; canEdit: boolean; onChanged: () => void }) {
  const [prep, setPrep] = useState<PrepRow[] | null>(null);
  const [cuts, setCuts] = useState<CutRow[]>([]);
  const [err, setErr] = useState("");
  const dirty = useRef(false);
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged;
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/mo/${moId}`).then((r) => r.json()).then((j) => {
      if (cancel) return;
      const sum = (j?.data?.summary ?? []) as Record<string, unknown>[];
      const mats = (j?.data?.materials ?? []) as Record<string, unknown>[];
      setPrep(sum.map((s) => ({ id: String(s.id), sku: (s.component_sku as string) ?? null, name: (s.component_name as string) ?? null, qty: Number(s.required_qty) || 0, uom: (s.uom as string) ?? null, is_ready: !!s.is_ready })));
      setCuts(mats.filter((x) => needsCut(x as CutFields)).map((x) => ({
        id: String(x.id), sku: (x.component_sku as string) ?? null, name: (x.component_name as string) ?? null, block: (x.cut_block_code as string) ?? null,
        size: [x.cut_width, x.cut_length].filter((v) => v != null && v !== "").join("×"), pieces: x.pieces != null ? Number(x.pieces) : null, cut_done: !!x.cut_done,
      })));
    }).catch(() => { if (!cancel) setErr("โหลดรายการไม่สำเร็จ"); });
    return () => { cancel = true; };
  }, [moId]);
  // ติ๊กแล้ว → ปิดแผง/สลับแท็บ ค่อยให้ตารางโหลดตัวเลขเตรียม/ตัดใหม่ (ไม่ยิงทุกคลิก)
  useEffect(() => () => { if (dirty.current) onChangedRef.current(); }, []);
  const tickPrep = async (r: PrepRow) => {
    if (!canEdit) return;
    const next = !r.is_ready;
    setPrep((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, is_ready: next } : x)));
    try {
      const res = await apiFetch(`/api/mo/material`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, is_ready: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      dirty.current = true;
    } catch { setPrep((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, is_ready: !next } : x))); setErr("บันทึกไม่สำเร็จ ลองใหม่"); }
  };
  const tickCut = async (r: CutRow) => {
    if (!canEdit) return;
    const next = !r.cut_done;
    setCuts((rs) => rs.map((x) => (x.id === r.id ? { ...x, cut_done: next } : x)));
    try {
      const res = await apiFetch(`/api/mo/material-line`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, cut_done: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      // server คืนสถานะ "เตรียมครบ" ของวัตถุดิบนั้น (ตัดครบทุกบล็อก = เตรียมครบ) → อัปเดตฝั่งเตรียมให้ตรง
      if (r.sku != null && typeof j.is_ready === "boolean") setPrep((rs) => rs && rs.map((x) => (x.sku === r.sku ? { ...x, is_ready: j.is_ready } : x)));
      dirty.current = true;
    } catch { setCuts((rs) => rs.map((x) => (x.id === r.id ? { ...x, cut_done: !next } : x))); setErr("บันทึกไม่สำเร็จ ลองใหม่"); }
  };
  if (!prep) return <p className="text-xs text-slate-400">{err || "กำลังโหลดรายการวัตถุดิบ…"}</p>;
  if (prep.length === 0) return <p className="text-xs text-slate-400">ใบนี้ยังไม่มีสูตรวัตถุดิบ (BOM)</p>;
  const pd = prep.filter((r) => r.is_ready).length, cd = cuts.filter((r) => r.cut_done).length;
  const box = "w-5 h-5 accent-emerald-600";
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-[11px] text-slate-500">เตรียมของ <b className="text-slate-700">{pd}/{prep.length}</b> {canEdit ? "· ติ๊กได้เลย" : "· ดูอย่างเดียว (ไม่มีสิทธิ์แก้)"}</p>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white max-h-72 overflow-y-auto">
          {prep.map((r) => (
            <label key={r.id} className={`flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] ${canEdit ? "cursor-pointer hover:bg-slate-50" : ""}`}>
              <input type="checkbox" checked={r.is_ready} disabled={!canEdit} onChange={() => void tickPrep(r)} className={box} />
              <span className={`min-w-0 flex-1 truncate ${r.is_ready ? "text-slate-400 line-through" : "text-slate-800"}`} title={r.name ?? ""}>{r.name ?? r.sku}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{fmt(r.qty)} {r.uom ?? ""}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] text-slate-500">ตัด (รายบล็อก) <b className="text-slate-700">{cd}/{cuts.length}</b>{cuts.length === 0 ? " · ใบนี้ไม่มีชิ้นต้องตัด" : ""}</p>
        {cuts.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white max-h-72 overflow-y-auto">
            {cuts.map((r) => (
              <label key={r.id} className={`flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] ${canEdit ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                <input type="checkbox" checked={r.cut_done} disabled={!canEdit} onChange={() => void tickCut(r)} className={box} />
                <span className={`min-w-0 flex-1 truncate ${r.cut_done ? "text-slate-400 line-through" : "text-slate-800"}`}>{r.block ? <b className="font-mono font-medium">{r.block}</b> : null} {r.name ?? r.sku}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{r.size}{r.pieces ? ` · ${r.pieces} ชิ้น` : ""}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      {err && <p className="text-[11px] text-rose-600 lg:col-span-2">{err}</p>}
    </div>
  );
}

// ---- แท็บกำหนดส่ง: แก้วัน (บันทึกทันที) + แบ่งงวดส่ง เพิ่ม/ลบ ----
function DuePane({ m, canEdit, plans, onSaveDue, onAddPlan, onDelPlan }: {
  m: PendMoLite; canEdit: boolean; plans: PlanLite[];
  onSaveDue: (field: "due" | "internal", value: string) => void;
  onAddPlan: (date: string, qty: number, note: string) => Promise<boolean>;
  onDelPlan: (id: string) => Promise<void>;
}) {
  const [due, setDue] = useState((m.due_date ?? "").slice(0, 10));
  const [di, setDi] = useState((m.internal_due_date ?? "").slice(0, 10));
  useEffect(() => { setDue((m.due_date ?? "").slice(0, 10)); setDi((m.internal_due_date ?? "").slice(0, 10)); }, [m.due_date, m.internal_due_date]);
  const planned = plans.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const left = Math.max(0, Math.round(((m.qty || 0) - planned) * 100) / 100);
  const [pDate, setPDate] = useState("");
  const [pQty, setPQty] = useState("");
  const [pNote, setPNote] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (field: "due" | "internal", v: string) => { if (field === "due") setDue(v); else setDi(v); onSaveDue(field, v); };
  const quick = (field: "due" | "internal", days: number) => set(field, addDaysYmd((field === "due" ? due : di) || todayBangkok(), days));
  const field = (f: "due" | "internal", label: string, v: string, hint: string) => (
    <div className="min-w-[14rem]">
      <div className="text-[12px] font-medium text-slate-600">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <input type="date" value={v} disabled={!canEdit} onChange={(e) => set(f, e.target.value)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50" />
        {v ? <DaysTag ymd={v} /> : <span className="text-[11px] text-slate-400">ยังไม่กำหนด</span>}
      </div>
      {canEdit && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {[7, 14, 30].map((d) => <button key={d} type="button" onClick={() => quick(f, d)} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50">+{d} วัน</button>)}
          {v && <button type="button" onClick={() => set(f, "")} className="h-7 rounded-md px-2 text-[11px] text-slate-400 underline hover:text-slate-600">ล้าง</button>}
        </div>
      )}
      <p className="mt-1 text-[10px] text-slate-400">{hint}</p>
    </div>
  );
  const add = async () => {
    const q = Number(pQty);
    if (!pDate || !(q > 0)) return;
    setBusy(true);
    const ok = await onAddPlan(pDate, q, pNote.trim());
    setBusy(false);
    if (ok) { setPQty(""); setPNote(""); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-6">
        {field("due", "📦 นัดส่งลูกค้า", due, "เปลี่ยนแล้วบันทึกทันที")}
        {field("internal", "🪑 ส่งงานภายใน", di, "ใบจ่ายงานที่ยังทำอยู่ของใบนี้ขยับตาม")}
      </div>
      <div>
        <div className="text-[12px] font-medium text-slate-600">📦 แบ่งงวดส่ง <span className="font-normal text-slate-400">· ทั้งใบ {fmt(m.qty)} ชิ้น · แบ่งแล้ว {fmt(planned)} · ยังไม่แบ่ง {fmt(left)}</span></div>
        {plans.length === 0 ? <p className="mt-1 text-[11px] text-slate-400">ยังไม่ได้แบ่ง — ส่งทีเดียวตามวันนัดส่งลูกค้า</p> : (
          <div className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white max-w-xl">
            {[...plans].sort((a, b) => a.due_date.localeCompare(b.due_date)).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-2.5 py-1.5 text-[12px]">
                <span className="w-24 tabular-nums">{formatDate(p.due_date)}</span>
                <DaysTag ymd={p.due_date} />
                <span className="tabular-nums font-medium">{fmt(p.qty)} ชิ้น</span>
                <span className="min-w-0 flex-1 truncate text-slate-400">{p.note ?? ""}</span>
                {p.shipped ? <span className="text-[10px] text-emerald-700">✓ ส่งแล้ว{p.dn_number ? ` · ${p.dn_number}` : ""}</span>
                  : canEdit && <button type="button" onClick={() => void onDelPlan(p.id)} className="text-[11px] text-rose-500 hover:underline">ลบ</button>}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-sm" />
            <input type="number" min={0} step="any" value={pQty} onChange={(e) => setPQty(e.target.value)} placeholder={left > 0 ? `จำนวน (เหลือ ${fmt(left)})` : "จำนวน"} className="h-8 w-36 rounded-lg border border-slate-200 px-2 text-sm" />
            <input value={pNote} onChange={(e) => setPNote(e.target.value)} placeholder="หมายเหตุ (ไม่ใส่ก็ได้)" className="h-8 w-44 rounded-lg border border-slate-200 px-2 text-sm" />
            <button type="button" onClick={() => void add()} disabled={busy || !pDate || !(Number(pQty) > 0)}
              className="h-8 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{busy ? "กำลังเพิ่ม…" : "+ เพิ่มงวด"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- แท็บประวัติ: สร้างใบเมื่อไหร่ + ประวัติจ่ายงาน ----
function HistPane({ m }: { m: PendMoLite }) {
  const [rows, setRows] = useState<DispatchHistRow[] | null>(null);
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/mo/dispatch-history?mo_no=${encodeURIComponent(m.mo_no)}`).then((r) => r.json())
      .then((j) => { if (!cancel) setRows((j?.data ?? []) as DispatchHistRow[]); }).catch(() => { if (!cancel) setRows([]); });
    return () => { cancel = true; };
  }, [m.mo_no]);
  const age = m.created_at ? Math.max(0, Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000)) : null;
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-slate-600">🗓 สร้างใบงาน <b>{m.created_at ? formatDateTime(m.created_at) : "—"}</b>{age != null && <span className="text-slate-400"> · {age === 0 ? "วันนี้" : `${fmt(age)} วันที่แล้ว`}</span>}</p>
      <p className="text-[11px] text-slate-500">ประวัติการจ่ายงานของใบนี้</p>
      <HistTab rows={rows} />
    </div>
  );
}

const Btn = ({ onClick, children, primary, touch }: { onClick: () => void; children: ReactNode; primary?: boolean; touch: boolean }) => (
  <button type="button" onClick={onClick}
    className={`${touch ? "h-11 text-sm" : "h-8 text-xs"} rounded-lg px-3 font-medium whitespace-nowrap ${primary ? "bg-slate-800 text-white hover:bg-slate-700" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{children}</button>
);
const Box = ({ title, extra, children, className = "" }: { title: string; extra?: ReactNode; children: ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-3 ${className}`}>
    <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[12px] font-semibold text-slate-700">{title}</span>{extra && <span className="text-[11px] text-slate-400">{extra}</span>}</div>
    {children}
  </div>
);

// ---- กล่องในรายละเอียดงาน: ต้นทุน / ปัญหา / ขั้นตอนงาน (API เดียวกับแท็บในเช็กลิสต์) ----
function CostBox({ moId, qty, canSeeMoney }: { moId: string; qty: number; canSeeMoney: boolean }) {
  const [c, setC] = useState<MoCost | null | undefined>(undefined);
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/mo/${encodeURIComponent(moId)}/cost`).then((r) => r.json())
      .then((j) => { if (!cancel) setC((j?.data ?? null) as MoCost | null); }).catch(() => { if (!cancel) setC(null); });
    return () => { cancel = true; };
  }, [moId]);
  if (c === undefined) return <Box title="💰 ต้นทุน / ชิ้น"><p className="text-[11px] text-slate-400">กำลังโหลด…</p></Box>;
  if (c === null) return <Box title="💰 ต้นทุน / ชิ้น"><p className="text-[11px] text-slate-400">โหลดต้นทุนไม่สำเร็จ</p></Box>;
  const labor = c.est_labor_pp > 0 ? c.est_labor_pp : c.central_rate;
  const total = (c.material_cost_pp || 0) + (labor || 0);
  const line = (l: ReactNode, v: ReactNode, cls = "") => <div className={`flex items-center justify-between gap-2 py-0.5 text-[12px] ${cls}`}><span className="text-slate-500">{l}</span><span className="tabular-nums">{v}</span></div>;
  const profit = c.sell_price - total;
  return (
    <Box title="💰 ต้นทุน / ชิ้น" extra={c.materials.length ? `วัตถุดิบ ${c.materials.length} รายการ` : undefined}>
      {line("วัตถุดิบ", <>฿{fmt(c.material_cost_pp || 0)}{c.missing_price > 0 && <span className="ml-1 text-[10px] text-amber-600">(ไม่มีราคา {c.missing_price})</span>}</>)}
      {line(c.est_labor_pp > 0 ? "ค่าแรง (ที่ตั้งไว้)" : "ค่าแรง (ราคากลาง)", labor > 0 ? `฿${fmt(labor)}` : <span className="text-slate-400">ยังไม่ใส่</span>)}
      {line(<b className="text-slate-700">รวม / ชิ้น</b>, <b>฿{fmt(total)}</b>, "border-t border-slate-100 mt-0.5 pt-1")}
      {line("× จำนวน", `฿${fmt(total * (qty || 0))}`)}
      {canSeeMoney && (c.sell_price > 0
        ? <>{line("ราคาขาย / ชิ้น", `฿${fmt(c.sell_price)}`)}{line(<span className={profit >= 0 ? "text-emerald-700" : "text-rose-600"}>กำไร / ชิ้น</span>, <span className={profit >= 0 ? "text-emerald-700" : "text-rose-600"}>฿{fmt(profit)}</span>)}</>
        : line("ราคาขาย", <span className="text-amber-600">ยังไม่ตั้ง</span>))}
      {!canSeeMoney && <p className="mt-1 text-[10px] text-slate-400">ราคาขาย/กำไร เห็นเฉพาะผู้บริหาร</p>}
    </Box>
  );
}

const SEV: Record<string, [string, string]> = { low: ["เล็กน้อย", "bg-slate-100 text-slate-600"], medium: ["ปานกลาง", "bg-amber-50 text-amber-700"], high: ["รุนแรง", "bg-rose-50 text-rose-700"] };
function IssuesBox({ moNo, canEdit }: { moNo: string; canEdit: boolean }) {
  const [rows, setRows] = useState<MoIssue[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [t, setT] = useState(""); const [sev, setSev] = useState("medium"); const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/mo/issues?mo_no=${encodeURIComponent(moNo)}`).then((r) => r.json())
      .then((j) => { if (!cancel) setRows((j?.data ?? []) as MoIssue[]); }).catch(() => { if (!cancel) setRows([]); });
    return () => { cancel = true; };
  }, [moNo]);
  const save = async () => {
    const dtype = t.trim(); if (!dtype) { setErr("ใส่ว่าเจอปัญหาอะไร"); return; }
    setBusy(true); setErr("");
    try {
      const res = await apiFetch(`/api/mo/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mo_no: moNo, defect_type: dtype, severity: sev, qty: q || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setRows((rs) => [{ id: String(j.id), defect_no: j.defect_no ?? null, defect_type: dtype, severity: sev, qty: q ? Number(q) : null, cause: null, created_at: new Date().toISOString() }, ...(rs ?? [])]);
      setT(""); setQ(""); setAdding(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  return (
    <Box title="⚠️ ปัญหา" extra={rows ? `${rows.length} เรื่อง` : undefined}>
      {rows === null ? <p className="text-[11px] text-slate-400">กำลังโหลด…</p>
        : rows.length === 0 ? <p className="text-[11px] text-slate-400">ยังไม่มีใครแจ้ง</p>
        : <div className="max-h-40 space-y-1 overflow-y-auto">{rows.map((r) => { const [sl, sc] = SEV[r.severity ?? ""] ?? [r.severity ?? "—", "bg-slate-100 text-slate-600"]; return (
            <div key={r.id} className="flex items-center gap-1.5 text-[12px]">
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${sc}`}>{sl}</span>
              <span className="min-w-0 flex-1 truncate" title={r.cause ?? ""}>{r.defect_type ?? "—"}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{r.qty != null ? `${fmt(r.qty)} ชิ้น · ` : ""}{shortDate(r.created_at)}</span>
            </div>); })}</div>}
      {canEdit && (adding ? (
        <div className="mt-2 space-y-1.5">
          <input value={t} onChange={(e) => setT(e.target.value)} placeholder="เจอปัญหาอะไร เช่น ผ้าไม่ตรงสี" className="h-8 w-full rounded-lg border border-slate-200 px-2 text-sm" autoFocus />
          <div className="flex gap-1.5">
            <select value={sev} onChange={(e) => setSev(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-xs">{Object.entries(SEV).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}</select>
            <input type="number" min={0} value={q} onChange={(e) => setQ(e.target.value)} placeholder="กี่ชิ้น" className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-sm" />
            <button type="button" onClick={() => void save()} disabled={busy} className="h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50">{busy ? "…" : "บันทึก"}</button>
            <button type="button" onClick={() => { setAdding(false); setErr(""); }} className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-slate-500">ยกเลิก</button>
          </div>
          {err && <p className="text-[11px] text-rose-600">{err}</p>}
        </div>
      ) : <button type="button" onClick={() => setAdding(true)} className="mt-2 h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50">+ แจ้งปัญหา</button>)}
    </Box>
  );
}

/** ขั้นตอนงาน: ดูสรุป → กด สร้าง/แก้ = กล่องขยายเต็มแถว ใช้ตัวแก้ตัวเดียวกับแท็บขั้นตอนงานในเช็กลิสต์ (เก็บที่สูตร BOM) */
function StepsBox({ moId, sku, productName, canEdit, onChanged }: { moId: string; sku: string | null; productName: string | null; canEdit: boolean; onChanged: () => void }) {
  const [steps, setSteps] = useState<WorkStep[] | null>(null);
  const [bomCode, setBomCode] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pieceRows, setPieceRows] = useState<MoPieceRow[]>([]);
  const [bomOpen, setBomOpen] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/bom/work-steps?mo_id=${encodeURIComponent(moId)}`).then((r) => r.json())
      .then((j) => { if (!cancel) { setSteps((j?.data ?? []) as WorkStep[]); setBomCode((j?.bom_code as string) ?? null); } })
      .catch(() => { if (!cancel) setSteps([]); });
    return () => { cancel = true; };
  }, [moId, reload]);
  useEffect(() => {
    if (!editing) return;
    let cancel = false;
    apiFetch(`/api/mo/piecework?mo_id=${encodeURIComponent(moId)}`).then((r) => r.json())
      .then((j) => { if (!cancel) setPieceRows((j?.data ?? []) as MoPieceRow[]); }).catch(() => { /* ไม่มีงานเหมาก็สร้างขั้นตอนเองได้ */ });
    return () => { cancel = true; };
  }, [editing, moId]);
  const onSteps = useCallback((s: WorkStep[], b: string | null) => { setSteps(s); if (b) setBomCode(b); }, []);

  if (editing) return (
    <Box title="🧵 ขั้นตอนงาน — สร้าง / แก้" className="sm:col-span-2 lg:col-span-3"
      extra={<button type="button" onClick={() => setEditing(false)} className="h-7 rounded-md bg-slate-800 px-3 text-[11px] font-medium text-white hover:bg-slate-700">เสร็จ ✓</button>}>
      <WorkStepsTab moId={moId} bomCode={bomCode} pieceRows={pieceRows} canEdit={canEdit} steps={steps} onSteps={onSteps} />
    </Box>
  );
  return (
    <Box title="🧵 ขั้นตอนงาน" extra={steps ? `${steps.length} ขั้น` : undefined}>
      {steps === null ? <p className="text-[11px] text-slate-400">กำลังโหลด…</p>
        : steps.length === 0 ? <p className="text-[11px] text-slate-400">ยังไม่มีขั้นตอนงาน</p>
        : <ol className="max-h-40 space-y-0.5 overflow-y-auto">{[...steps].sort((a, b) => a.sequence - b.sequence).map((s, i) => (
            <li key={s.id} className="flex items-start gap-1.5 text-[12px]" title={s.instruction ?? ""}>
              <span className="w-4 shrink-0 text-right text-[11px] text-slate-400">{i + 1}.</span>
              <span className="min-w-0 flex-1">{s.step_name}</span>
              {(s.station || s.job_name) && <span className="shrink-0 text-[10px] text-slate-400">{s.station ?? s.job_name}</span>}
            </li>))}</ol>}
      {canEdit && steps !== null && (bomCode
        ? <button type="button" onClick={() => setEditing(true)} className={`mt-2 h-7 rounded-md px-2.5 text-[11px] font-medium ${steps.length ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "bg-blue-600 text-white hover:bg-blue-700"}`}>{steps.length ? "✏️ แก้ขั้นตอน" : "＋ สร้างขั้นตอน"}</button>
        : <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
            สินค้านี้ยังไม่มีสูตร (BOM) — ขั้นตอนงานเก็บไว้ในสูตร ต้องมีสูตรก่อน
            {sku && <button type="button" onClick={() => setBomOpen(true)} className="ml-1 font-medium text-blue-700 underline">🧩 สร้างสูตร</button>}
          </div>)}
      {bomOpen && sku && <BomEditorModal sku={sku} productName={productName} onClose={(changed) => { setBomOpen(false); if (changed) { setReload((n) => n + 1); onChanged(); } }} />}
    </Box>
  );
}

/** ประวัติของใบสั่งผลิต — ป๊อปอัป (เปิดจากช่อง "สร้างเมื่อ" ในตาราง) */
export function HistModal({ m, onClose }: { m: PendMoLite; onClose: () => void }) {
  return (
    <ERPModal open onClose={onClose} size="md" title={`🕘 ประวัติ · ${m.product_sku ?? ""} ${m.mo_no}`}>
      <HistPane m={m} />
    </ERPModal>
  );
}

/** ตั้งค่ารายละเอียดงาน "ต่อคน" — ปุ่มไหน / กล่องไหน ซ่อนไว้ */
export type DetailPrefs = { hideBtns: string[]; hideSecs: string[] };
export const DETAIL_PREFS_DEFAULT: DetailPrefs = { hideBtns: ["printSteps"], hideSecs: [] };
export const parseDetailPrefs = (v: unknown): DetailPrefs | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return { hideBtns: strs(o.hideBtns), hideSecs: strs(o.hideSecs) };
};
const DETAIL_BTNS: [string, string][] = [["check", "📋 เปิดเช็กลิสต์เต็ม"], ["print", "🖨 พิมพ์ใบสั่งงาน"], ["printSteps", "🪜 พิมพ์ขั้นตอนงาน"]];
const DETAIL_SECS: [string, string][] = [["cost", "💰 ต้นทุน"], ["issue", "⚠️ ปัญหา"], ["steps", "🧵 ขั้นตอนงาน"]];

export function PendDetail(p: {
  m: PendMoLite; pane: PendPane; onPane: (pane: PendPane) => void; onClose: () => void;
  touch: boolean; canEdit: boolean; canSeeMoney: boolean;
  prog?: MoProgress; received: number; wos: WorkOrder[]; plans: PlanLite[]; groupName: string | null;
  rate: number; valueNode?: ReactNode;
  prefs: DetailPrefs; onPrefs: (next: DetailPrefs) => void;
  onOpenChecklist: () => void; onDispatch: () => void; onAssignGroup: () => void; onChanged: () => void;
  onSaveDue: (field: "due" | "internal", value: string) => void;
  onAddPlan: (date: string, qty: number, note: string) => Promise<boolean>;
  onDelPlan: (id: string) => Promise<void>;
}) {
  const { m, pane, touch, canEdit, prog } = p;
  const [prefsOpen, setPrefsOpen] = useState(false);
  const myWos = p.wos.filter((w) => w.is_active !== false);
  const btnOn = (k: string) => !p.prefs.hideBtns.includes(k);
  const secOn = (k: string) => !p.prefs.hideSecs.includes(k);
  const togglePref = (kind: "hideBtns" | "hideSecs", k: string) => {
    const cur = p.prefs[kind];
    p.onPrefs({ ...p.prefs, [kind]: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };
  const body = (() => {
    switch (pane) {
      case "job": {
        const secs = DETAIL_SECS.filter(([k]) => secOn(k));
        const btns = DETAIL_BTNS.filter(([k]) => btnOn(k));
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start gap-4">
              <HoverImage url={m.image_url} size={touch ? 104 : 84} previewSize={320} />
              <div className="min-w-[16rem] flex-1 space-y-1 text-[12px] text-slate-600">
                <div className="text-[15px] font-semibold text-slate-800">{(m.priority ?? 0) >= 2 ? "🔥 " : (m.priority ?? 0) === 1 ? "⭐ " : ""}{m.product_sku} <span className="font-mono text-[11px] font-normal text-slate-400">{m.mo_no}</span></div>
                {m.product_name && m.product_name !== m.product_sku && <div className="text-slate-500">{m.product_name}</div>}
                <div>จำนวน <b className="text-slate-800">{fmt(m.qty)}</b> ชิ้น · จ่ายแล้ว {fmt(m.dispatched)} · <b className="text-rose-600">เหลือ {fmt(m.remaining)}</b></div>
                <div>📦 ส่งลูกค้า {m.due_date ? <>{formatDate(m.due_date)} <DaysTag ymd={m.due_date} /></> : "ยังไม่กำหนด"} · 🪑 ภายใน {m.internal_due_date ? <>{formatDate(m.internal_due_date)} <DaysTag ymd={m.internal_due_date} /></> : "ยังไม่กำหนด"}</div>
                <div>ค่าแรง {p.rate > 0 ? `฿${fmt(p.rate)}/ชิ้น` : "ยังไม่ใส่"} · กลุ่ม {p.groupName ?? "—"} · แบรนด์ {m.brand ?? "—"}{m.brand_oem ? " (OEM)" : ""}</div>
                {p.valueNode && <div className="flex items-center gap-2">มูลค่า {p.valueNode}</div>}
                {m.priority_note && <div className="text-amber-700">📌 {m.priority_note}</div>}
              </div>
              {btns.length > 0 && (
                <div className="flex flex-wrap gap-2 sm:flex-col">
                  {btnOn("check") && <Btn touch={touch} primary onClick={p.onOpenChecklist}>📋 เปิดเช็กลิสต์เต็ม</Btn>}
                  {btnOn("print") && <Btn touch={touch} onClick={() => window.open(`/print/work-order/${m.id}`, "_blank")}>🖨 พิมพ์ใบสั่งงาน</Btn>}
                  {btnOn("printSteps") && <Btn touch={touch} onClick={() => window.open(`/print/work-steps/${m.id}`, "_blank")}>🪜 พิมพ์ขั้นตอนงาน</Btn>}
                </div>
              )}
            </div>
            {secs.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {secOn("cost") && <CostBox moId={m.id} qty={m.qty} canSeeMoney={p.canSeeMoney} />}
                {secOn("issue") && <IssuesBox moNo={m.mo_no} canEdit={canEdit} />}
                {secOn("steps") && <StepsBox moId={m.id} sku={m.product_sku} productName={m.product_name} canEdit={canEdit} onChanged={p.onChanged} />}
              </div>
            )}
          </div>
        );
      }
      case "bom": return (
        <div className="space-y-2">
          <MoShortMaterials moNo={m.mo_no} allowShowAll />
          <p className="text-[11px] text-slate-400">ขอซื้อ · รับของ · ติ๊ก &quot;มีของแล้ว&quot; ทำได้ในเช็กลิสต์ (แท็บวัตถุดิบ / ของซื้อ) — ปุ่มในแผงนี้จะตามมารอบหน้า</p>
        </div>
      );
      case "prep": return <PrepPane moId={m.id} canEdit={canEdit} onChanged={p.onChanged} />;
      case "stage": {
        type S = "done" | "part" | "todo" | "na";
        const lv = (a: number, b: number): S => (a >= b ? "done" : a > 0 ? "part" : "todo");
        const steps: [string, S, string][] = [
          ["ซื้อของ", prog ? (prog.buy + prog.requested + prog.ordered === 0 ? "done" : prog.total - prog.buy > 0 ? "part" : "todo") : "na",
            prog ? `ต้องซื้อ ${prog.buy} · รออนุมัติ ${prog.requested} · รอของ ${prog.ordered} · ครบ ${prog.done}/${prog.total}` : "ยังไม่มีสูตร"],
          ["เตรียม", m.has_bom ? lv(m.prep_ready, m.prep_total) : "na", m.has_bom ? `${m.prep_ready}/${m.prep_total}` : "—"],
          ["ตัด", m.has_bom ? lv(m.cut_ready, m.cut_total) : "na", m.has_bom ? (m.cut_total > 0 ? `${m.cut_ready}/${m.cut_total}` : "ไม่มีชิ้นต้องตัด") : "—"],
          ["จ่ายงาน", m.remaining <= 0.0001 ? "done" : m.dispatched > 0 ? "part" : "todo", `${fmt(m.dispatched)}/${fmt(m.qty)} ชิ้น`],
          ["รับคืน", p.received > 0 && p.received >= m.qty - 0.0001 ? "done" : p.received > 0 ? "part" : "todo", `${fmt(p.received)}/${fmt(m.qty)} ชิ้น`],
        ];
        const cur = steps.findIndex(([, s]) => s === "todo" || s === "part");
        const age = m.created_at ? Math.max(0, Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000)) : null;
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap">
              {steps.map(([label, s, sub], i) => (
                <div key={label} className="min-w-[7.5rem] flex-1 px-1 text-center">
                  <div className={`my-1.5 h-1.5 rounded-full ${s === "done" ? "bg-emerald-500" : i === cur ? "bg-amber-400" : s === "part" ? "bg-blue-300" : "bg-slate-200"}`} />
                  <div className={`text-[13px] font-semibold ${s === "done" ? "text-emerald-700" : i === cur ? "text-amber-700" : "text-slate-500"}`}>{s === "done" ? "✓ " : ""}{label}</div>
                  <div className="text-[11px] text-slate-500">{sub}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">{cur >= 0 ? <>ค้างอยู่ที่ <b className="text-amber-700">{steps[cur][0]}</b></> : "ครบทุกขั้นแล้ว"}{age != null ? ` · ใบนี้สร้างมา ${fmt(age)} วัน` : ""}</p>
          </div>
        );
      }
      case "dispatch": return (
        <div className="space-y-2">
          <p className="text-[12px] text-slate-600">ทั้งใบ <b>{fmt(m.qty)}</b> ชิ้น · จ่ายแล้ว {fmt(m.dispatched)} · <b className="text-rose-600">เหลือ {fmt(m.remaining)}</b> · รับคืนแล้ว {fmt(p.received)}</p>
          {myWos.length === 0 ? <p className="text-[11px] text-slate-400">ยังไม่ได้จ่ายให้โต๊ะ/ช่างไหน</p> : (
            <div className="max-w-2xl divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {myWos.map((w) => {
                const b = HIST_BADGE[w.status] ?? { t: w.status, c: "bg-slate-100 text-slate-600" };
                const left = Math.max(0, (w.qty || 0) - (w.received_qty || 0));
                return (
                  <div key={w.id} className="flex items-center gap-3 px-2.5 py-1.5 text-[12px]">
                    <span className="min-w-0 flex-1 truncate">{w.department_name ?? "—"}{w.assignee_name && w.assignee_name !== w.department_name ? ` · ${w.assignee_name}` : ""}</span>
                    <span className="font-mono text-[10px] text-slate-400">{w.wo_no}</span>
                    <span className="tabular-nums">จ่าย {fmt(w.qty)}{w.received_qty ? ` · คืน ${fmt(w.received_qty)}` : ""}{left > 0 && w.received_qty ? ` · ค้าง ${fmt(left)}` : ""}</span>
                    {w.due_date && <DaysTag ymd={w.due_date} />}
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${b.c}`}>{b.t}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canEdit && m.remaining > 0 && <Btn touch={touch} primary onClick={p.onDispatch}>🚚 จ่ายงานใบนี้ ({fmt(m.remaining)} ชิ้น)</Btn>}
            <Btn touch={touch} onClick={p.onOpenChecklist}>✏️ แก้จำนวนสั่งผลิต (ในเช็กลิสต์)</Btn>
          </div>
        </div>
      );
      case "due": return <DuePane m={m} canEdit={canEdit} plans={p.plans} onSaveDue={p.onSaveDue} onAddPlan={p.onAddPlan} onDelPlan={p.onDelPlan} />;
      case "group": return (
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
          <span>กลุ่มตอนนี้: {p.groupName ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">{p.groupName}</span> : <span className="text-slate-400">ยังไม่จับกลุ่ม</span>}</span>
          {canEdit && <Btn touch={touch} onClick={p.onAssignGroup}>🗂 {p.groupName ? "ย้าย" : "จับ"}เข้ากลุ่ม</Btn>}
        </div>
      );
      case "hist": return <HistPane m={m} />;
    }
  })();
  const title = PEND_PANES.find(([k]) => k === pane)?.[1] ?? "";
  const small = touch ? "h-10 px-3 text-sm" : "h-7 px-2.5 text-xs";
  return (
    <div onClick={(e) => e.stopPropagation()} className="cursor-default">
      {/* หัวแผง: ไม่มีแถบแท็บ — จะดูเรื่องไหนให้กดช่องนั้นในแถว */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-700">{title}</span>
        {pane !== "job" && <button type="button" onClick={() => p.onPane("job")} className={`${small} rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>← รายละเอียดงาน</button>}
        <span className="ml-auto flex gap-1.5">
          {pane === "job" && <button type="button" onClick={() => setPrefsOpen((v) => !v)} title="ปรับรายละเอียดงานของฉัน (ซ่อนปุ่ม/กล่อง)"
            className={`${small} rounded-lg border ${prefsOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>⚙️</button>}
          <button type="button" onClick={p.onClose} className={`${small} rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50`}>พับ ✕</button>
        </span>
      </div>
      {pane === "job" && prefsOpen && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2">
          <p className="mb-1 text-[11px] text-slate-500">ปรับรายละเอียดงานของฉัน — จำไว้ให้คุณคนเดียว ตามไปทุกเครื่อง</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {DETAIL_BTNS.map(([k, l]) => (
              <label key={k} className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-700"><input type="checkbox" checked={btnOn(k)} onChange={() => togglePref("hideBtns", k)} className="h-4 w-4 accent-blue-600" />{l}</label>
            ))}
            {DETAIL_SECS.map(([k, l]) => (
              <label key={k} className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-700"><input type="checkbox" checked={secOn(k)} onChange={() => togglePref("hideSecs", k)} className="h-4 w-4 accent-blue-600" />กล่อง {l}</label>
            ))}
          </div>
        </div>
      )}
      {body}
    </div>
  );
}
