"use client";

/**
 * จัดการเมนู (Menu Manager) — ของกลาง
 * คุมเมนู sidebar + App Launcher จากที่เดียว: เปิด/ปิด, โชว์ที่ไหน, ผูกสิทธิ์, เรียงลำดับ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { DEFAULT_MENU_ITEMS, type MenuRow, type AppGroup } from "@/components/playground-shell";

export default function MenuManagerPage() {
  const allowed = usePermission("admin.users");
  const { user } = useAuth();
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [apps, setApps] = useState<AppGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000); };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [m, a] = await Promise.all([
        apiFetch("/api/menu?all=1").then((r) => r.json()),
        apiFetch("/api/menu/apps").then((r) => r.json()),
      ]);
      if (m.error) throw new Error(m.error);
      setRows(m.data as MenuRow[]);
      setApps(((a.data ?? []) as AppGroup[]));
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  // เพิ่ม/แก้ App ใหญ่
  const [naApp, setNaApp] = useState({ key: "", label: "", icon: "📦" });
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

  // group by section
  const groups = useMemo(() => {
    const m = new Map<string, { order: number; items: MenuRow[] }>();
    for (const r of rows) {
      const g = m.get(r.section) ?? { order: r.section_order, items: [] };
      g.items.push(r); m.set(r.section, g);
    }
    return [...m.entries()].sort((a, b) => a[1].order - b[1].order)
      .map(([section, g]) => ({ section, items: g.items.sort((a, b) => a.sort_order - b.sort_order) }));
  }, [rows]);

  const move = (item: MenuRow, dir: -1 | 1) => {
    const sameSection = rows.filter((r) => r.section === item.section).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameSection.findIndex((r) => r.id === item.id);
    const swap = sameSection[idx + dir];
    if (!swap) return;
    void patch(item.id!, { sort_order: swap.sort_order });
    void patch(swap.id!, { sort_order: item.sort_order });
  };

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
              <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-full">
                {a.icon} {a.label} <code className="text-[9px] text-slate-400">{a.key}</code>
                <button onClick={() => delApp(a.id!, a.label)} className="text-slate-300 hover:text-red-500 ml-0.5">✕</button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <input value={naApp.icon} onChange={(e) => setNaApp({ ...naApp, icon: e.target.value })} className="w-10 h-7 px-1 text-sm text-center border border-slate-200 rounded" />
              <input value={naApp.key} onChange={(e) => setNaApp({ ...naApp, key: e.target.value })} placeholder="key" className="w-20 h-7 px-2 text-xs font-mono border border-slate-200 rounded" />
              <input value={naApp.label} onChange={(e) => setNaApp({ ...naApp, label: e.target.value })} placeholder="ชื่อ App" className="w-28 h-7 px-2 text-xs border border-slate-200 rounded" />
              <button onClick={addApp} className="h-7 px-2.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700">＋ App</button>
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">ติ๊กชิป App ใต้แต่ละเมนูเพื่อกำหนดว่าเมนูนั้นอยู่ App ใหญ่ไหนบ้าง (อยู่ได้หลาย App)</p>
        </div>

        {loading ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div> : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            ยังไม่มีเมนูในทะเบียน — ตอนนี้ระบบใช้ &quot;เมนูเริ่มต้น&quot; อยู่<br />
            กด <b>นำเข้าเมนูเริ่มต้น</b> เพื่อเริ่มจัดการเอง
          </div>
        ) : (
          <div className="space-y-5">
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
