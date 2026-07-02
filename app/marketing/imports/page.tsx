"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";

interface ImportRow {
  id: string;
  platform: string;
  shop: string;
  report_type: string;
  template_key: string | null;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  row_counts: { daily?: number; hourly?: number; products?: number } | null;
  actor_name: string | null;
  created_at: string;
}

const dt = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function MarketingImportsPage() {
  const { can } = useAuth();
  const canDelete = can("marketing.import.delete" as never);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/marketing/imports");
      const j = await r.json();
      if (!r.ok || j.error) setErr(j.error || "โหลดไม่สำเร็จ");
      else setRows(j.data as ImportRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    setBusyId(id);
    try {
      const r = await apiFetch("/api/marketing/imports?id=" + encodeURIComponent(id), { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || j.error) {
        setErr(j.error || "ลบไม่สำเร็จ");
      } else {
        setRows((rs) => rs.filter((x) => x.id !== id));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">🗂️ ประวัติการนำเข้า</h1>
            <p className="text-sm text-slate-500 mt-1">ไฟล์การตลาดที่เคยนำเข้าระบบ</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/marketing/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
              ← Dashboard
            </Link>
            <Link href="/marketing/import" className="rounded-lg bg-blue-600 text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700">
              ⬆️ อัปไฟล์
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-5xl mx-auto space-y-4">
        {err ? <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{err}</div> : null}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm text-slate-500">ยังไม่เคยนำเข้าไฟล์</p>
            <Link href="/marketing/import" className="inline-flex mt-3 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">
              ⬆️ อัปไฟล์แรก
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">เวลาอัป</th>
                  <th className="text-left px-4 py-2.5 font-medium">ช่องทาง / ร้าน</th>
                  <th className="text-left px-4 py-2.5 font-medium">ช่วงวันที่</th>
                  <th className="text-right px-4 py-2.5 font-medium">แถว</th>
                  <th className="text-left px-4 py-2.5 font-medium">โดย</th>
                  {canDelete ? <th className="px-4 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const c = r.row_counts ?? {};
                  const total = (c.daily ?? 0) + (c.hourly ?? 0) + (c.products ?? 0);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{dt(r.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-slate-700 capitalize">{r.platform}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[180px]" title={r.file_name ?? ""}>
                          {r.shop || "(ไม่ระบุร้าน)"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {r.period_start === r.period_end || !r.period_end
                          ? r.period_start ?? "-"
                          : `${r.period_start} – ${r.period_end}`}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{total.toLocaleString("th-TH")}</td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-[160px]">{r.actor_name ?? "-"}</td>
                      {canDelete ? (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {confirmId === r.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                onClick={() => remove(r.id)}
                                disabled={busyId === r.id}
                                className="rounded-md bg-red-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                              >
                                {busyId === r.id ? "กำลังลบ..." : "ยืนยันลบ"}
                              </button>
                              <button onClick={() => setConfirmId(null)} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">
                                ยกเลิก
                              </button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmId(r.id)} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200">
                              🗑 ลบ
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400">ลบชุดข้อมูลจะลบยอดขายของวันนั้นออกจาก Dashboard ด้วย</p>
      </div>
    </PlaygroundShell>
  );
}
