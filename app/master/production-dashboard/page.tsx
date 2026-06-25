"use client";

/**
 * Dashboard ผลิต — หน้าแรกแอปผลิต/จ่ายงาน · รวมงานผลิตทุกสถานะ (MO-centric)
 * แถบ filter ซ้าย (5 กลุ่ม + ตัวเลขนับ) · DataTable กลาง (สลับ ตาราง/การ์ด + ค้นหา) · ปฏิทิน=เฟส 2
 * ของกลาง: DataTable, HoverImage, getStatusStyle, PlaygroundShell (ผ่าน /master/layout)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { HoverImage } from "@/components/hover-image";
import { ERPModal } from "@/components/modal";
import { getStatusStyle } from "@/lib/status-config";
import { apiFetch } from "@/lib/api";
import type { ProductionJob, ProductionDashboardResponse, ProdJobCategory } from "@/app/api/mo/production-dashboard/route";

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

// จัดกลุ่ม (โหมดการ์ด) — แบรนด์ / สถานะ / เดือนกำหนดส่ง
type GroupField = "mo_group" | "brand" | "status" | "due_month";
const GROUP_FIELDS: { key: GroupField; label: string }[] = [
  { key: "mo_group", label: "ใบสั่งงาน (ชุด)" }, { key: "brand", label: "แบรนด์" }, { key: "status", label: "สถานะ" }, { key: "due_month", label: "เดือนกำหนดส่ง" },
];
const groupValueOf = (j: ProductionJob, f: GroupField): string =>
  f === "mo_group" ? (j.mo_group || "— ยังไม่จับชุด —")
  : f === "brand" ? (j.brand || "— ไม่มีแบรนด์ —")
  : f === "status" ? (j.status ? getStatusStyle(j.status).label : "—")
  : (j.due_date ? new Date(j.due_date).toLocaleDateString("th-TH", { year: "numeric", month: "long" }) : "— ไม่มีกำหนดส่ง —");

// การ์ดงาน 1 ใบ (โหมดจัดกลุ่ม/ปฏิทิน) — คลิกเปิดรายละเอียด
function JobCard({ j, onClick }: { j: ProductionJob; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`rounded-xl border border-slate-200 bg-white p-2.5 hover:shadow-sm transition-shadow ${onClick ? "cursor-pointer hover:border-blue-300" : ""}`}>
      <div className="flex gap-2.5">
        <HoverImage url={j.image_url} size={48} previewSize={260} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">{j.product_name || j.product_sku || "—"}</div>
              <div className="font-mono text-[10px] text-slate-400 truncate">{j.product_sku} · {j.mo_no}</div>
            </div>
            <StatusBadge status={j.status} />
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
        </div>
      </div>
    </div>
  );
}

// ── ปฏิทิน (เฟส 2) — งานตามกำหนดส่ง ──
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function CalendarView({ jobs, onJobClick }: { jobs: ProductionJob[]; onJobClick: (j: ProductionJob) => void }) {
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth());
  const [sel, setSel] = useState<string | null>(null);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, ProductionJob[]>();
    for (const j of jobs) {
      if (!j.due_date) continue;
      const d = new Date(j.due_date);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      const k = dayKey(d);
      (map.get(k) ?? map.set(k, []).get(k)!).push(j);
    }
    return map;
  }, [jobs, y, m]);

  const startDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayKey = dayKey(today);
  const todayMid = new Date(today.toDateString());
  const noDue = jobs.filter((j) => !j.due_date).length;
  const prev = () => (m === 0 ? (setY(y - 1), setM(11)) : setM(m - 1));
  const next = () => (m === 11 ? (setY(y + 1), setM(0)) : setM(m + 1));
  const selJobs = sel ? (jobsByDay.get(sel) ?? []) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={prev} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">‹</button>
          <h3 className="text-base font-bold text-slate-800 w-44 text-center">{new Date(y, m, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" })}</h3>
          <button onClick={next} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">›</button>
          <button onClick={() => { setY(today.getFullYear()); setM(today.getMonth()); }} className="ml-1 h-8 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">เดือนนี้</button>
        </div>
        {noDue > 0 && <span className="text-[11px] text-slate-400">⚠ {noDue} งานยังไม่ระบุกำหนดส่ง (ไม่แสดงในปฏิทิน)</span>}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 mb-1">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const d = new Date(y, m, day); const k = dayKey(d);
          const items = jobsByDay.get(k) ?? [];
          const isToday = k === todayKey;
          const overdue = items.length > 0 && d < todayMid;
          return (
            <button key={i} onClick={() => setSel(sel === k ? null : k)}
              className={`min-h-[66px] rounded-lg border p-1 text-left flex flex-col transition-colors ${sel === k ? "ring-2 ring-blue-400 " : ""}${isToday ? "border-blue-400 bg-blue-50/50" : overdue ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
              <span className={`text-[11px] font-semibold ${isToday ? "text-blue-700" : overdue ? "text-red-600" : "text-slate-500"}`}>{day}</span>
              {items.length > 0 && (
                <div className="mt-0.5 space-y-0.5 min-w-0">
                  {items.slice(0, 2).map((j) => { const s = j.status ? getStatusStyle(j.status) : null; return <div key={j.id} className={`text-[9px] leading-tight truncate rounded px-1 py-0.5 ${s ? `${s.bg} ${s.text}` : "bg-slate-100 text-slate-500"}`}>{j.product_sku || j.mo_no}</div>; })}
                  {items.length > 2 && <div className="text-[9px] text-slate-400 px-1">+{items.length - 2} อื่น ๆ</div>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="text-sm font-bold text-slate-700 mb-2">📅 {new Date(sel).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {selJobs.length} งาน</h4>
          {selJobs.length === 0 ? <p className="text-sm text-slate-400">ไม่มีงานกำหนดส่งวันนี้</p>
            : <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>{selJobs.map((j) => <JobCard key={j.id} j={j} onClick={() => onJobClick(j)} />)}</div>}
        </div>
      )}
    </div>
  );
}

// ── โหมด 🏰 เกม — รูปพื้นหลังแฟนตาซี + ข้อมูลจริงวางทับ ──
function GameSign({ x, y, label, value, sub, w }: { x: number; y: number; label: string; value: React.ReactNode; sub?: string; w?: number }) {
  return (
    <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)", textAlign: "center", width: w ? `${w}%` : undefined, textShadow: "0 1px 4px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.6)" }}>
      <div style={{ fontSize: "clamp(9px,1.25vw,15px)", color: "#fcd34d", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: "clamp(15px,2.6vw,32px)", color: "#fff", fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: "clamp(8px,1vw,12px)", color: "#e2e8f0" }}>{sub}</div>}
    </div>
  );
}
function GameView({ jobs, counts }: { jobs: ProductionJob[]; counts: ProductionDashboardResponse["counts"] }) {
  const [bgKey, setBgKey] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    apiFetch("/api/ui-config?key=production_game").then((r) => r.json()).then((j) => setBgKey((j.value?.bg_key as string) ?? null)).catch(() => setBgKey(null));
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const bgUrl = bgKey ? `/api/r2-image?key=${encodeURIComponent(bgKey)}` : null;
  const totalQty = jobs.reduce((a, j) => a + j.qty, 0);
  const eff = jobs.length ? Math.round(jobs.reduce((a, j) => a + j.progress_pct, 0) / jobs.length) : 0;
  const deptCount = new Map<string, number>();
  for (const j of jobs) if (j.categories.includes("in_production") && j.dept_names) for (const d of j.dept_names.split(", ")) deptCount.set(d, (deptCount.get(d) ?? 0) + 1);
  const benches = [...deptCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const latest = jobs.slice(0, 5);
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "game-bg");
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd }); const j = await r.json();
      if (j.error) throw new Error(j.error);
      await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "production_game", value: { bg_key: j.r2_key } }) });
      setBgKey(j.r2_key);
    } catch (e) { alert(String((e as Error).message)); }
    finally { setUploading(false); }
  };
  const pick = () => fileRef.current?.click();
  const hidden = <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />;

  if (bgKey === undefined) return <div className="py-16 text-center text-slate-400">กำลังโหลด…</div>;
  if (!bgUrl) return (
    <div className="py-16 text-center">
      <p className="text-slate-500 mb-1">ยังไม่ได้ตั้งรูปพื้นหลังเกม</p>
      <p className="text-[11px] text-slate-400 mb-3">อัปรูปฉากแฟนตาซี (ป้ายว่าง) → ระบบจะวางข้อมูลจริงทับให้</p>
      <button onClick={pick} disabled={uploading} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{uploading ? "กำลังอัป…" : "📷 อัปรูปพื้นหลัง"}</button>
      {hidden}
    </div>
  );
  const stats: [string, React.ReactNode][] = [
    ["วันที่", now.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" })],
    ["เวลา", now.toLocaleTimeString("th-TH", { hour12: false })],
    ["ออเดอร์", counts.all],
    ["กำลังผลิต", counts.in_production],
    ["เสร็จ", counts.done_waiting],
    ["ชิ้นรวม", fmt(totalQty)],
    ["ประสิทธิภาพ", `${eff}%`],
  ];
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: `#0b1220 url(${bgUrl}) center/cover no-repeat`, borderRadius: 12, overflow: "hidden" }}>
      {/* แถบสถิติบน */}
      <div style={{ position: "absolute", top: "1.5%", left: "8%", right: "13%", display: "flex", justifyContent: "space-between" }}>
        {stats.map(([l, v]) => (
          <div key={l} style={{ textAlign: "center", textShadow: "0 1px 3px rgba(0,0,0,.9)" }}>
            <div style={{ fontSize: "clamp(7px,0.85vw,11px)", color: "#cbd5e1" }}>{l}</div>
            <div style={{ fontSize: "clamp(10px,1.4vw,17px)", color: "#fde68a", fontWeight: 700, lineHeight: 1.1 }}>{v}</div>
          </div>
        ))}
      </div>
      {/* ป้ายโซน */}
      <GameSign x={17} y={22} label="🪧 รอจ่าย" value={counts.unassigned} sub="งานยังไม่จ่าย" />
      <GameSign x={47} y={15.5} label="🔨 ช่างโต๊ะ" value={counts.in_production} sub="กำลังผลิต" />
      {benches.map((b, i) => <GameSign key={i} x={36 + i * 10.5} y={27.5} label={b[0]} value={`${b[1]}`} sub="งาน" />)}
      <GameSign x={82} y={20} label="🧵 ช่างเหมา" value={counts.piecework} sub="งานเหมา" />
      <GameSign x={50} y={50} label="🔮 QC / เสร็จรอส่ง" value={counts.done_waiting} sub="รอตรวจ/ส่ง" />
      {/* ออเดอร์ล่าสุด (แผงล่างซ้าย-กลาง) */}
      <div style={{ position: "absolute", left: "33%", bottom: "2.5%", width: "32%", color: "#e8eefc", textShadow: "0 1px 2px rgba(0,0,0,.9)" }}>
        <div style={{ fontSize: "clamp(8px,1vw,12px)", color: "#fcd34d", fontWeight: 700, marginBottom: 2 }}>ออเดอร์ล่าสุด</div>
        {latest.map((j) => (
          <div key={j.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: "clamp(7px,0.9vw,11px)", lineHeight: 1.5 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.product_sku ?? j.mo_no}</span>
            <span style={{ color: isOverdue(j.due_date) ? "#fca5a5" : "#cbd5e1", flexShrink: 0 }}>{j.progress_pct}%</span>
          </div>
        ))}
      </div>
      <button onClick={pick} disabled={uploading} style={{ position: "absolute", top: 8, right: 8, fontSize: 12, padding: "4px 10px", borderRadius: 8, background: "rgba(15,23,42,.7)", color: "#fde68a", border: "1px solid rgba(252,211,77,.4)", cursor: "pointer" }}>{uploading ? "อัป…" : "📷 เปลี่ยนรูป"}</button>
      {hidden}
    </div>
  );
}

const COLUMNS: ColumnDef<ProductionJob>[] = [
  { id: "image", header: "", size: 56, enableSorting: false, cell: ({ row }) => <HoverImage url={row.original.image_url} size={36} previewSize={240} /> },
  { accessorKey: "product_sku", header: "SKU", size: 130, cell: ({ getValue }) => <span className="font-mono text-xs text-slate-700">{(getValue() as string) || "—"}</span> },
  { accessorKey: "product_name", header: "ชื่อสินค้า", size: 220, cell: ({ getValue }) => <span className="text-sm text-slate-700 line-clamp-2">{(getValue() as string) || "—"}</span> },
  { accessorKey: "mo_no", header: "ใบสั่งผลิต", size: 150, cell: ({ getValue }) => <span className="font-mono text-[11px] text-slate-400">{(getValue() as string) || "—"}</span> },
  { accessorKey: "brand", header: "แบรนด์", size: 120, meta: { filterable: true }, cell: ({ row }) => row.original.brand ? <span className="inline-flex items-center gap-1.5 text-sm text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: row.original.brand_color || "#cbd5e1" }} />{row.original.brand}</span> : <span className="text-slate-300">—</span> },
  { accessorKey: "qty", header: "จำนวน", size: 80, cell: ({ getValue }) => <span className="tabular-nums text-sm text-slate-600">{fmt(getValue() as number)}</span> },
  { accessorKey: "progress_pct", header: "คืบหน้า", size: 120, cell: ({ row }) => { const v = row.original.progress_pct; return <div className="flex items-center gap-1.5"><div className="h-1.5 w-14 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${v}%` }} /></div><span className="text-[11px] text-slate-400 tabular-nums">{fmt(row.original.received)}/{fmt(row.original.qty)}</span></div>; } },
  { accessorKey: "remaining", header: "เหลือจ่าย", size: 90, cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="tabular-nums text-sm font-semibold text-indigo-600">{fmt(v)}</span> : <span className="text-slate-300">—</span>; } },
  { accessorKey: "dept_names", header: "โต๊ะ/ช่าง", size: 160, cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.worker_names || row.original.dept_names || <span className="text-slate-300">—</span>}</span> },
  { accessorKey: "due_date", header: "กำหนดส่ง", size: 110, cell: ({ getValue }) => { const d = getValue() as string | null; if (!d) return <span className="text-xs text-slate-300">—</span>; const tone = dueTone(d); return <span className={`text-xs ${tone || "text-slate-500"}`}>{isOverdue(d) && "⚠ "}{new Date(d).toLocaleDateString("th-TH")}</span>; } },
  { accessorKey: "status", header: "สถานะ", size: 120, cell: ({ getValue }) => <StatusBadge status={getValue() as string | null} /> },
];

export default function ProductionDashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [counts, setCounts] = useState<ProductionDashboardResponse["counts"]>({ all: 0, unassigned: 0, in_production: 0, piecework: 0, done_waiting: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<CatKey>("all");
  const [grouped, setGrouped] = useState(true);            // เปิดมา = จัดกลุ่มเลย
  const [groupField, setGroupField] = useState<GroupField>("brand");
  const [gSearch, setGSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());   // กลุ่มที่พับอยู่
  const [view, setView] = useState<"list" | "calendar" | "game">("list");
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">📊 Dashboard ผลิต</h1>
          <p className="text-sm text-slate-500 mt-0.5">งานผลิตทุกสถานะ — กรองซ้าย · สลับ ตาราง/การ์ด · ค้นหาได้</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden text-sm">
            <button onClick={() => setView("list")} className={`h-9 px-3 font-medium ${view === "list" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋 รายการ</button>
            <button onClick={() => setView("calendar")} className={`h-9 px-3 font-medium border-l border-slate-200 ${view === "calendar" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📅 ปฏิทิน</button>
            <button onClick={() => setView("game")} className={`h-9 px-3 font-medium border-l border-slate-200 ${view === "game" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🏰 เกม</button>
          </div>
          <button onClick={() => router.push("/master/work-board")} className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">🗂 ไปบอร์ดจ่ายงาน</button>
        </div>
      </div>

      {/* การ์ดสรุปเลข (ตาม filter ปัจจุบัน) */}
      <div className="px-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: "งานในมุมมองนี้", value: fmt(kpi.total), icon: "📋", tone: "text-slate-700" },
          { label: "ชิ้นรวม", value: fmt(kpi.qty), icon: "🔢", tone: "text-slate-700" },
          { label: "เหลือจ่าย (ชิ้น)", value: fmt(kpi.remaining), icon: "📥", tone: "text-indigo-600" },
          { label: "เลยกำหนดส่ง", value: fmt(kpi.overdue), icon: "⚠️", tone: kpi.overdue > 0 ? "text-red-600" : "text-slate-400" },
        ]).map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-3 py-2.5">
            <div className="text-[11px] text-slate-400">{k.icon} {k.label}</div>
            <div className={`text-xl font-bold tabular-nums ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex gap-4 p-4 min-h-0">
        {/* แถบ filter ซ้าย */}
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

        {/* เนื้อหา */}
        <main className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 p-3">
          {view === "game" ? <GameView jobs={jobs} counts={counts} /> : view === "calendar" ? <CalendarView jobs={shown} onJobClick={setSelectedJob} /> : <>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="w-4 h-4 accent-blue-600" /> จัดกลุ่ม
            </label>
            {grouped && <>
              <select value={groupField} onChange={(e) => setGroupField(e.target.value as GroupField)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                {GROUP_FIELDS.map((g) => <option key={g.key} value={g.key}>ตาม{g.label}</option>)}
              </select>
              <input value={gSearch} onChange={(e) => setGSearch(e.target.value)} placeholder="🔍 ค้นหา SKU / ชื่อ / ใบสั่งผลิต" className="h-8 px-3 text-sm border border-slate-200 rounded-lg flex-1 min-w-[160px] max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {groups.length > 0 && (() => { const allC = collapsed.size >= groups.length; return (
                <button onClick={() => setCollapsed(allC ? new Set() : new Set(groups.map(([l]) => l)))} className="h-8 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shrink-0">{allC ? "▾ กางทั้งหมด" : "▸ พับทั้งหมด"}</button>
              ); })()}
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
                      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                        {items.map((j) => <JobCard key={j.id} j={j} onClick={() => setSelectedJob(j)} />)}
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
              searchPlaceholder="ค้นหา SKU / ชื่อ / ใบสั่งผลิต / แบรนด์"
              searchableKeys={["product_sku", "product_name", "mo_no", "brand"]}
              onRowClick={setSelectedJob}
              emptyMessage={cat === "all" ? "ยังไม่มีงานผลิต" : "ไม่มีงานในกลุ่มนี้"}
              enableCards
              defaultViewMode="cards"
              cardConfig={{ primary: "product_name", subtitle: "product_sku", image: "image_url", badges: ["status"], lines: ["brand", "mo_no", "due_date", "dept_names"], imageHeight: "md" }}
              exportFilename="production-dashboard"
            />
          )}
          </>}
        </main>
      </div>

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
}
