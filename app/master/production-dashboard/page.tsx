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

        {/* เนื้อหา — DataTable (ตาราง/การ์ด) */}
        <main className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 p-3">
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
        </main>
      </div>
    </div>
  );
}
