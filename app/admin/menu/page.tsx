"use client";

/**
 * จัดการเมนู (Menu Manager) — ของกลาง
 * คุมเมนู sidebar + App Launcher จากที่เดียว: เปิด/ปิด, โชว์ที่ไหน, ผูกสิทธิ์, เรียงลำดับ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { DEFAULT_MENU_ITEMS, type MenuRow, type AppGroup as BaseAppGroup } from "@/components/playground-shell";

// ขยาย AppGroup ด้วยฟิลด์แอปเดี่ยว (PWA) — เก็บใน erp_app_groups (icon_url/theme_color/default_href)
type AppGroup = BaseAppGroup & { icon_url?: string | null; theme_color?: string | null; default_href?: string | null };

export default function MenuManagerPage() {
  const allowed = usePermission("admin.users");
  const { user } = useAuth();
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [apps, setApps] = useState<AppGroup[]>([]);
  const [modules, setModules] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");   // ค้นหาเมนู (ชื่อ/ลิงก์/หมวด)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000); };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [m, a, mod] = await Promise.all([
        apiFetch("/api/menu?all=1").then((r) => r.json()),
        apiFetch("/api/menu/apps").then((r) => r.json()),
        apiFetch("/api/admin/modules").then((r) => r.json()),
      ]);
      if (m.error) throw new Error(m.error);
      setRows(m.data as MenuRow[]);
      setApps(((a.data ?? []) as AppGroup[]));
      setModules(Array.isArray(mod.data) ? (mod.data as { key: string; label: string }[]) : []);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  // เพิ่ม/แก้ App ใหญ่
  const [naApp, setNaApp] = useState({ key: "", label: "", icon: "📦" });
  const [editAppId, setEditAppId] = useState<string | null>(null);   // แอปที่กำลังตั้งค่าไอคอน/สี (PWA)
  const [uploadingApp, setUploadingApp] = useState(false);

  // แก้ฟิลด์ของ App (เช่น icon_url, theme_color) — optimistic + reload
  const patchApp = async (id: string, p: Partial<AppGroup>) => {
    setApps((as) => as.map((a) => a.id === id ? { ...a, ...p } : a));
    const j = await apiFetch("/api/menu/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch: p }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); await load(); }
  };
  // อัปโหลดไอคอนแอป (รูปจริง) → R2 → เก็บ r2_key ใน icon_url
  const uploadAppIcon = async (id: string, file: File) => {
    setUploadingApp(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "app-icons");
      const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error || !j.r2_key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
      await patchApp(id, { icon_url: j.r2_key });
      flash("อัปโหลดไอคอนแล้ว");
    } catch (e) { setErr(String(e)); } finally { setUploadingApp(false); }
  };
  const addApp = async () => {
    if (!naApp.key.trim() || !naApp.label.trim()) { setErr("กรอก key + ชื่อ App"); return; }
    const j = await apiFetch("/api/menu/apps", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { key: naApp.key.trim().toLowerCase(), label: naApp.label.trim(), icon: naApp.icon || "📦", sort_order: (apps.length + 1) * 10, permission_key: null, is_active: true } }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); return; }
    setNaApp({ key: "", label: "", icon: "📦" }); flash("เพิ่ม App แล้ว"); await load();
  };
  const delApp = async (id: string, label: string) => {
    if (!confirm(`ลบโมดูลใหญ่ "${label}"? (เมนูจะไม่ถูกลบ แค่หลุดจาก App นี้)`)) return;
    const j = await apiFetch(`/api/menu/apps?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (j.error) { setErr(j.error); return; }
    await load();
  };
  // toggle เมนู ↔ App
  const toggleItemApp = (it: MenuRow, appKey: string) => {
    const cur = it.app_keys ?? [];
    const next = cur.includes(appKey) ? cur.filter((k) => k !== appKey) : [...cur, appKey];
    setRows((rs) => rs.map((r) => r.id === it.id ? { ...r, app_keys: next } : r));
    void apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, patch: { app_keys: next } }) })
      .then((r) => r.json()).then((j) => { if (j.error) { setErr(j.error); void load(); } });
  };

  const importDefaults = async () => {
    if (!confirm("นำเข้าเมนูเริ่มต้นทั้งหมดเข้าทะเบียน? (ของที่มีอยู่จะไม่ถูกทับ)")) return;
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch("/api/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: DEFAULT_MENU_ITEMS }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      flash(`นำเข้า ${j.inserted ?? 0} เมนู`);
      await load();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  const patch = async (id: string, p: Partial<MenuRow>) => {
    // optimistic
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...p } : r));
    const j = await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch: p }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); await load(); }
  };

  const del = async (id: string, label: string) => {
    if (!confirm(`ลบเมนู "${label}"?`)) return;
    const j = await apiFetch(`/api/menu?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (j.error) { setErr(j.error); return; }
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  // add new
  const [na, setNa] = useState({ section: "", label: "", href: "", icon: "📄" });
  const addItem = async () => {
    if (!na.label.trim() || !na.href.trim()) { setErr("กรอกชื่อ + ลิงก์"); return; }
    setBusy(true); setErr(null);
    try {
      const item: MenuRow = {
        section: na.section.trim() || "อื่น ๆ", section_order: 999, sort_order: 999,
        icon: na.icon || "📄", label: na.label.trim(), href: na.href.trim(),
        show_in_sidebar: true, show_in_launcher: true, permission_key: null, is_active: true,
      };
      const j = await apiFetch("/api/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setNa({ section: "", label: "", href: "", icon: "📄" });
      flash("เพิ่มเมนูแล้ว");
      await load();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  // group by section (กรองด้วยคำค้นก่อน — ชื่อ/ลิงก์/หมวด)
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const visible = s
      ? rows.filter((r) =>
          r.label.toLowerCase().includes(s) ||
          (r.href ?? "").toLowerCase().includes(s) ||
          (r.section ?? "").toLowerCase().includes(s))
      : rows;
    const m = new Map<string, { order: number; items: MenuRow[] }>();
    for (const r of visible) {
      const g = m.get(r.section) ?? { order: r.section_order, items: [] };
      g.items.push(r); m.set(r.section, g);
    }
    return [...m.entries()].sort((a, b) => a[1].order - b[1].order)
      .map(([section, g]) => ({ section, items: g.items.sort((a, b) => a.sort_order - b.sort_order) }));
  }, [rows, q]);
  const matchCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const move = (item: MenuRow, dir: -1 | 1) => {
    const sameSection = rows.filter((r) => r.section === item.section).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameSection.findIndex((r) => r.id === item.id);
    const swap = sameSection[idx + dir];
    if (!swap) return;
    void patch(item.id!, { sort_order: swap.sort_order });
    void patch(swap.id!, { sort_order: item.sort_order });
  };

  const editApp = apps.find((a) => a.id === editAppId) ?? null;
  const editAppMenu = editApp
    ? rows.filter((r) => r.is_active && (r.app_keys ?? []).includes(editApp.key)).sort((a, b) => a.sort_order - b.sort_order)
    : [];

  if (!allowed) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-slate-800">จัดการเมนู</h1>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-emerald-600">✓ {msg}</span>}
            {rows.length === 0 && !loading && (
              <button onClick={importDefaults} disabled={busy} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">⬇ นำเข้าเมนูเริ่มต้น</button>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-4">คุมเมนู Sidebar + App Launcher · โมดูลใหญ่ (tabs บนสุด) · ผูกสิทธิ์ · เรียงลำดับ — อัปเดตให้ทุกคน</p>

        {err && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {err}</div>}

        {/* โมดูลใหญ่ (App) */}
        <div className="mb-5 bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-slate-600 mb-2">โมดูลใหญ่ (App — tabs บนสุด)</div>
          <div className="flex flex-wrap items-center gap-2">
            {apps.map((a) => (
              <span key={a.id} className={`inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-full ${editAppId === a.id ? "bg-blue-50 border-blue-300" : "bg-slate-50 border-slate-200"}`}>
                {a.icon_url
                  ? <img src={`/api/r2-image?key=${encodeURIComponent(a.icon_url)}`} alt="" className="w-4 h-4 rounded object-cover" />
                  : <span>{a.icon}</span>}
                {a.label} <code className="text-[9px] text-slate-400">{a.key}</code>
                <button onClick={() => setEditAppId(editAppId === a.id ? null : a.id!)} title="ตั้งค่าไอคอน/สี (แอปเดี่ยว)" className="text-slate-300 hover:text-blue-600 ml-0.5">✎</button>
                <button onClick={() => delApp(a.id!, a.label)} className="text-slate-300 hover:text-red-500">✕</button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <input value={naApp.icon} onChange={(e) => setNaApp({ ...naApp, icon: e.target.value })} className="w-10 h-7 px-1 text-sm text-center border border-slate-200 rounded" />
              <input value={naApp.key} onChange={(e) => setNaApp({ ...naApp, key: e.target.value })} placeholder="key" className="w-20 h-7 px-2 text-xs font-mono border border-slate-200 rounded" />
              <input value={naApp.label} onChange={(e) => setNaApp({ ...naApp, label: e.target.value })} placeholder="ชื่อ App" className="w-28 h-7 px-2 text-xs border border-slate-200 rounded" />
              <button onClick={addApp} className="h-7 px-2.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700">＋ App</button>
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">ติ๊กชิป App ใต้แต่ละเมนูเพื่อกำหนดว่าเมนูนั้นอยู่ App ใหญ่ไหนบ้าง (อยู่ได้หลาย App) · กด ✎ ที่ชิปเพื่อตั้งไอคอน/สี สำหรับติดตั้งเป็นแอปเดี่ยว</p>

          {/* ตั้งค่าแอปเดี่ยว (PWA): ไอคอนรูปจริง + สีธีม */}
          {editApp && (
            <div className="mt-3 border border-blue-200 bg-blue-50/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-700">📲 ตั้งค่าแอปเดี่ยว: {editApp.icon} {editApp.label} <code className="text-[10px] text-slate-400">/app/{editApp.key}</code></div>
                <button onClick={() => setEditAppId(null)} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {/* ไอคอน */}
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden text-2xl">
                    {editApp.icon_url
                      ? <img src={`/api/r2-image?key=${encodeURIComponent(editApp.icon_url)}`} alt="" className="w-full h-full object-cover" />
                      : <span>{editApp.icon}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={`h-7 px-2.5 leading-7 text-xs font-medium rounded cursor-pointer text-center ${uploadingApp ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                      {uploadingApp ? "กำลังอัป…" : "⬆ อัปโหลดไอคอน"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploadingApp}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAppIcon(editApp.id!, f); e.target.value = ""; }} />
                    </label>
                    {editApp.icon_url && (
                      <button onClick={() => void patchApp(editApp.id!, { icon_url: null })} className="text-[11px] text-rose-500 hover:text-rose-700">ลบรูป (กลับไปใช้ emoji)</button>
                    )}
                  </div>
                </div>
                {/* สีธีม */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">สีแอป</span>
                  <input type="color" value={editApp.theme_color || "#2563eb"} onChange={(e) => void patchApp(editApp.id!, { theme_color: e.target.value })}
                    className="w-9 h-8 p-0 border border-slate-200 rounded cursor-pointer" title="สีหัวแอป + แถบระบบ" />
                  <code className="text-[10px] text-slate-400">{editApp.theme_color || "#2563eb"}</code>
                </div>
                {/* เปิด/ติดตั้ง */}
                <a href={`/app/${editApp.key}`} target="_blank" rel="noopener noreferrer"
                  className="h-8 px-3 leading-8 text-xs font-medium bg-white border border-slate-200 rounded hover:border-blue-300 hover:text-blue-700">
                  เปิดแอปนี้ ↗ (กดปุ่ม “📲 ติดตั้งแอป” ในหน้านั้นเพื่อลงเครื่อง)
                </a>
              </div>

              {/* สิทธิ์เข้าแอป + หน้าเริ่มต้น */}
              <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-blue-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 whitespace-nowrap">🔒 สิทธิ์ที่ต้องมีถึงเข้าแอป</span>
                  <input defaultValue={editApp.permission_key ?? ""} list="perm-list" placeholder="ว่าง = ทุกคนเข้าได้"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (editApp.permission_key ?? null)) void patchApp(editApp.id!, { permission_key: v }); }}
                    className="w-48 h-8 px-2 text-xs border border-slate-200 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 whitespace-nowrap">🏠 หน้าเริ่มต้น</span>
                  <select value={editApp.default_href ?? ""} onChange={(e) => void patchApp(editApp.id!, { default_href: e.target.value || null })}
                    className="w-48 h-8 px-1 text-xs border border-slate-200 rounded bg-white">
                    <option value="">— เมนูแรกของแอป —</option>
                    {editAppMenu.map((m) => <option key={m.id} value={m.href}>{m.icon} {m.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">แนะนำไอคอนสี่เหลี่ยมจัตุรัส ≥ 512×512 px (PNG). ติดตั้งแล้วจะได้ไอคอน/ชื่อนี้บนเครื่อง เปิดมาเห็นแค่เมนูของ {editApp.label} · ตั้ง “สิทธิ์” เพื่อล็อกไม่ให้คนไม่เกี่ยวเข้า (พิมพ์ URL ตรงก็เข้าไม่ได้)</p>
            </div>
          )}
        </div>

        {/* ค้นหาเมนู */}
        {!loading && rows.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาเมนู — ชื่อ / ลิงก์ / หมวด…"
                className="w-full h-9 pl-9 pr-9 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-400" />
              {q && (
                <button onClick={() => setQ("")} title="ล้างคำค้น"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">✕</button>
              )}
            </div>
            {q && <span className="text-xs text-slate-500 whitespace-nowrap">พบ {matchCount} เมนู</span>}
          </div>
        )}

        {loading ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div> : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            ยังไม่มีเมนูในทะเบียน — ตอนนี้ระบบใช้ &quot;เมนูเริ่มต้น&quot; อยู่<br />
            กด <b>นำเข้าเมนูเริ่มต้น</b> เพื่อเริ่มจัดการเอง
          </div>
        ) : (
          <div className="space-y-5">
            {q && groups.length === 0 && (
              <div className="py-10 text-center text-slate-400 text-sm">ไม่พบเมนูที่ตรงกับ “{q}”</div>
            )}
            {groups.map((g) => (
              <div key={g.section} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-sm font-semibold text-slate-700">{g.section}</div>
                <div className="divide-y divide-slate-100">
                  {g.items.map((it, i) => (
                    <div key={it.id} className={`flex items-center gap-2 px-3 py-2 ${it.is_active ? "" : "opacity-50"}`}>
                      <div className="flex flex-col">
                        <button onClick={() => move(it, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs leading-none">▲</button>
                        <button onClick={() => move(it, 1)} disabled={i === g.items.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs leading-none">▼</button>
                      </div>
                      <span className="text-lg w-6 text-center">{it.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 truncate">{it.label}</div>
                        <code className="text-[10px] text-slate-400">{it.href}</code>
                        {apps.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {apps.map((a) => {
                              const on = (it.app_keys ?? []).includes(a.key);
                              return (
                                <button key={a.key} onClick={() => toggleItemApp(it, a.key)} title="อยู่ใน App ใหญ่นี้"
                                  className={`px-1.5 py-0.5 text-[10px] rounded border ${on ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                                  {a.icon} {a.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <label className="flex items-center gap-1 text-xs text-slate-600" title="โชว์ใน Sidebar">
                        <input type="checkbox" checked={it.show_in_sidebar} onChange={(e) => patch(it.id!, { show_in_sidebar: e.target.checked })} /> Sidebar
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-600" title="โชว์ใน App Launcher">
                        <input type="checkbox" checked={it.show_in_launcher} onChange={(e) => patch(it.id!, { show_in_launcher: e.target.checked })} /> Launcher
                      </label>
                      <select value={it.module_key ?? ""} title="ผูกโมดูล (สำหรับหมวด ⚙ ตั้งค่า)"
                        onChange={(e) => { const v = e.target.value || null; setRows((rs) => rs.map((r) => r.id === it.id ? { ...r, module_key: v } : r)); patch(it.id!, { module_key: v }); }}
                        className="w-36 h-8 px-1 text-xs border border-slate-200 rounded bg-white">
                        <option value="">— ไม่ใช่โมดูล —</option>
                        {modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                      <input value={it.permission_key ?? ""} onChange={(e) => setRows((rs) => rs.map((r) => r.id === it.id ? { ...r, permission_key: e.target.value || null } : r))}
                        onBlur={(e) => patch(it.id!, { permission_key: e.target.value.trim() || null })}
                        placeholder="สิทธิ์ (ว่าง=ทุกคน)" list="perm-list"
                        className="w-44 h-8 px-2 text-xs border border-slate-200 rounded" />
                      <label className="flex items-center gap-1 text-xs text-slate-600" title="เปิดใช้งาน">
                        <input type="checkbox" checked={it.is_active} onChange={(e) => patch(it.id!, { is_active: e.target.checked })} /> เปิด
                      </label>
                      <button onClick={() => del(it.id!, it.label)} className="text-slate-300 hover:text-red-500 px-1" title="ลบ">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* เพิ่มเมนูใหม่ */}
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-3 flex flex-wrap items-end gap-2">
              <div><label className="text-[11px] text-slate-500">หมวด</label><input value={na.section} onChange={(e) => setNa({ ...na, section: e.target.value })} placeholder="เช่น Operations" className="block w-40 h-8 px-2 text-sm border border-slate-200 rounded" /></div>
              <div><label className="text-[11px] text-slate-500">ไอคอน</label><input value={na.icon} onChange={(e) => setNa({ ...na, icon: e.target.value })} className="block w-14 h-8 px-2 text-sm text-center border border-slate-200 rounded" /></div>
              <div><label className="text-[11px] text-slate-500">ชื่อเมนู</label><input value={na.label} onChange={(e) => setNa({ ...na, label: e.target.value })} placeholder="ชื่อ" className="block w-40 h-8 px-2 text-sm border border-slate-200 rounded" /></div>
              <div className="flex-1 min-w-[160px]"><label className="text-[11px] text-slate-500">ลิงก์ (href)</label><input value={na.href} onChange={(e) => setNa({ ...na, href: e.target.value })} placeholder="/m/..." className="block w-full h-8 px-2 text-sm font-mono border border-slate-200 rounded" /></div>
              <button onClick={addItem} disabled={busy} className="h-8 px-4 text-sm font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">＋ เพิ่ม</button>
            </div>
          </div>
        )}

        <datalist id="perm-list">
          {["admin.users", "products.view", "products.edit", "purchase_requests.view", "purchase_requests.approve", "sales.view", "inventory.view"].map((p) => <option key={p} value={p} />)}
        </datalist>
        <p className="mt-3 text-[11px] text-slate-400">ผู้แก้: {user?.name ?? "—"} · ผูกสิทธิ์แล้วเมนูจะโชว์เฉพาะคนที่มีสิทธิ์นั้น</p>
      </div>
    </PlaygroundShell>
  );
}
