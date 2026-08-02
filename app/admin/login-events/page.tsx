"use client";

/**
 * Admin — "ใครเข้าแอปไหน" (ประวัติการเข้าใช้ระบบของทุกคน)
 *
 * ต่างจาก /account/security ที่เห็นเฉพาะของตัวเอง — หน้านี้แอดมินเห็นทุกคน
 * ข้อมูลจาก /api/admin/login-events (สิทธิ์ admin.users)
 *
 * ระบบเตือนอัตโนมัติ (แจ้งเตือนในแอป + LINE) จะยิงเมื่อมีคนเข้าจาก "เครื่องใหม่"
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";

type Ev = {
  id: string; user_id: string; created_at: string;
  app_key: string | null; path: string | null;
  browser: string | null; os: string | null; device_type: string | null;
  ip: string | null; city: string | null; region: string | null; country: string | null;
  is_new_device: boolean; user_name: string; user_email: string;
};

const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
};
const place = (e: Ev) => [e.city, e.region, e.country].filter(Boolean).join(", ") || "ไม่ทราบตำแหน่ง";
const device = (e: Ev) => [e.browser, e.os].filter(Boolean).join(" · ") || e.device_type || "ไม่ทราบอุปกรณ์";

export default function LoginEventsPage() {
  const canView = usePermission("admin.users");
  const [rows, setRows] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [appFilter, setAppFilter] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const p = new URLSearchParams({ limit: "300" });
      if (appFilter) p.set("app_key", appFilter);
      if (onlyNew) p.set("new_device", "1");
      const j = await apiFetch(`/api/admin/login-events?${p}`).then((r) => r.json());
      if (j.error) { setErr(j.error); setRows([]); }
      else setRows((j.data ?? []) as Ev[]);
    } catch { setErr("โหลดข้อมูลไม่ได้"); }
    finally { setLoading(false); }
  }, [appFilter, onlyNew]);
  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const apps = useMemo(
    () => [...new Set(rows.map((r) => r.app_key).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.user_name} ${r.user_email} ${r.app_key ?? ""} ${place(r)}`.toLowerCase().includes(s));
  }, [rows, q]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">🔐 ใครเข้าแอปไหน</h1>
        <p className="text-sm text-slate-500 mb-4">
          ประวัติการเข้าใช้ระบบของทุกคน — ผู้ใช้ · แอปที่เข้า · อุปกรณ์ · ตำแหน่ง ·
          แถวที่ขึ้นป้าย <b>เครื่องใหม่</b> ระบบจะส่งแจ้งเตือนให้เจ้าของบัญชีและเข้า LINE อัตโนมัติ
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ / อีเมล / แอป / เมือง"
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
          <select value={appFilter} onChange={(e) => setAppFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="">ทุกแอป</option>
            {apps.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
            เฉพาะเครื่องใหม่
          </label>
          <button onClick={() => void load()} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
            รีเฟรช
          </button>
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {loading && <div className="py-10 text-center text-slate-400">กำลังโหลด…</div>}

        {!loading && !err && shown.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
            ยังไม่มีประวัติการเข้าใช้ — ข้อมูลจะเริ่มบันทึกเมื่อมีคนล็อกอินครั้งถัดไป
          </div>
        )}

        {!loading && shown.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">เมื่อไหร่</th>
                  <th className="px-3 py-2 text-left">ใคร</th>
                  <th className="px-3 py-2 text-left">แอปที่เข้า</th>
                  <th className="px-3 py-2 text-left">อุปกรณ์</th>
                  <th className="px-3 py-2 text-left">ที่ไหน</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className={`border-t border-slate-100 ${e.is_new_device ? "bg-amber-50" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{when(e.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{e.user_name || "-"}</div>
                      <div className="text-xs text-slate-400">{e.user_email}</div>
                    </td>
                    <td className="px-3 py-2">
                      {e.app_key
                        ? <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{e.app_key}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                      {e.path && <div className="mt-0.5 font-mono text-[11px] text-slate-400">{e.path}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {device(e)}
                      {e.is_new_device && <span className="ml-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-700">เครื่องใหม่</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {place(e)}
                      {e.ip && <div className="font-mono text-[11px] text-slate-400">{e.ip}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-400">
          หมายเหตุ: บันทึก 1 ครั้งต่อเครื่องต่อ 30 นาที (กันซ้ำตอนเปิดหลายแท็บ) · ตำแหน่งเป็นระดับเมืองจาก IP ไม่ใช่พิกัดจริง
        </p>
      </div>
    </PlaygroundShell>
  );
}
