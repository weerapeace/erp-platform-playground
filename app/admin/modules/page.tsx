"use client";

/**
 * ตั้งค่าระบบ: โมดูลทั้งหมด — /admin/modules  (ของกลาง)
 *
 * อ่านทุกโมดูลจากทะเบียนกลาง (erp_modules) มาแสดงครบ → กดเข้าหน้าตั้งค่าของแต่ละโมดูล
 * (/admin/module/<key>). โมดูลใหม่ในอนาคตจะโผล่เองอัตโนมัติ ไม่ต้องแก้ code
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

type Module = { key: string; label: string };

export default function AllModulesSettingsPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      setModules(Array.isArray(j.data) ? (j.data as Module[]) : []);
    }).catch(() => setModules([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? modules.filter((m) => m.label.toLowerCase().includes(s) || m.key.toLowerCase().includes(s)) : modules;
    return [...list].sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [modules, q]);

  return (
    <PlaygroundShell>
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-6 py-5">
          <h1 className="text-xl font-bold text-slate-900">⚙ ตั้งค่าระบบ — โมดูลทั้งหมด</h1>
          <p className="text-sm text-slate-500 mt-0.5">เลือกโมดูลเพื่อตั้งค่า Field Registry / Saved Views / Table Layout · ทั้งหมด {modules.length} โมดูล</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาโมดูล…"
            className="mt-3 h-9 w-72 max-w-full px-3 text-sm border border-slate-300 rounded-md" />
        </div>

        <div className="max-w-5xl mx-auto px-6 py-6">
          {loading ? (
            <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-400 py-10 text-center">— ไม่พบโมดูล —</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((m) => (
                <Link key={m.key} href={`/admin/module/${m.key}`}
                  className="group bg-white border border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="text-sm font-medium text-slate-800 group-hover:text-blue-700 truncate">{m.label}</div>
                  <code className="text-[11px] text-slate-400">{m.key}</code>
                  <div className="mt-2 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">เปิดตั้งค่า →</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PlaygroundShell>
  );
}
