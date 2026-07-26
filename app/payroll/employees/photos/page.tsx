"use client";

/**
 * Payroll — อัปโหลดรูปพนักงานแบบยกชุด
 *
 * ทำไมมีหน้านี้: การ์ดในผังพนักงานโชว์รูปได้แล้ว แต่ในระบบยังไม่มีรูปสักคน
 * ถ้าให้เข้าไปทีละคนในหน้าประวัติจะช้ามาก — หน้านี้เลยลากรูปเข้าทีเดียวหลายไฟล์
 * แล้ว "จับคู่" กับพนักงาน (ระบบเดาให้จากชื่อไฟล์ เช่น ISG-019.jpg หรือ ปุ๊ก.jpg)
 *
 * อัปโหลดผ่านของกลาง: ImageInput (รายคน) / /api/admin/upload (ยกชุด) → ได้ R2 key
 * บันทึกที่ employees.profile_photo_key ผ่าน PATCH /api/payroll/core/employees/<id>
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";

const ImageInput = dynamic(() => import("@/components/image-input").then((m) => m.ImageInput), { ssr: false });

type Emp = {
  id: string; employee_code: string; full_name: string; nickname: string;
  department_name: string; profile_photo_key: string | null; employment_status: string;
};
type Pending = { file: string; key: string; empId: string; saved: boolean };

const s = (v: unknown) => (v == null ? "" : String(v));
const norm = (v: string) => v.toLowerCase().replace(/[\s_\-.]/g, "");

export default function EmployeePhotosPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch("/api/payroll/core/employees?include_inactive=false").then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      const rows = (j.data ?? []) as Record<string, unknown>[];
      setEmps(rows.map((r) => ({
        id: s(r.id), employee_code: s(r.employee_code), full_name: s(r.full_name),
        nickname: s(r.nickname), department_name: s(r.department_name),
        profile_photo_key: r.profile_photo_key ? s(r.profile_photo_key) : null,
        employment_status: s(r.employment_status),
      })));
    } catch { setErr("โหลดรายชื่อไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const withPhoto = emps.filter((e) => e.profile_photo_key).length;

  /** เดาว่าไฟล์นี้เป็นของใคร — จากรหัสพนักงาน หรือชื่อเล่น/ชื่อจริง ที่อยู่ในชื่อไฟล์ */
  const guessEmployee = useCallback((fileName: string): string => {
    const base = norm(fileName.replace(/\.[^.]+$/, ""));
    if (!base) return "";
    const byCode = emps.find((e) => e.employee_code && base.includes(norm(e.employee_code)));
    if (byCode) return byCode.id;
    const byNick = emps.find((e) => e.nickname && norm(e.nickname).length >= 2 && base.includes(norm(e.nickname)));
    if (byNick) return byNick.id;
    const byName = emps.find((e) => e.full_name && norm(e.full_name).length >= 3 && base.includes(norm(e.full_name)));
    return byName?.id ?? "";
  }, [emps]);

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setErr(null); setUploading(list.length);
    for (const f of list) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("folder", "employees");
        const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
        if (j.error) { setErr(j.error); continue; }
        setPending((p) => [...p, { file: f.name, key: s(j.r2_key), empId: guessEmployee(f.name), saved: false }]);
      } catch { setErr("อัปโหลดบางไฟล์ไม่สำเร็จ"); }
      finally { setUploading((n) => n - 1); }
    }
  };

  const saveOne = async (idx: number) => {
    const p = pending[idx];
    if (!p || !p.empId) return;
    try {
      const j = await apiFetch(`/api/payroll/core/employees/${p.empId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_photo_key: p.key }),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      setPending((cur) => cur.map((x, i) => (i === idx ? { ...x, saved: true } : x)));
      setEmps((cur) => cur.map((e) => (e.id === p.empId ? { ...e, profile_photo_key: p.key } : e)));
    } catch { setErr("บันทึกรูปไม่สำเร็จ"); }
  };

  const saveAll = async () => {
    setSavingAll(true);
    for (let i = 0; i < pending.length; i++) {
      if (!pending[i].saved && pending[i].empId) await saveOne(i);
    }
    setSavingAll(false);
  };

  /** ตั้งรูปให้พนักงานทีละคน (ช่อง ImageInput ในตาราง) */
  const setPhoto = async (empId: string, key: string | null) => {
    try {
      const j = await apiFetch(`/api/payroll/core/employees/${empId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_photo_key: key ?? "" }),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      setEmps((cur) => cur.map((e) => (e.id === empId ? { ...e, profile_photo_key: key } : e)));
    } catch { setErr("บันทึกรูปไม่สำเร็จ"); }
  };

  const shown = useMemo(() => emps.filter((e) => {
    if (onlyMissing && e.profile_photo_key) return false;
    const t = q.trim().toLowerCase();
    return !t || `${e.employee_code} ${e.nickname} ${e.full_name} ${e.department_name}`.toLowerCase().includes(t);
  }), [emps, onlyMissing, q]);

  const readyCount = pending.filter((p) => p.empId && !p.saved).length;

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">📸 อัปโหลดรูปพนักงาน (ยกชุด)</h1>
          <p className="text-sm text-slate-500">
            ลากรูปหลายไฟล์เข้าทีเดียว ระบบจะเดาให้ว่าเป็นของใครจากชื่อไฟล์ (เช่น <code className="bg-slate-100 px-1 rounded">ISG-019.jpg</code> หรือ <code className="bg-slate-100 px-1 rounded">ปุ๊ก.jpg</code>) · มีรูปแล้ว {withPhoto}/{emps.length} คน
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/payroll/board" className="h-9 px-3 inline-flex items-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">🗂️ ผัง</Link>
          <Link href="/payroll/employees" className="h-9 px-3 inline-flex items-center text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">📋 ตาราง</Link>
        </div>
      </div>

      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2.5 text-sm mb-3">{err}</div>}

      {/* โซนลากไฟล์ */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void uploadFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className="rounded-2xl border-2 border-dashed border-slate-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 transition cursor-pointer p-8 text-center"
      >
        <div className="text-3xl mb-1">🖼️</div>
        <div className="text-sm text-slate-600">ลากรูปมาวางที่นี่ หรือ <span className="text-emerald-600 font-medium">คลิกเพื่อเลือกไฟล์</span> (เลือกหลายไฟล์พร้อมกันได้)</div>
        {uploading > 0 && <div className="text-xs text-amber-600 mt-1">กำลังอัปโหลด… เหลือ {uploading} ไฟล์</div>}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* รูปที่อัปแล้ว รอจับคู่ */}
      {pending.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">จับคู่รูปกับพนักงาน ({pending.length} รูป)</h2>
            <div className="flex gap-2">
              <button onClick={() => setPending([])} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ล้างรายการ</button>
              <button onClick={() => void saveAll()} disabled={readyCount === 0 || savingAll}
                className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                {savingAll ? "กำลังบันทึก…" : `💾 บันทึกที่จับคู่แล้ว (${readyCount})`}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pending.map((p, i) => (
              <div key={`${p.key}-${i}`} className={`rounded-xl border p-2 ${p.saved ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r2ImageUrl(p.key, 220) ?? ""} alt={p.file} className="w-full h-28 object-cover rounded-lg bg-slate-100" />
                <div className="text-[11px] text-slate-400 truncate mt-1" title={p.file}>{p.file}</div>
                <select value={p.empId} disabled={p.saved}
                  onChange={(e) => setPending((cur) => cur.map((x, idx) => (idx === i ? { ...x, empId: e.target.value } : x)))}
                  className="w-full h-8 mt-1 px-1 border border-slate-300 rounded-lg text-xs bg-white">
                  <option value="">— เลือกพนักงาน —</option>
                  {emps.map((e) => <option key={e.id} value={e.id}>{e.employee_code} · {e.nickname || e.full_name}</option>)}
                </select>
                <button onClick={() => void saveOne(i)} disabled={!p.empId || p.saved}
                  className="w-full h-7 mt-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
                  {p.saved ? "✅ บันทึกแล้ว" : "บันทึกรูปนี้"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* รายชื่อพนักงาน — ตั้งรูปทีละคนก็ได้ */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold text-slate-800">รายชื่อพนักงาน ({shown.length} คน)</h2>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัส/ชื่อ/แผนก" className="h-9 px-3 border border-slate-300 rounded-lg text-sm w-52" />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              เฉพาะคนที่ยังไม่มีรูป
            </label>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {shown.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-2">
                <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
                  {e.profile_photo_key
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r2ImageUrl(e.profile_photo_key, 88) ?? ""} alt={e.nickname} className="w-full h-full object-cover" />
                    : <span className="text-slate-300 text-lg">👤</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{e.nickname || e.full_name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{e.employee_code}{e.department_name ? ` · ${e.department_name}` : ""}</div>
                </div>
                <div className="w-24 shrink-0">
                  <ImageInput value={e.profile_photo_key} folder="employees" compact onChange={(k) => void setPhoto(e.id, k)} />
                </div>
              </div>
            ))}
            {shown.length === 0 && <div className="col-span-full py-8 text-center text-sm text-slate-400">ไม่มีรายชื่อตามเงื่อนไข</div>}
          </div>
        )}
      </div>
    </div>
  );
}
