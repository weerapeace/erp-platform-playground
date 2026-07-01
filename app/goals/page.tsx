"use client";

// หน้ารายการเป้าหมาย (เฟส 2a) — ดึงข้อมูลจริงจาก /api/goals ผ่าน service กลาง
import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import {
  CATEGORY_LABEL, goalProgress, daysLeft,
  type Goal, type GoalDraft,
} from "./mock-data";
import { listGoals, createGoal } from "./api";
import { GoalStatusBadge, GoalHealthBadge, ProgressBar } from "./goal-badges";
import { GoalFormModal } from "./goal-form-modal";
import { GameBar } from "./game-bar";

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${TH_MONTH[m - 1]} ${y}` : iso;
}

export default function GoalsListPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const myName = user?.name ?? "";
  const myId = user?.id ?? "";

  const load = useCallback(() => {
    setLoading(true);
    listGoals()
      .then((gs) => { setGoals(gs); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const kpi = useMemo(() => ({
    total: goals.length,
    active: goals.filter((g) => g.status === "active").length,
    risk: goals.filter((g) => g.status === "active" && (g.health === "at_risk" || g.health === "off_track")).length,
    achieved: goals.filter((g) => g.status === "achieved").length,
  }), [goals]);

  const columns = useMemo<ColumnDef<Goal>[]>(() => [
    {
      accessorKey: "goal_no",
      header: "เลขที่",
      cell: ({ row }) => <span className="font-mono text-xs text-slate-500">{row.original.goal_no}</span>,
    },
    {
      accessorKey: "title",
      header: "เป้าหมาย",
      cell: ({ row }) => (
        <div className="min-w-[220px]">
          <div className="font-medium text-slate-900 line-clamp-1">{row.original.title}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {CATEGORY_LABEL[row.original.category] ?? row.original.category}
            {row.original.level === "personal" && " · ส่วนตัว"}
          </div>
        </div>
      ),
    },
    { accessorKey: "owner", header: "เจ้าของ", cell: ({ row }) => <span className="text-sm text-slate-700">{row.original.owner}</span> },
    {
      id: "progress",
      header: "ความคืบหน้า",
      cell: ({ row }) => {
        const p = goalProgress(row.original);
        return (
          <div className="w-32">
            <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">คืบหน้า</span><span className="font-medium text-slate-700">{p}%</span></div>
            <ProgressBar pct={p} />
          </div>
        );
      },
    },
    {
      id: "health",
      header: "สุขภาพ",
      cell: ({ row }) => (row.original.status === "active" ? <GoalHealthBadge health={row.original.health} /> : <span className="text-slate-300">—</span>),
    },
    {
      accessorKey: "target_date",
      header: "เส้นตาย",
      cell: ({ row }) => {
        const dl = daysLeft(row.original.target_date);
        const active = row.original.status === "active";
        return (
          <div className="text-sm">
            <div className="text-slate-700">{fmtDate(row.original.target_date)}</div>
            {active && dl != null && (
              <div className={`text-xs ${dl < 0 ? "text-red-500" : dl <= 14 ? "text-amber-600" : "text-slate-400"}`}>
                {dl < 0 ? `เลย ${-dl} วัน` : dl === 0 ? "วันนี้" : `เหลือ ${dl} วัน`}
              </div>
            )}
          </div>
        );
      },
    },
    { accessorKey: "status", header: "สถานะ", cell: ({ row }) => <GoalStatusBadge status={row.original.status} /> },
  ], []);

  const views = useMemo(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "mine", label: "เป้าหมายของฉัน", filter: (r: Record<string, unknown>) => !!myId && (r as unknown as Goal).owner_id === myId },
    { id: "team", label: "เป้าหมายทีม", filter: (r: Record<string, unknown>) => (r as unknown as Goal).level === "team" },
    { id: "risk", label: "กำลังเสี่ยง/หลุดเป้า", filter: (r: Record<string, unknown>) => { const g = r as unknown as Goal; return g.status === "active" && (g.health === "at_risk" || g.health === "off_track"); } },
    { id: "achieved", label: "สำเร็จแล้ว", filter: (r: Record<string, unknown>) => (r as unknown as Goal).status === "achieved" },
  ], [myId]);

  async function handleCreate(draft: GoalDraft): Promise<boolean> {
    try {
      const g = await createGoal(draft);
      setGoals((prev) => [g, ...prev]);
      setCreateOpen(false);
      toast.success(`ตั้งเป้าหมาย "${g.title}" แล้ว`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างเป้าหมายไม่สำเร็จ");
      return false;
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🎯 เป้าหมาย & เส้นทางสู่ความสำเร็จ</h1>
          <p className="text-sm text-slate-500 mt-0.5">สวัสดี {myName || "ผู้ใช้"} · ตั้งเป้าหมาย แตกเป็นขั้นบันได แล้วเดินไปทีละก้าว</p>
        </div>
        <div className="flex items-center gap-2">
          <GameBar />
          <button
            onClick={() => setCreateOpen(true)}
            className="h-10 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
          >
            + ตั้งเป้าหมายใหม่
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCard label="เป้าหมายทั้งหมด" value={kpi.total} color="text-slate-900" />
        <KpiCard label="กำลังทำ" value={kpi.active} color="text-blue-600" />
        <KpiCard label="กำลังเสี่ยง" value={kpi.risk} color="text-amber-600" />
        <KpiCard label="สำเร็จแล้ว" value={kpi.achieved} color="text-emerald-600" />
      </div>

      {/* ตารางกลาง */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
        <DataTable<Goal>
          data={goals}
          columns={columns}
          loading={loading}
          error={error ?? undefined}
          onRetry={load}
          tableId="goals"
          views={views}
          searchableKeys={["title", "goal_no", "owner", "category"]}
          searchPlaceholder="ค้นหาเป้าหมาย / เลขที่ / เจ้าของ..."
          emptyMessage="ยังไม่มีเป้าหมาย — กด “ตั้งเป้าหมายใหม่” เพื่อเริ่มเป้าแรก!"
          onRowClick={(g) => router.push(`/goals/${g.id}`)}
          rowActions={[{ label: "เปิดดู", onClick: (g) => router.push(`/goals/${g.id}`) }]}
          enableCards
          cardConfig={{ primary: "title", subtitle: "owner" }}
          exportFilename="goals"
        />
      </div>

      <GoalFormModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
