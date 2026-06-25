"use client";

/**
 * Dashboard ผลิต — หน้าแรกแอปผลิต/จ่ายงาน · รวมงานผลิตทุกสถานะ (MO-centric)
 * แถบ filter ซ้าย (5 กลุ่ม + ตัวเลขนับ) · DataTable กลาง (สลับ ตาราง/การ์ด + ค้นหา) · ปฏิทิน=เฟส 2
 * ของกลาง: DataTable, HoverImage, getStatusStyle, PlaygroundShell (ผ่าน /master/layout)
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { HoverImage } from "@/components/hover-image";
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

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-300">—</span>;
  const s = getStatusStyle(status);
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>;
}

// จัดกลุ่ม (โหมดการ์ด) — แบรนด์ / สถานะ / เดือนกำหนดส่ง
type GroupField = "brand" | "status" | "due_month";
const GROUP_FIELDS: { key: GroupField; label: string }[] = [
  { key: "brand", label: "แบรนด์" }, { key: "status", label: "สถานะ" }, { key: "due_month", label: "เดือนกำหนดส่ง" },
];
const groupValueOf = (j: ProductionJob, f: GroupField): string =>
  f === "brand" ? (j.brand || "— ไม่มีแบรนด์ —")
  : f === "status" ? (j.status ? getStatusStyle(j.status).label : "—")
  : (j.due_date ? new Date(j.due_date).toLocaleDateString("th-TH", { year: "numeric", month: "long" }) : "— ไม่มีกำหนดส่ง —");

// การ์ดงาน 1 ใบ (โหมดจัดกลุ่ม)
function JobCard({ j }: { j: ProductionJob }) {
  const od = isOverdue(j.due_date);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 hover:shadow-sm transition-shadow">
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
            {j.due_date && <span className={od ? "text-red-600 font-semibold" : ""}>{od && "⚠ "}ส่ง {new Date(j.due_date).toLocaleDateString("th-TH")}</span>}
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
  { accessorKey: "due_date", header: "กำหนดส่ง", size: 110, cell: ({ getValue }) => { const d = getValue() as string | null; if (!d) return <span className="text-xs text-slate-300">—</span>; const od = isOverdue(d); return <span className={`text-xs ${od ? "text-red-600 font-semibold" : "text-slate-500"}`}>{od && "⚠ "}{new Date(d).toLocaleDateString("th-TH")}</span>; } },
  { accessorKey: "status", header: "สถานะ", size: 120, cell: ({ getValue }) => <StatusBadge status={getValue() as string | null} /> },
];

export default function ProductionDashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [counts, setCounts] = useState<ProductionDashboardResponse["counts"]>({ all: 0, unassigned: 0, in_production: 0, piecework: 0, done_waiting: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<CatKey>("all");
  const [grouped, setGrouped] = useState(false);
  const [groupField, setGroupField] = useState<GroupField>("brand");
  const [gSearch, setGSearch] = useState("");

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
        <button onClick={() => router.push("/master/work-board")} className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">🗂 ไปบอร์ดจ่ายงาน</button>
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
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="w-4 h-4 accent-blue-600" /> จัดกลุ่ม
            </label>
            {grouped && <>
              <select value={groupField} onChange={(e) => setGroupField(e.target.value as GroupField)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                {GROUP_FIELDS.map((g) => <option key={g.key} value={g.key}>ตาม{g.label}</option>)}
              </select>
              <input value={gSearch} onChange={(e) => setGSearch(e.target.value)} placeholder="🔍 ค้นหา SKU / ชื่อ / ใบสั่งผลิต" className="h-8 px-3 text-sm border border-slate-200 rounded-lg flex-1 min-w-[180px] max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </>}
            {!grouped && <span className="text-[11px] text-slate-400">ติ๊ก “จัดกลุ่ม” เพื่อดูการ์ดแยกกลุ่ม · หรือใช้ปุ่มสลับ ตาราง/การ์ด + ค้นหาในตารางด้านล่าง</span>}
          </div>

          {grouped ? (
            loading ? <div className="py-16 text-center text-slate-400">กำลังโหลด…</div>
            : groups.length === 0 ? <div className="py-16 text-center text-slate-400">{cat === "all" ? "ยังไม่มีงานผลิต" : "ไม่มีงานในกลุ่มนี้"}</div>
            : <div className="space-y-4">
                {groups.map(([label, items]) => (
                  <div key={label}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-bold text-slate-700">{label}</h3>
                      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{items.length}</span>
                    </div>
                    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                      {items.map((j) => <JobCard key={j.id} j={j} />)}
                    </div>
                  </div>
                ))}
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
              emptyMessage={cat === "all" ? "ยังไม่มีงานผลิต" : "ไม่มีงานในกลุ่มนี้"}
              enableCards
              defaultViewMode="cards"
              cardConfig={{ primary: "product_name", subtitle: "product_sku", image: "image_url", badges: ["status"], lines: ["brand", "mo_no", "due_date", "dept_names"], imageHeight: "md" }}
              exportFilename="production-dashboard"
            />
          )}
        </main>
      </div>
    </div>
  );
}
