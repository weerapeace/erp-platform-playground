"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { Plugin, PluginsResponse } from "@/app/api/admin/plugins/route";

// ---- Category config ----

const CATEGORIES: { v: Plugin["category"]; label: string; color: string }[] = [
  { v: "UI",          label: "UI",          color: "bg-blue-50 text-blue-700 border-blue-200" },
  { v: "Data",        label: "Data",        color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { v: "Workflow",    label: "Workflow",    color: "bg-purple-50 text-purple-700 border-purple-200" },
  { v: "Integration", label: "Integration", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { v: "Admin",       label: "Admin",       color: "bg-slate-100 text-slate-700 border-slate-300" },
];

const CAT_COLOR: Record<string, string> = CATEGORIES.reduce((a, c) => ({ ...a, [c.v]: c.color }), {});

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "เมื่อสักครู่";
  if (diff < 3600)  return `${Math.floor(diff/60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ชม.ที่แล้ว`;
  if (diff < 86400*30) return `${Math.floor(diff/86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day:"numeric", month:"short", year:"numeric" });
}

// ============================================================
// Page
// ============================================================

export default function AdminPluginsPage() {
  const canView = usePermission("plugins.view");
  const canEdit = usePermission("admin.plugins");
  const { user } = useAuth();

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null);

  const [filterCat, setFilterCat]   = useState<Plugin["category"] | "">("");
  const [search,    setSearch]      = useState("");
  const [showOff,   setShowOff]     = useState(true);

  const [detail, setDetail] = useState<Plugin | null>(null);

  // settings editor in drawer
  const [settingsText,   setSettingsText]   = useState("");
  const [settingsErr,    setSettingsErr]    = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/plugins");
      const json: PluginsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setPlugins(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // sync detail when underlying plugin updates
  useEffect(() => {
    if (detail) {
      const fresh = plugins.find(p => p.key === detail.key);
      if (fresh) { setDetail(fresh); setSettingsText(JSON.stringify(fresh.settings, null, 2)); }
    }
  }, [plugins, detail?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plugins.filter(p =>
      (filterCat === "" || p.category === filterCat)
      && (showOff || p.enabled)
      && (!q || p.label.toLowerCase().includes(q) || p.key.includes(q) || (p.description ?? "").toLowerCase().includes(q))
    );
  }, [plugins, filterCat, search, showOff]);

  const grouped = useMemo(() => {
    const g: Record<string, Plugin[]> = {};
    for (const p of filtered) (g[p.category] ??= []).push(p);
    return g;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, { total: number; enabled: number }> = {};
    for (const p of plugins) {
      c[p.category] ??= { total: 0, enabled: 0 };
      c[p.category].total++;
      if (p.enabled) c[p.category].enabled++;
    }
    return c;
  }, [plugins]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const toggleEnabled = async (p: Plugin) => {
    setBusy(p.key);
    try {
      const res = await apiFetch("/api/admin/plugins", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: p.key, enabled: !p.enabled, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(p.enabled ? `ปิด ${p.label}` : `เปิด ${p.label}`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const openDetail = (p: Plugin) => {
    setDetail(p);
    setSettingsText(JSON.stringify(p.settings, null, 2));
    setSettingsErr(null);
  };

  const saveSettings = async () => {
    if (!detail) return;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(settingsText || "{}"); }
    catch (e) { setSettingsErr(`JSON ผิด: ${e instanceof Error ? e.message : "?"}`); return; }
    setSettingsSaving(true); setSettingsErr(null);
    try {
      const res = await apiFetch("/api/admin/plugins", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: detail.key, settings: parsed, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึก settings แล้ว");
      await load();
    } catch (err) { setSettingsErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSettingsSaving(false); }
  };

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-800">Plugin Registry</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Catalog ของของกลางในระบบ — ดูว่าใช้ที่ไหน, เปิด/ปิด, ตั้งค่า
          </p>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={() => setFilterCat("")}
            className={`h-8 px-3 text-xs font-medium rounded-lg border ${
              filterCat === "" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}>
            ทั้งหมด <span className={filterCat === "" ? "opacity-80" : "text-slate-400"}>({plugins.length})</span>
          </button>
          {CATEGORIES.map(c => (
            <button key={c.v} onClick={() => setFilterCat(c.v)}
              className={`h-8 px-3 text-xs font-medium rounded-lg border ${
                filterCat === c.v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}>
              {c.label} <span className={filterCat === c.v ? "opacity-80" : "text-slate-400"}>
                ({counts[c.v]?.enabled ?? 0}/{counts[c.v]?.total ?? 0})
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..."
            className="h-8 px-3 text-sm border border-slate-200 rounded-lg w-56" />
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showOff} onChange={e => setShowOff(e.target.checked)} className="rounded border-slate-300" />
            แสดงที่ปิดอยู่
          </label>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-3 gap-3">{[0,1,2,3,4,5].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="px-4 py-16 bg-white border border-dashed border-slate-300 rounded-xl text-center">
            <div className="text-3xl mb-2 opacity-30">🔌</div>
            <p className="text-sm text-slate-400">ไม่พบ plugin ที่ตรงเงื่อนไข</p>
          </div>
        ) : (
          CATEGORIES.filter(c => grouped[c.v]?.length).map(c => (
            <div key={c.v} className="mb-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${c.color}`}>{c.label}</span>
                <span className="text-xs text-slate-400">— {grouped[c.v].length} plugin</span>
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {grouped[c.v].map(p => (
                  <div key={p.key} onClick={() => openDetail(p)}
                    className={`bg-white border rounded-xl p-3 cursor-pointer hover:border-blue-300 transition-colors ${
                      p.enabled ? "border-slate-200" : "border-slate-200 opacity-60"
                    }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-2xl flex-shrink-0">{p.icon}</div>
                      <button onClick={e => { e.stopPropagation(); if (canEdit) toggleEnabled(p); }}
                        disabled={!canEdit || busy === p.key}
                        title={canEdit ? "เปิด/ปิด plugin" : "ต้องเป็น admin จึงเปิด/ปิดได้"}
                        className={`h-5 w-9 rounded-full relative transition-colors disabled:opacity-50 ${
                          p.enabled ? "bg-emerald-500" : "bg-slate-300"
                        }`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                          p.enabled ? "left-4" : "left-0.5"
                        }`} />
                      </button>
                    </div>
                    <div className="text-sm font-semibold text-slate-800 leading-tight mb-0.5">{p.label}</div>
                    <code className="text-[10px] text-slate-400 font-mono">{p.key}</code>
                    {p.description && (
                      <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{p.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                      <span>v{p.version}</span>
                      <span>·</span>
                      <span>ใช้ใน {p.used_in.length} ที่</span>
                      {p.permission_key && (
                        <>
                          <span>·</span>
                          <code className="bg-slate-100 px-1 rounded text-slate-600">{p.permission_key}</code>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Detail drawer */}
      {detail && (
        <ERPModal open onClose={() => setDetail(null)} size="lg"
          title={`${detail.icon} ${detail.label}`}
          footer={
            <>
              <button onClick={() => setDetail(null)}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">ปิด</button>
              {canEdit && (
                <button onClick={saveSettings} disabled={settingsSaving}
                  className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {settingsSaving ? "..." : "บันทึก settings"}
                </button>
              )}
            </>
          }>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <code className="font-mono bg-slate-100 px-2 py-1 rounded">{detail.key}</code>
              <span className={`px-2 py-1 rounded border ${CAT_COLOR[detail.category]}`}>{detail.category}</span>
              <span className={`px-2 py-1 rounded ${detail.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {detail.enabled ? "🟢 เปิดอยู่" : "⚪ ปิดอยู่"}
              </span>
              <span className="text-slate-400">v{detail.version}</span>
            </div>

            {detail.description && (
              <div className="text-sm text-slate-700">{detail.description}</div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">ใช้ที่ ({detail.used_in.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.used_in.map(u => (
                  <code key={u} className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">{u}</code>
                ))}
                {detail.used_in.length === 0 && <span className="text-xs text-slate-300">—</span>}
              </div>
            </div>

            {detail.permission_key && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Permission ที่เกี่ยวข้อง</p>
                <code className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200">{detail.permission_key}</code>
              </div>
            )}

            {detail.notes && (
              <div className="text-xs text-slate-500 bg-amber-50 border-l-4 border-amber-300 p-2.5 rounded">
                💡 {detail.notes}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Settings (JSON)</p>
              {settingsErr && <div className="px-3 py-2 mb-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {settingsErr}</div>}
              <textarea value={settingsText} onChange={e => setSettingsText(e.target.value)} disabled={!canEdit}
                rows={8} spellCheck={false}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60" />
            </div>

            <div className="text-[10px] text-slate-400">
              อัปเดตล่าสุด: {relTime(detail.updated_at)}
            </div>
          </div>
        </ERPModal>
      )}
    </PlaygroundShell>
  );
}
