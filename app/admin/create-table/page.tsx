"use client";

/**
 * C2: สร้างโมดูล/ตารางใหม่จากเว็บ (/admin/create-table)
 * กรอกชื่อ → สร้าง table จริงใน Supabase + ได้หน้าใช้งานทันทีที่ /m/<key>
 */
import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";

export default function CreateTablePage() {
  const canCreate = usePermission("products.create");
  const [label, setLabel] = useState("");
  const [table, setTable] = useState("");
  const [edited, setEdited] = useState(false);
  const [icon, setIcon] = useState("🧩");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // auto-gen table name จาก label
  const onLabel = (v: string) => {
    setLabel(v);
    if (!edited) setTable(v.trim().toLowerCase().replace(/[^a-z0-9\s_]/g, "").replace(/\s+/g, "_").replace(/^[^a-z]+/, ""));
  };

  const submit = async () => {
    setErr(null);
    if (!label.trim() || !table.trim()) { setErr("กรอกชื่อโมดูล + ชื่อ table"); return; }
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(table)) { setErr("ชื่อ table: a-z, 0-9, _ เริ่มด้วยตัวอักษร"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/schema/create-table", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, label: label.trim(), icon }),
      });
      const json = await res.json();
      if (json.error) { setErr(json.error); return; }
      setDone(json.module_key);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  if (!canCreate) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.create" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-lg mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-800">➕ สร้างโมดูลใหม่</h1>
        <p className="text-sm text-slate-500 mt-0.5 mb-6">สร้าง table จริงใน Supabase + ได้หน้าจัดการทันที (เพิ่ม field/layout ต่อได้)</p>

        {done ? (
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-emerald-800 font-medium">สร้างโมดูล &quot;{label}&quot; แล้ว!</p>
            <a href={`/m/${done}`} className="inline-block mt-3 h-9 px-4 leading-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              เปิดหน้าโมดูล →
            </a>
            <button onClick={() => { setDone(null); setLabel(""); setTable(""); setEdited(false); }}
              className="block mx-auto mt-3 text-xs text-slate-500 hover:text-slate-700">+ สร้างอีกอัน</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600">ชื่อโมดูล (ภาษาคน) *</label>
              <input value={label} onChange={(e) => onLabel(e.target.value)} placeholder="เช่น โปรโมชั่น"
                className="mt-1 w-full h-10 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">ชื่อ table (อังกฤษ) *</label>
              <input value={table} onChange={(e) => { setEdited(true); setTable(e.target.value); }} placeholder="เช่น promotions"
                className="mt-1 w-full h-10 px-3 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <p className="text-[11px] text-slate-400 mt-0.5">a-z, 0-9, _ — จะเป็นชื่อ table จริงใน database</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">ไอคอน</label>
              <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4}
                className="mt-1 w-20 h-10 px-3 text-lg text-center border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
              💡 จะได้ table ที่มี field เริ่มต้น: <code>ชื่อ (name)</code> + สถานะ — แล้วเพิ่ม field อื่นเองได้ที่ปุ่ม &quot;+ เพิ่ม Field&quot; ในหน้าโมดูล
            </div>
            {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
            <button onClick={submit} disabled={saving}
              className="w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังสร้าง..." : "สร้างโมดูล"}
            </button>
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}
