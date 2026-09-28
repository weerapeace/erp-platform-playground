"use client";

/**
 * Dashboard ผลิต — หน้าแรกแอปผลิต/จ่ายงาน · รวมงานผลิตทุกสถานะ (MO-centric)
 * แถบ filter ซ้าย (5 กลุ่ม + ตัวเลขนับ) · DataTable กลาง (สลับ ตาราง/การ์ด + ค้นหา) · ปฏิทิน (ScheduleBoard)
 * ดูได้ 3 แบบ: จอคอม / แท็บเล็ต / มือถือ (ของกลาง device-view — ตัดสินด้วย `layout` ไม่ใช้ sm:/lg:)
 * ของกลาง: DataTable, HoverImage, getStatusStyle, ScheduleBoard, device-view, PlaygroundShell (ผ่าน /master/layout)
 */
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { HoverImage } from "@/components/hover-image";
import { ERPModal } from "@/components/modal";
import { getStatusStyle } from "@/lib/status-config";
import { PendingDataButton } from "@/components/pending-data-report";
import { apiFetch } from "@/lib/api";
import type { ProductionJob, ProductionDashboardResponse, ProdJobCategory } from "@/app/api/mo/production-dashboard/route";
import { ScheduleBoard, type SchedFilter } from "@/components/schedule-board";
import { MoStatusModal } from "@/components/mo-status-modal";
import { MO_STATUS_TONE_CLASS, type MoStatusTone } from "@/lib/mo-status";
import { useViewportLayout, useDeviceMode, DeviceModeToggle, DevicePreviewFrame, type DeviceLayout } from "@/components/device-view";

type CatKey = "all" | ProdJobCategory;
const CATS: { key: CatKey; label: string; icon: string }[] = [
  { key: "all", label: "งานทั้งหมด", icon: "📋" },
  { key: "unassigned", label: "งานยังไม่จ่าย", icon: "📥" },
  { key: "in_production", label: "งานกำลังผลิต", icon: "🔨" },
  { key: "piecework", label: "งานเหมารายชิ้น", icon: "✂️" },
  { key: "done_waiting", label: "งานเสร็จรอส่ง", icon: "✅" },
];

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());
const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null;
// สีกำหนดส่ง: เลยกำหนด=แดง · ใกล้ครบ (≤3 วัน)=ส้ม
const dueTone = (d: string | null): string => { const n = daysUntil(d); if (n === null) return ""; if (n < 0) return "text-red-600 font-semibold"; if (n <= 3) return "text-amber-600 font-medium"; return ""; };

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-300">—</span>;
  const s = getStatusStyle(status);
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>;
}

// ℹ️ ป้ายอธิบาย logic ของสถานะงาน 9 ขั้น (มุมขวาบน)
const STATUS_LEGEND: { tone: MoStatusTone; label: string; logic: string }[] = [
  { tone: "gray",   label: "ยังไม่เริ่ม",   logic: "ยังไม่ได้เตรียม/ตัด" },
  { tone: "rose",   label: "ของไม่ครบ",    logic: "เริ่มเตรียมแล้ว แต่วัตถุดิบยังไม่ครบทุกรายการ" },
  { tone: "amber",  label: "รอตัด",         logic: "เตรียมครบแล้ว · ยังไม่ได้ตัด" },
  { tone: "rose",   label: "ตัด·ของไม่ครบ", logic: "ตัดไปบ้าง แต่ของเตรียมยังไม่ครบ" },
  { tone: "green",  label: "พร้อมจ่าย",     logic: "เตรียม+ตัด ครบทุกรายการ · ยังไม่จ่าย" },
  { tone: "indigo", label: "กำลังผลิต",     logic: "จ่ายงานให้โต๊ะครบจำนวนแล้ว" },
  { tone: "indigo", label: "จ่ายบางส่วน",  logic: "จ่ายไปบ้าง · ยังจ่ายไม่ครบจำนวน" },
  { tone: "amber",  label: "ส่งบางส่วน",   logic: "ช่างส่งคืนมาบ้าง · ยังไม่ครบ" },
  { tone: "green",  label: "ส่งครบ",        logic: "รับคืนครบจำนวน (จบงาน)" },
];

// floating = มือถือ: ป๊อปลอยเต็มความกว้างจอ (ไม่ล้นขอบ) + ปุ่มเหลือแค่ไอคอน
function StatusLegend({ floating = false }: { floating?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} title="ความหมาย/logic ของสถานะงาน"
        className="h-9 px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-1 text-sm shrink-0">ℹ️ {!floating && <span>สถานะ</span>}</button>
      {open && (
        <div className={`z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 ${floating ? "fixed inset-x-2 top-14" : "absolute right-0 top-full mt-1 w-[19rem]"}`}>
          <div className="text-sm font-semibold text-slate-700 mb-2">สถานะงาน 9 ขั้น — คิดจากอะไร</div>
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {STATUS_LEGEND.map((it, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${MO_STATUS_TONE_CLASS[it.tone]}`}>{i + 1}. {it.label}</span>
                <span className="text-[11px] text-slate-500 flex-1 pt-0.5">{it.logic}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">💡 ถ้าจ่าย/ส่งแล้วแต่ของยังไม่ครบ → ขึ้นสถานะจ่าย/ส่งก่อน (มีป้ายเตือนในป๊อปอัปสถานะ)</div>
        </div>
      )}
    </div>
  );
}

// จัดกลุ่ม (โหมดการ์ด) — แบรนด์ / หมวดสินค้า / สถานะ / เดือนกำหนดส่ง
type GroupField = "mo_group" | "brand" | "category" | "desk" | "status" | "due_month";
const GROUP_FIELDS: { key: GroupField; label: string }[] = [
  { key: "mo_group", label: "ใบสั่งงาน (ชุด)" }, { key: "brand", label: "แบรนด์" }, { key: "category", label: "หมวดสินค้า (ประเภท)" }, { key: "desk", label: "โต๊ะที่ผลิต" }, { key: "status", label: "สถานะ" }, { key: "due_month", label: "เดือนกำหนดส่ง" },
];
const groupValueOf = (j: ProductionJob, f: GroupField): string =>
  f === "mo_group" ? (j.mo_group || "— ยังไม่จับชุด —")
  : f === "brand" ? (j.brand || "— ไม่มีแบรนด์ —")
  : f === "category" ? (j.category || "— ไม่มีหมวด —")
  : f === "desk" ? (j.dept_names || j.worker_names || "— ยังไม่มีโต๊ะ —")
  : f === "status" ? (j.status ? getStatusStyle(j.status).label : "—")
  : (j.due_date ? new Date(j.due_date).toLocaleDateString("th-TH", { year: "numeric", month: "long" }) : "— ไม่มีกำหนดส่ง —");

// การ์ดงาน 1 ใบ (โหมดจัดกลุ่ม/ปฏิทิน) — คลิกเปิดรายละเอียด · vertical = การ์ดแนวตั้ง (รูปบน)
function JobCard({ j, onClick, vertical }: { j: ProductionJob; onClick?: () => void; vertical?: boolean }) {
  const info = (
    <>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">{j.product_name || j.product_sku || "—"}</div>
          <div className="font-mono text-[10px] text-slate-400 truncate">{j.product_sku} · {j.mo_no}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${MO_STATUS_TONE_CLASS[j.status_tone]}`}>{j.status_short}</span>
          <StatusBadge status={j.status} />
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
        {j.brand && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: j.brand_color || "#cbd5e1" }} />{j.brand}</span>}
        <span>จำนวน {fmt(j.qty)}</span>
        {j.remaining > 0 && <span className="text-indigo-600 font-medium">เหลือจ่าย {fmt(j.remaining)}</span>}
        {j.due_date && <span className={dueTone(j.due_date)}>{isOverdue(j.due_date) && "⚠ "}ส่ง {new Date(j.due_date).toLocaleDateString("th-TH")}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${j.progress_pct}%` }} /></div>
        <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{fmt(j.received)}/{fmt(j.qty)}</span>
      </div>
      {(j.worker_names || j.dept_names) && <div className="mt-1 text-[10px] text-slate-400 truncate">🔨 {j.worker_names || j.dept_names}</div>}
    </>
  );
  if (vertical) {
    return (
      <div onClick={onClick} className={`rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-sm transition-shadow ${onClick ? "cursor-pointer hover:border-blue-300" : ""}`}>
        <div className="bg-slate-50 flex items-center justify-center border-b border-slate-100" style={{ aspectRatio: "1 / 1" }}>
          <HoverImage url={j.image_url} size={132} previewSize={280} />
        </div>
        <div className="p-2.5">{info}</div>
      </div>
    );
  }
  return (
    <div onClick={onClick} className={`rounded-xl border border-slate-200 bg-white p-2.5 hover:shadow-sm transition-shadow ${onClick ? "cursor-pointer hover:border-blue-300" : ""}`}>
      <div className="flex gap-2.5">
        <HoverImage url={j.image_url} size={48} previewSize={260} />
        <div className="min-w-0 flex-1">{info}</div>
      </div>
    </div>
  );
}

// ── ปฏิทิน — งานตามกำหนดส่ง + ลากวางตั้งวัน (ใช้ ScheduleBoard ของกลาง) ──
function CalendarView({ jobs, onJobClick, onSchedule, onToggleDelivery, layout }: {
  jobs: ProductionJob[];
  layout: DeviceLayout;
  onJobClick: (j: ProductionJob) => void;
  onSchedule: (j: ProductionJob, date: string | null) => void;
  onToggleDelivery: (j: ProductionJob) => void;
}) {
  // filter ตามแบรนด์ (จากงานที่มี)
  const filters = useMemo<SchedFilter[]>(() => {
    const m = new Map<string, string>();
    for (const j of jobs) if (j.brand) m.set(j.brand, j.brand_color || "#cbd5e1");
    return [{ value: "all", label: "ทั้งหมด" }, ...[...m.entries()].map(([b, c]) => ({ value: b, label: b, color: c }))];
  }, [jobs]);

  return (
    <ScheduleBoard<ProductionJob>
      items={jobs}
      getDate={(j) => j.due_date}
      onSchedule={onSchedule}
      filters={filters}
      getFilter={(j) => j.brand ?? undefined}
      getSearchText={(j) => `${j.product_sku ?? ""} ${j.product_name ?? ""} ${j.mo_no} ${j.brand ?? ""}`}
      backlogTitle="ยังไม่ลงวันที่ส่ง"
      layout={layout}
      getDotColor={(j) => (j.delivery_confirmed ? "#ef4444" : j.brand_color || "#94a3b8")}
      hint={layout === "desktop"
        ? "ลากการ์ดจากกล่องขวา → วางบนวัน = ตั้งวันกำหนดส่ง · ลากกลับกล่อง = เอาวันออก · กดปุ่มในการ์ด = ยืนยันนัดส่งลูกค้า (สีแดง)"
        : "แตะวันที่ = ดูงานของวันนั้น · ตั้ง/เปลี่ยนวันกำหนดส่งที่ช่อง 📅 ใต้การ์ด · สีแดง = นัดส่งลูกค้าแล้ว"}
      dayFooter={(items) => {
        const total = items.reduce((a, j) => a + j.qty, 0);
        const hasDeliv = items.some((j) => j.delivery_confirmed);
        return <div className={`text-[9px] px-1 tabular-nums ${hasDeliv ? "text-red-600 font-semibold" : "text-slate-400"}`}>รวม {fmt(total)} ชิ้น</div>;
      }}
      renderChip={(j) => {
        const s = j.status ? getStatusStyle(j.status) : null;
        const conf = j.delivery_confirmed;
        return (
          <div onClick={() => onJobClick(j)} title={j.product_name ?? j.product_sku ?? j.mo_no ?? ""}
            className={`text-[9px] leading-tight rounded px-1 py-0.5 flex items-center gap-1 ${conf ? "bg-red-50 text-red-700 font-bold" : s ? `${s.bg} ${s.text}` : "bg-slate-100 text-slate-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf ? "bg-red-500" : "bg-slate-400"}`} />
            <span className="truncate flex-1">{j.product_sku || j.mo_no}</span>
            <span className={`shrink-0 tabular-nums ${conf ? "text-red-700 font-bold" : "text-slate-400"}`}>×{fmt(j.qty)}</span>
          </div>
        );
      }}
      renderCard={(j) => (
        <div>
          <JobCard j={j} onClick={() => onJobClick(j)} />
          {j.due_date && (
            <button onClick={(e) => { e.stopPropagation(); onToggleDelivery(j); }}
              className={`mt-1 w-full text-xs py-1 rounded-lg border transition-colors ${j.delivery_confirmed ? "bg-red-50 border-red-300 text-red-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {j.delivery_confirmed ? "🚚 นัดส่งลูกค้าแล้ว ✓ (กดยกเลิก)" : "＋ ตั้งเป็นนัดส่งลูกค้า"}
            </button>
          )}
        </div>
      )}
    />
  );
}

const COLUMNS: ColumnDef<ProductionJob>[] = [
  { id: "image", header: "", size: 56, enableSorting: false, cell: ({ row }) => <HoverImage url={row.original.image_url} size={36} previewSize={240} /> },
  { accessorKey: "product_sku", header: "SKU", size: 130, cell: ({ getValue }) => <span className="font-mono text-xs text-slate-700">{(getValue() as string) || "—"}</span> },
  { accessorKey: "product_name", header: "ชื่อสินค้า", size: 220, cell: ({ getValue }) => <span className="text-sm text-slate-700 line-clamp-2">{(getValue() as string) || "—"}</span> },
  { accessorKey: "mo_no", header: "ใบสั่งผลิต", size: 150, cell: ({ getValue }) => <span className="font-mono text-[11px] text-slate-400">{(getValue() as string) || "—"}</span> },
  { accessorKey: "brand", header: "แบรนด์", size: 120, meta: { filterable: true }, cell: ({ row }) => row.original.brand ? <span className="inline-flex items-center gap-1.5 text-sm text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: row.original.brand_color || "#cbd5e1" }} />{row.original.brand}</span> : <span className="text-slate-300">—</span> },
  { accessorKey: "category", header: "หมวด (ประเภท)", size: 130, meta: { filterable: true }, cell: ({ getValue }) => { const v = getValue() as string | null; return v ? <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{v}</span> : <span className="text-slate-300">—</span>; } },
  { accessorKey: "qty", header: "จำนวน", size: 80, cell: ({ getValue }) => <span className="tabular-nums text-sm text-slate-600">{fmt(getValue() as number)}</span> },
  { accessorKey: "progress_pct", header: "คืบหน้า", size: 120, cell: ({ row }) => { const v = row.original.progress_pct; return <div className="flex items-center gap-1.5"><div className="h-1.5 w-14 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${v}%` }} /></div><span className="text-[11px] text-slate-400 tabular-nums">{fmt(row.original.received)}/{fmt(row.original.qty)}</span></div>; } },
  { accessorKey: "remaining", header: "เหลือจ่าย", size: 90, cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="tabular-nums text-sm font-semibold text-indigo-600">{fmt(v)}</span> : <span className="text-slate-300">—</span>; } },
  { accessorKey: "dept_names", header: "โต๊ะ/ช่าง", size: 160, cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.worker_names || row.original.dept_names || <span className="text-slate-300">—</span>}</span> },
  { accessorKey: "due_date", header: "กำหนดส่ง", size: 110, cell: ({ getValue }) => { const d = getValue() as string | null; if (!d) return <span className="text-xs text-slate-300">—</span>; const tone = dueTone(d); return <span className={`text-xs ${tone || "text-slate-500"}`}>{isOverdue(d) && "⚠ "}{new Date(d).toLocaleDateString("th-TH")}</span>; } },
  { accessorKey: "status", header: "สถานะ", size: 120, cell: ({ getValue }) => <StatusBadge status={getValue() as string | null} /> },
];

function ProductionDashboardInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [counts, setCounts] = useState<ProductionDashboardResponse["counts"]>({ all: 0, unassigned: 0, in_production: 0, piecework: 0, done_waiting: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<CatKey>("all");
  const [grouped, setGrouped] = useState(true);            // เปิดมา = จัดกลุ่มเลย
  const [groupField, setGroupField] = useState<GroupField>("brand");
  const [gSearch, setGSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());   // กลุ่มที่พับอยู่
  const [view, setView] = useState<"list" | "calendar">(() => (sp.get("view") === "calendar" ? "calendar" : "list"));
  // รูปแบบจอ (ของกลาง device-view): อัตโนมัติตามจอจริง หรือเลือกเอง (?device=) → เลือกแคบกว่าจอจริง = กรอบพรีวิว + QR
  const viewport = useViewportLayout();
  const { mode: deviceMode, setMode: setDeviceMode, layout } = useDeviceMode(viewport);
  const isDesktop = layout === "desktop";
  const isPhone = layout === "phone";
  const [cardDir, setCardDir] = useState<"h" | "v">("h");   // การ์ดแนวนอน/แนวตั้ง (โหมดจัดกลุ่ม)
  const [statusMoId, setStatusMoId] = useState<string | null>(null);   // Popup สถานะงาน
  const [selectedJob, setSelectedJob] = useState<ProductionJob | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/mo/production-dashboard").then((r) => r.json()).then((j: ProductionDashboardResponse) => {
      if (!alive) return;
      if (j.error) { setError(j.error); return; }
      setJobs(j.jobs ?? []); setCounts(j.counts ?? counts);
    }).catch((e) => { if (alive) setError(String(e?.message ?? e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => cat === "all" ? jobs : jobs.filter((j) => j.categories.includes(cat)), [jobs, cat]);
  // การ์ดสรุปเลข (ตาม filter ปัจจุบัน)
  const kpi = useMemo(() => ({
    total: shown.length,
    qty: shown.reduce((a, j) => a + j.qty, 0),
    remaining: shown.reduce((a, j) => a + j.remaining, 0),
    overdue: shown.filter((j) => isOverdue(j.due_date) && !j.categories.includes("done_waiting")).length,
  }), [shown]);

  const groups = useMemo(() => {
    if (!grouped) return [] as [string, ProductionJob[]][];
    const q = gSearch.trim().toLowerCase();
    const filtered = q ? shown.filter((j) => `${j.product_sku ?? ""} ${j.product_name ?? ""} ${j.mo_no} ${j.brand ?? ""}`.toLowerCase().includes(q)) : shown;
    const m = new Map<string, ProductionJob[]>();
    for (const j of filtered) { const k = groupValueOf(j, groupField); (m.get(k) ?? m.set(k, []).get(k)!).push(j); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);   // กลุ่มใหญ่ก่อน
  }, [grouped, shown, gSearch, groupField]);

  // ลากวางในปฏิทิน → ตั้ง/ล้างวันกำหนดส่ง (อัปเดตจอทันที + เซฟจริง · ล้มเหลวคืนค่าเดิม)
  const setDue = async (job: ProductionJob, date: string | null) => {
    const prev = job.due_date;
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, due_date: date } : j)));
    try {
      const r = await apiFetch("/api/mo/set-due-date", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, due_date: date }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
    } catch {
      setJobs((js) => js.map((x) => (x.id === job.id ? { ...x, due_date: prev } : x)));
    }
  };

  // กดยืนยัน/ยกเลิก "นัดส่งลูกค้า" (optimistic + เซฟจริง)
  const toggleDelivery = async (job: ProductionJob) => {
    const next = !job.delivery_confirmed;
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, delivery_confirmed: next } : j)));
    try {
      const r = await apiFetch("/api/mo/set-delivery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, confirmed: next }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
    } catch {
      setJobs((js) => js.map((x) => (x.id === job.id ? { ...x, delivery_confirmed: !next } : x)));
    }
  };

  // กดการ์ด → Popup สถานะงาน (มีปุ่มไปเช็กลิสต์เต็มในป๊อปอัป)
  const openJob = (j: ProductionJob) => setStatusMoId(j.id);

  const viewBtn = (v: "list" | "calendar", label: string, first: boolean) => (
    <button key={v} onClick={() => setView(v)}
      className={`${isPhone ? "h-10 flex-1" : "h-9 px-3"} font-medium ${first ? "" : "border-l border-slate-200"} ${view === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
  );
  const viewSwitch = (
    <div className={`flex border border-slate-200 rounded-lg overflow-hidden text-sm ${isPhone ? "w-full" : "shrink-0"}`}>
      {viewBtn("list", "📋 รายการ", true)}
      {viewBtn("calendar", "📅 ปฏิทิน", false)}
    </div>
  );
  const boardBtn = (
    <button onClick={() => router.push("/master/work-board")}
      className={`h-9 font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 whitespace-nowrap ${isPhone ? "flex-1 px-2 text-xs" : "px-4 text-sm shrink-0"}`}>🗂 ไปบอร์ดจ่ายงาน</button>
  );
  const kpis = [
    { label: "งานในมุมมองนี้", short: "งาน", value: fmt(kpi.total), icon: "📋", tone: "text-slate-700" },
    { label: "ชิ้นรวม", short: "ชิ้นรวม", value: fmt(kpi.qty), icon: "🔢", tone: "text-slate-700" },
    { label: "เหลือจ่าย (ชิ้น)", short: "เหลือจ่าย", value: fmt(kpi.remaining), icon: "📥", tone: "text-indigo-600" },
    { label: "เลยกำหนดส่ง", short: "เลยกำหนด", value: fmt(kpi.overdue), icon: "⚠️", tone: kpi.overdue > 0 ? "text-red-600" : "text-slate-400" },
  ];

  const body = (
    <div className={`${layout === viewport ? "min-h-screen" : "min-h-[82vh]"} bg-slate-50 flex flex-col`}>
      {isPhone ? (
        // มือถือ: หัวสั้น + ปุ่มสลับมุมมองเต็มแถว + ปุ่มรองแถวล่าง
        <div className="bg-white border-b border-slate-200 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-bold text-slate-900 truncate">📊 Dashboard ผลิต</h1>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusLegend floating />
              <DeviceModeToggle mode={deviceMode} viewport={viewport} onChange={setDeviceMode} compact />
            </div>
          </div>
          {viewSwitch}
          <div className="flex items-center gap-1.5">
            <PendingDataButton scope="production"
              className="h-9 flex-1 px-2 text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 inline-flex items-center justify-center gap-1 whitespace-nowrap" />
            {boardBtn}
          </div>
        </div>
      ) : (
        <div className={`bg-white border-b border-slate-200 flex items-center justify-between gap-3 ${isDesktop ? "px-6 py-4" : "px-4 py-3 flex-wrap"}`}>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">📊 Dashboard ผลิต</h1>
            {isDesktop && <p className="text-sm text-slate-500 mt-0.5">งานผลิตทุกสถานะ — กรองซ้าย · สลับ ตาราง/การ์ด · ค้นหาได้</p>}
          </div>
          <div className={`flex items-center gap-2 ${isDesktop ? "" : "flex-wrap"}`}>
            <PendingDataButton scope="production" />
            <StatusLegend />
            <DeviceModeToggle mode={deviceMode} viewport={viewport} onChange={setDeviceMode} compact />
            {viewSwitch}
            {boardBtn}
          </div>
        </div>
      )}

      {/* การ์ดสรุปเลข (ตาม filter ปัจจุบัน) */}
      <div className={`grid grid-cols-4 ${isPhone ? "px-2 pt-2 gap-1.5" : "px-4 pt-4 gap-3"}`}>
        {kpis.map((k) => (
          <div key={k.label} className={`bg-white rounded-xl border border-slate-200 min-w-0 ${isPhone ? "px-1.5 py-1.5 text-center" : "px-3 py-2.5"}`}>
            <div className={`text-slate-400 truncate ${isPhone ? "text-[10px]" : "text-[11px]"}`}>{isPhone ? k.short : <>{k.icon} {k.label}</>}</div>
            <div className={`font-bold tabular-nums ${isPhone ? "text-sm" : "text-xl"} ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* แท็บเล็ต/มือถือ: ตัวกรองกลุ่มงานเป็นชิปเลื่อนแนวนอน (แทนแถบซ้าย) */}
      {!isDesktop && (
        <div className={`flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] ${isPhone ? "px-2 pt-2" : "px-4 pt-3"}`}>
          {CATS.map((c) => {
            const on = cat === c.key;
            return (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`h-9 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-full border text-sm whitespace-nowrap transition-colors ${on ? "bg-blue-600 text-white border-blue-600 font-medium" : "bg-white text-slate-600 border-slate-200"}`}>
                <span>{c.icon}</span><span>{c.label}</span>
                <span className={`text-xs tabular-nums px-1.5 py-0.5 rounded-full ${on ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{counts[c.key]}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={`flex-1 flex gap-4 min-h-0 ${isPhone ? "p-2" : isDesktop ? "p-4" : "px-4 py-3"}`}>
        {/* แถบ filter ซ้าย (จอคอม) */}
        {isDesktop && (
          <aside className="w-44 shrink-0 space-y-1.5">
            {CATS.map((c) => {
              const n = counts[c.key];
              const on = cat === c.key;
              return (
                <button key={c.key} onClick={() => setCat(c.key)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors ${on ? "bg-blue-600 text-white border-blue-600 font-medium" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  <span className="flex items-center gap-2 min-w-0"><span>{c.icon}</span><span className="truncate">{c.label}</span></span>
                  <span className={`shrink-0 text-xs tabular-nums px-1.5 py-0.5 rounded-full ${on ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{n}</span>
                </button>
              );
            })}
          </aside>
        )}

        {/* เนื้อหา */}
        <main className={`flex-1 min-w-0 bg-white rounded-xl border border-slate-200 ${isPhone ? "p-2" : "p-3"}`}>
          {view === "calendar" ? <CalendarView jobs={shown} onJobClick={openJob} onSchedule={setDue} onToggleDelivery={toggleDelivery} layout={layout} /> : <>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="w-4 h-4 accent-blue-600" /> จัดกลุ่ม
            </label>
            <button onClick={() => { setGrouped(true); setGroupField("desk"); }}
              className={`h-8 px-2.5 text-sm rounded-lg border shrink-0 ${grouped && groupField === "desk" ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>🔨 ตามโต๊ะ</button>
            {grouped && <>
              <select value={groupField} onChange={(e) => setGroupField(e.target.value as GroupField)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                {GROUP_FIELDS.map((g) => <option key={g.key} value={g.key}>ตาม{g.label}</option>)}
              </select>
              <input value={gSearch} onChange={(e) => setGSearch(e.target.value)} placeholder="🔍 ค้นหา SKU / ชื่อ / ใบสั่งผลิต" className={`px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isPhone ? "h-9 w-full order-last" : "h-8 flex-1 min-w-[160px] max-w-xs"}`} />
              {groups.length > 0 && (() => { const allC = collapsed.size >= groups.length; return (
                <button onClick={() => setCollapsed(allC ? new Set() : new Set(groups.map(([l]) => l)))} className="h-8 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shrink-0">{allC ? "▾ กางทั้งหมด" : "▸ พับทั้งหมด"}</button>
              ); })()}
              <div className="inline-flex border border-slate-200 rounded-lg overflow-hidden shrink-0 ml-auto" title="ทิศทางการ์ด">
                <button onClick={() => setCardDir("h")} className={`h-8 px-2.5 text-sm ${cardDir === "h" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>▭ แนวนอน</button>
                <button onClick={() => setCardDir("v")} className={`h-8 px-2.5 text-sm border-l border-slate-200 ${cardDir === "v" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>▯ แนวตั้ง</button>
              </div>
            </>}
            {!grouped && <span className="text-[11px] text-slate-400">ติ๊ก “จัดกลุ่ม” เพื่อดูการ์ดแยกกลุ่ม · หรือใช้ปุ่มสลับ ตาราง/การ์ด + ค้นหาในตารางด้านล่าง</span>}
          </div>

          {grouped ? (
            loading ? <div className="py-16 text-center text-slate-400">กำลังโหลด…</div>
            : groups.length === 0 ? <div className="py-16 text-center text-slate-400">{cat === "all" ? "ยังไม่มีงานผลิต" : "ไม่มีงานในกลุ่มนี้"}</div>
            : <div className="space-y-3">
                {groups.map(([label, items]) => {
                  const open = !collapsed.has(label);
                  return (
                  <div key={label}>
                    <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; })}
                      className="w-full flex items-center gap-2 mb-1.5 text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 sticky top-0 bg-white z-[1]">
                      <span className="text-[10px] w-3 shrink-0 text-slate-400">{open ? "▾" : "▸"}</span>
                      <h3 className="text-sm font-bold text-slate-700 truncate">{label}</h3>
                      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{items.length}</span>
                    </button>
                    {open && (
                      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardDir === "v" ? "150px" : "260px"}, 1fr))` }}>
                        {items.map((j) => <JobCard key={j.id} j={j} onClick={() => openJob(j)} vertical={cardDir === "v"} />)}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
          ) : (
            <DataTable<ProductionJob>
              data={shown}
              columns={COLUMNS}
              loading={loading}
              error={error ?? undefined}
              tableId="production-dashboard"
              searchPlaceholder="ค้นหา SKU / ชื่อ / ใบสั่งผลิต / แบรนด์ / หมวด"
              searchableKeys={["product_sku", "product_name", "mo_no", "brand", "category"]}
              onRowClick={openJob}
              emptyMessage={cat === "all" ? "ยังไม่มีงานผลิต" : "ไม่มีงานในกลุ่มนี้"}
              enableCards
              defaultViewMode="cards"
              cardConfig={{ primary: "product_name", subtitle: "product_sku", image: "image_url", badges: ["status"], lines: ["brand", "category", "mo_no", "due_date", "dept_names"], imageHeight: "md" }}
              exportFilename="production-dashboard"
            />
          )}
          </>}
        </main>
      </div>

      {/* Popup สถานะงาน (กดจากการ์ด/แถว/ปฏิทิน) */}
      {statusMoId && (
        <MoStatusModal moId={statusMoId} onClose={() => setStatusMoId(null)}
          onOpenChecklist={(id) => { setStatusMoId(null); router.push(`/master/work-board?mo=${id}`); }} />
      )}

      {/* ป๊อปอัปรายละเอียดงาน */}
      <ERPModal open={selectedJob !== null} onClose={() => setSelectedJob(null)} size="md" title={selectedJob ? `🧰 ${selectedJob.product_sku ?? selectedJob.mo_no}` : ""}>
        {selectedJob && (() => { const j = selectedJob; return (
          <div className="space-y-3">
            <div className="flex gap-3">
              <HoverImage url={j.image_url} size={72} previewSize={320} />
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-800 leading-snug">{j.product_name || j.product_sku || "—"}</div>
                <div className="font-mono text-xs text-slate-400">{j.product_sku} · {j.mo_no}</div>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                  {j.brand && <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: j.brand_color || "#cbd5e1" }} />{j.brand}</span>}
                  <StatusBadge status={j.status} />
                  {j.due_date && <span className={dueTone(j.due_date) || "text-slate-500"}>{isOverdue(j.due_date) && "⚠ "}กำหนดส่ง {new Date(j.due_date).toLocaleDateString("th-TH")}</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {([["จำนวน", j.qty], ["จ่ายแล้ว", j.dispatched], ["รับคืน", j.received], ["เหลือจ่าย", j.remaining]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="bg-slate-50 rounded-lg py-2"><div className="text-[11px] text-slate-400">{l}</div><div className="text-base font-bold tabular-nums text-slate-700">{fmt(v)}</div></div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${j.progress_pct}%` }} /></div>
              <span className="text-xs text-slate-500 tabular-nums">คืบหน้า {j.progress_pct}%</span>
            </div>
            {(j.worker_names || j.dept_names) && <div className="text-sm text-slate-600">🔨 {j.worker_names || j.dept_names}</div>}
            <div className="flex gap-2 pt-1">
              <a href={`/print/work-order/${j.id}`} target="_blank" rel="noreferrer" className="h-9 px-4 inline-flex items-center text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🖨 พิมพ์ใบสั่งงาน</a>
              <button onClick={() => router.push("/master/work-board")} className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">🗂 ไปบอร์ดจ่ายงาน</button>
            </div>
          </div>
        ); })()}
      </ERPModal>
    </div>
  );

  // เปิดบนเครื่องจริง = เรนเดอร์ตรง ๆ · เลือกโหมดที่แคบกว่าจอจริง = กรอบเครื่อง + QR สแกนเปิดบนเครื่อง
  return <DevicePreviewFrame layout={layout} viewport={viewport} onExitPreview={() => setDeviceMode("auto")}>{body}</DevicePreviewFrame>;
}

// useSearchParams ต้องอยู่ใน Suspense (Next.js) — เปิดโหมดปฏิทินได้ผ่าน ?view=calendar (ใช้ฝังในหน้าผู้บริหาร)
export default function ProductionDashboardPage() {
  return <Suspense fallback={null}><ProductionDashboardInner /></Suspense>;
}
