"use client";

import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ActivityFeed } from "@/components/activity-feed";
import type { ActivityEntry } from "@/components/activity-feed";
import { usePermission, AccessDenied } from "@/components/auth";
import type { AuditLogsResponse } from "@/app/api/audit-logs/route";

const ACTION_FILTERS = [
  { value: "",       label: "ทั้งหมด" },
  { value: "create", label: "เพิ่ม" },
  { value: "update", label: "แก้ไข" },
  { value: "delete", label: "ลบ" },
];

export default function AuditLogPage() {
  const allowed = usePermission("admin.audit_log");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [total,   setTotal]   = useState(0);
  const [action,  setAction]  = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (action) params.set("action", action);
      const res = await fetch(`/api/audit-logs?${params}`);
      const json: AuditLogsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setEntries(json.data);
      setTotal(json.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => { if (allowed) fetchLogs(); }, [fetchLogs, allowed]);

  // นับแต่ละ action
  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});

  if (!allowed) {
    return <PlaygroundShell><AccessDenied message="หน้าประวัติการใช้งานต้องเป็นผู้จัดการขึ้นไป" /></PlaygroundShell>;
  }

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          📜 Audit Log — ประวัติการใช้งาน
        </div>
        <h1 className="text-2xl font-bold text-slate-900">ประวัติการใช้งาน (Audit Log)</h1>
        <p className="text-slate-500 mt-1">
          บันทึกทุก action สำคัญ — ใคร ทำอะไร เมื่อไหร่ เปลี่ยนจากอะไรเป็นอะไร
        </p>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="ทั้งหมด" value={total} color="slate" />
          <StatCard label="เพิ่ม" value={counts.create ?? 0} color="emerald" />
          <StatCard label="แก้ไข" value={counts.update ?? 0} color="blue" />
          <StatCard label="ลบ" value={counts.delete ?? 0} color="red" />
        </div>

        {/* Filter + content */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 flex-wrap">
            <span className="text-sm font-medium text-slate-700">กรองตาม:</span>
            {ACTION_FILTERS.map(f => (
              <button key={f.value} onClick={() => setAction(f.value)}
                className={`h-7 px-3 text-xs font-medium rounded-md border transition-colors ${
                  action === f.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}>
                {f.label}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={fetchLogs}
              className="h-7 px-3 text-xs text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50">
              🔄 รีเฟรช
            </button>
          </div>

          {/* Feed */}
          <div className="p-6">
            {error ? (
              <div className="text-center py-8 text-sm text-red-600">⚠️ {error}</div>
            ) : (
              <ActivityFeed
                entries={entries}
                loading={loading}
                showEntityName
                emptyMessage="ยังไม่มีประวัติการใช้งาน — ลองเพิ่ม/แก้/ลบสินค้าในหน้า Products CRUD"
              />
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">
          ข้อมูลจากตาราง <code className="font-mono bg-slate-100 px-1 rounded">audit_logs</code> กลาง —
          แสดงเฉพาะ entity ของ playground (ไม่เห็น log production)
        </p>
      </div>
    </PlaygroundShell>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "slate" | "emerald" | "blue" | "red" }) {
  const tones = {
    slate:   "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue:    "bg-blue-50 text-blue-700",
    red:     "bg-red-50 text-red-600",
  };
  return (
    <div className={`rounded-xl p-4 ${tones[color]}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</p>
    </div>
  );
}
