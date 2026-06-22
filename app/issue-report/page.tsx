"use client";

/**
 * /issue-report — แจ้งปัญหาการใช้งานแอป 🛟 (App "งานอื่นๆ")
 *
 * - User (report.create): ฟอร์มแจ้งปัญหา (เลือกแอป + priority + รูป + รายละเอียด) + ประวัติของฉัน
 * - Admin (report.manage): ตารางปัญหา + กรองสถานะ + เปลี่ยนสถานะ/priority/โน้ต + จัดการรายการแอป
 * ทุกอย่างผ่าน API กลาง /api/issue-reports
 */

import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";

type ReportApp = { id: string; name: string; sort_order: number; is_active: boolean };
type Report = {
  id: string; app_id: string | null; app_name: string | null; description: string;
  images: string[]; status: string; priority: string;
  reporter_id: string | null; reporter_name: string | null; admin_note: string | null;
  created_at: string; updated_at: string; resolved_at: string | null;
};

const imgUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  open:        { label: "รอแก้",   cls: "bg-amber-100 text-amber-600" },
  in_progress: { label: "กำลังแก้", cls: "bg-blue-100 text-blue-600" },
  resolved:    { label: "แก้แล้ว",  cls: "bg-emerald-100 text-emerald-600" },
  closed:      { label: "ปิด",      cls: "bg-slate-200 text-slate-500" },
};
const PRIORITY: Record<string, { label: string; cls: string }> = {
  low:    { label: "ต่ำ",   cls: "bg-slate-100 text-slate-500" },
  medium: { label: "กลาง",  cls: "bg-sky-100 text-sky-600" },
  high:   { label: "สูง",   cls: "bg-orange-100 text-orange-600" },
  urgent: { label: "ด่วน",  cls: "bg-red-100 text-red-600" },
};
const STATUS_FLOW = ["open", "in_progress", "resolved", "closed"];

function Badge({ map, k }: { map: typeof STATUS; k: string }) {
  const m = map[k] ?? { label: k, cls: "bg-slate-100 text-slate-500" };
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

export default function IssueReportPage() {
  const { can } = useAuth();
  const canView = can("report.create");
  const canManage = can("report.manage");

  if (!canView) {
    return <PlaygroundShell><div className="p-10 text-center text-slate-500"><div className="text-4xl mb-2">🔒</div>คุณไม่มีสิทธิ์ใช้งานหน้านี้</div></PlaygroundShell>;
  }

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-pink-50 to-rose-50/40">
        {canManage ? <ManageView /> : <ReportForm />}
      </div>
    </PlaygroundShell>
  );
}

// ============================================================
// User: ฟอร์มแจ้งปัญหา + ประวัติของฉัน
// ============================================================

function ReportForm() {
  const { user } = useAuth();
  const [apps, setApps] = useState<ReportApp[]>([]);
  const [appId, setAppId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<Report[]>([]);

  const loadMine = useCallback(async () => {
    const j = await apiFetch("/api/issue-reports").then((r) => r.json());
    setMine(j.data ?? []);
  }, []);
  useEffect(() => {
    apiFetch("/api/issue-reports/apps").then((r) => r.json()).then((j) => setApps(j.data ?? []));
    loadMine();
  }, [loadMine]);

  const upload = async (files: FileList) => {
    setUploading(true);
    for (const f of Array.from(files)) {
      const fd = new FormData(); fd.append("file", f);
      const j = await apiFetch("/api/issue-reports/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (j.r2_key) setImages((prev) => [...prev, j.r2_key]);
      else alert("อัปโหลดรูปไม่สำเร็จ: " + (j.error ?? ""));
    }
    setUploading(false);
  };

  const submit = async () => {
    if (!description.trim()) { alert("กรุณาอธิบายปัญหา"); return; }
    setSaving(true);
    const app = apps.find((a) => a.id === appId);
    const j = await apiFetch("/api/issue-reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId || null, app_name: app?.name ?? null, description, images, priority, reporterName: user?.name ?? null }),
    }).then((r) => r.json());
    setSaving(false);
    if (j.error) { alert("ส่งไม่สำเร็จ: " + j.error); return; }
    setDescription(""); setImages([]); setAppId(""); setPriority("medium");
    loadMine();
    alert("ส่งใบแจ้งปัญหาแล้ว ขอบคุณครับ 🌸");
  };

  return (
    <div className="max-w-2xl mx-auto p-5 sm:p-8">
      <h1 className="text-2xl font-bold text-rose-600 flex items-center gap-2 mb-1">🛟 แจ้งปัญหาการใช้งาน</h1>
      <p className="text-sm text-rose-400 mb-6">เจอปัญหาตรงไหน บอกเราได้เลย ทีมงานจะรีบดูให้ครับ</p>

      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-medium text-rose-400 mb-1">แอปที่มีปัญหา</span>
            <select value={appId} onChange={(e) => setAppId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-pink-200 bg-white outline-none focus:border-pink-400 text-sm">
              <option value="">— เลือกแอป —</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-rose-400 mb-1">ความด่วน</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-pink-200 bg-white outline-none focus:border-pink-400 text-sm">
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-rose-400 mb-1">ปัญหาที่เจอ</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="เล่าให้ฟังว่าเจออะไร ทำขั้นตอนไหนแล้วเกิดปัญหา"
            className="w-full px-3 py-2 rounded-lg border border-pink-200 outline-none focus:border-pink-400 text-sm" />
        </label>

        <div>
          <span className="block text-xs font-medium text-rose-400 mb-1">แนบรูป (ถ้ามี)</span>
          <div className="flex flex-wrap gap-2 items-center">
            {images.map((k, i) => (
              <div key={i} className="relative">
                <img src={imgUrl(k)} alt="" className="w-16 h-16 rounded-lg object-cover border border-pink-100" />
                <button onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-pink-200 text-xs text-slate-400 hover:text-red-500">✕</button>
              </div>
            ))}
            <label className="w-16 h-16 rounded-lg border-2 border-dashed border-pink-200 flex items-center justify-center text-pink-300 text-2xl cursor-pointer hover:bg-pink-50">
              {uploading ? "…" : "＋"}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        <div className="text-right">
          <button onClick={submit} disabled={saving || uploading}
            className="h-11 px-6 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-lg shadow-pink-200 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50">
            {saving ? "กำลังส่ง…" : "📨 ส่งแจ้งปัญหา"}
          </button>
        </div>
      </div>

      {/* ประวัติของฉัน */}
      <h2 className="text-lg font-bold text-rose-600 mt-8 mb-3">📋 ประวัติที่ฉันแจ้ง</h2>
      {mine.length === 0 ? (
        <div className="text-sm text-pink-300 py-6 text-center">ยังไม่มีรายการ</div>
      ) : (
        <div className="space-y-2">
          {mine.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-pink-100 p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge map={STATUS} k={r.status} />
                  <Badge map={PRIORITY} k={r.priority} />
                  {r.app_name && <span className="text-xs text-slate-400">{r.app_name}</span>}
                </div>
                <div className="text-sm text-slate-700 line-clamp-2">{r.description}</div>
                {r.admin_note && <div className="text-xs text-emerald-600 mt-1">ทีมงาน: {r.admin_note}</div>}
                <div className="text-[11px] text-slate-400 mt-1">{new Date(r.created_at).toLocaleString("th-TH")}</div>
              </div>
              {r.images?.[0] && <img src={imgUrl(r.images[0])} alt="" className="w-12 h-12 rounded-lg object-cover border border-pink-100 flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Admin: ตารางจัดการ
// ============================================================

function ManageView() {
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState<Report | null>(null);
  const [appsOpen, setAppsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter ? `/api/issue-reports?status=${filter}` : "/api/issue-reports";
    const j = await apiFetch(url).then((r) => r.json());
    setRows(j.data ?? []);
    setLoading(false);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    await apiFetch(`/api/issue-reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
    setDetail((d) => (d && d.id === id ? { ...d, ...body } as Report : d));
  };

  return (
    <div className="max-w-6xl mx-auto p-5 sm:p-8">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-rose-600 flex items-center gap-2">🛟 ปัญหาการใช้งาน</h1>
          <p className="text-sm text-rose-400 mt-0.5">รายการที่ผู้ใช้แจ้งเข้ามา</p>
        </div>
        <button onClick={() => setAppsOpen(true)} className="h-10 px-4 rounded-full border border-pink-200 bg-white text-rose-500 text-sm font-medium hover:bg-pink-50">⚙ จัดการรายการแอป</button>
      </div>

      {/* กรองสถานะ */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[["", "ทั้งหมด"], ...STATUS_FLOW.map((s) => [s, STATUS[s].label])].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`h-8 px-3 rounded-full text-xs font-medium border ${filter === k ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-500 border-pink-200 hover:bg-pink-50"}`}>{label}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm overflow-hidden">
        {loading ? <div className="p-10 text-center text-pink-300 text-sm">กำลังโหลด…</div>
          : rows.length === 0 ? <div className="p-12 text-center text-pink-300 text-sm">🎉 ไม่มีรายการ</div>
          : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-pink-50 text-rose-500 text-left">
                <th className="px-4 py-3 font-semibold">แอป</th>
                <th className="px-4 py-3 font-semibold">ปัญหา</th>
                <th className="px-4 py-3 font-semibold">ผู้แจ้ง</th>
                <th className="px-4 py-3 font-semibold text-center">ด่วน</th>
                <th className="px-4 py-3 font-semibold text-center">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-center">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-pink-50 hover:bg-pink-50/40 cursor-pointer" onClick={() => setDetail(r)}>
                  <td className="px-4 py-3 text-slate-600">{r.app_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs"><div className="line-clamp-1 flex items-center gap-1">{r.images?.length ? "📎 " : ""}{r.description}</div></td>
                  <td className="px-4 py-3 text-slate-500">{r.reporter_name ?? "—"}</td>
                  <td className="px-4 py-3 text-center"><Badge map={PRIORITY} k={r.priority} /></td>
                  <td className="px-4 py-3 text-center"><Badge map={STATUS} k={r.status} /></td>
                  <td className="px-4 py-3 text-center text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && <DetailModal report={detail} onClose={() => setDetail(null)} onPatch={patch} />}
      {appsOpen && <AppsModal onClose={() => setAppsOpen(false)} />}
    </div>
  );
}

function DetailModal({ report, onClose, onPatch }: { report: Report; onClose: () => void; onPatch: (id: string, body: Record<string, unknown>) => void }) {
  const [note, setNote] = useState(report.admin_note ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Badge map={STATUS} k={report.status} /><Badge map={PRIORITY} k={report.priority} />
          {report.app_name && <span className="text-sm text-slate-500">{report.app_name}</span>}
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{report.description}</p>
        <div className="text-xs text-slate-400 mb-3">แจ้งโดย {report.reporter_name ?? "—"} · {new Date(report.created_at).toLocaleString("th-TH")}</div>

        {report.images?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {report.images.map((k, i) => (
              <a key={i} href={imgUrl(k)} target="_blank" rel="noreferrer">
                <img src={imgUrl(k)} alt="" className="w-24 h-24 rounded-lg object-cover border border-pink-100" />
              </a>
            ))}
          </div>
        )}

        <div className="border-t border-pink-50 pt-4 space-y-3">
          <div>
            <span className="block text-xs font-medium text-rose-400 mb-1">เปลี่ยนสถานะ</span>
            <div className="flex gap-2 flex-wrap">
              {STATUS_FLOW.map((s) => (
                <button key={s} onClick={() => onPatch(report.id, { status: s })}
                  className={`h-8 px-3 rounded-full text-xs font-medium border ${report.status === s ? "bg-rose-500 text-white border-rose-500" : "bg-white text-slate-500 border-pink-200 hover:bg-pink-50"}`}>{STATUS[s].label}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs font-medium text-rose-400 mb-1">ความด่วน</span>
            <select value={report.priority} onChange={(e) => onPatch(report.id, { priority: e.target.value })}
              className="h-9 px-3 rounded-lg border border-pink-200 bg-white text-sm outline-none">
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-xs font-medium text-rose-400 mb-1">โน้ตถึงผู้แจ้ง</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-pink-200 text-sm outline-none focus:border-pink-400" />
            <div className="text-right mt-2">
              <button onClick={() => { onPatch(report.id, { admin_note: note }); }} className="h-9 px-4 rounded-lg bg-pink-500 text-white text-sm font-medium hover:bg-pink-600">บันทึกโน้ต</button>
            </div>
          </div>
        </div>

        <div className="text-right mt-4"><button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">ปิด</button></div>
      </div>
    </div>
  );
}

function AppsModal({ onClose }: { onClose: () => void }) {
  const [apps, setApps] = useState<ReportApp[]>([]);
  const [name, setName] = useState("");
  const load = useCallback(async () => {
    const j = await apiFetch("/api/issue-reports/apps?all=1").then((r) => r.json());
    setApps(j.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    await apiFetch("/api/issue-reports/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), sort_order: apps.length }) });
    setName(""); load();
  };
  const rename = async (a: ReportApp) => {
    const v = prompt("ชื่อแอป", a.name); if (v == null || !v.trim()) return;
    await apiFetch("/api/issue-reports/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, patch: { name: v.trim() } }) });
    load();
  };
  const toggle = async (a: ReportApp) => {
    await apiFetch("/api/issue-reports/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, patch: { is_active: !a.is_active } }) });
    load();
  };
  const del = async (a: ReportApp) => {
    if (!confirm(`ลบ "${a.name}"?`)) return;
    await apiFetch(`/api/issue-reports/apps?id=${a.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-rose-600 mb-4">⚙ จัดการรายการแอป</h3>
        <div className="flex gap-2 mb-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เพิ่มชื่อแอปใหม่"
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="flex-1 h-10 px-3 rounded-lg border border-pink-200 text-sm outline-none focus:border-pink-400" />
          <button onClick={add} className="h-10 px-4 rounded-lg bg-pink-500 text-white text-sm font-medium hover:bg-pink-600">เพิ่ม</button>
        </div>
        <ul className="space-y-1">
          {apps.map((a) => (
            <li key={a.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-pink-50 ${!a.is_active ? "opacity-50" : ""}`}>
              <span className="flex-1 text-sm text-slate-700">{a.name}{!a.is_active && " (ซ่อน)"}</span>
              <button onClick={() => rename(a)} className="text-xs text-slate-400 hover:text-rose-500">แก้</button>
              <button onClick={() => toggle(a)} className="text-xs text-slate-400 hover:text-amber-500">{a.is_active ? "ซ่อน" : "แสดง"}</button>
              <button onClick={() => del(a)} className="text-xs text-slate-400 hover:text-red-500">ลบ</button>
            </li>
          ))}
        </ul>
        <div className="text-right mt-4"><button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">ปิด</button></div>
      </div>
    </div>
  );
}
