"use client";

/**
 * จัดการเมนู (Menu Manager) — ของกลาง · ออกแบบใหม่แบบ "รายแอป"
 * แนวคิด: เลือกแอปก่อน → จัดเมนูของแอปนั้น (ลากเรียง + กางตั้งค่าเพิ่ม + ตัวอย่างสด)
 * โหมด "ทุกเมนู" = จัดการรวม (ผูกเมนูเข้าแอป/ลบ/แก้ข้ามแอป)
 * เก็บความสามารถเดิมครบ: app+PWA, sidebar/launcher, โมดูล, สิทธิ์, เปิด/ปิด, ค้นหา, นำเข้าเริ่มต้น
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { DEFAULT_MENU_ITEMS, type MenuRow, type AppGroup as BaseAppGroup } from "@/components/playground-shell";

type AppGroup = BaseAppGroup & { icon_url?: string | null; theme_color?: string | null; default_href?: string | null };
const ALL = "__all__";

// ไอคอน (รูปอัปโหลด icon_url > emoji)
function Ico({ icon, iconUrl, size = 18 }: { icon?: string | null; iconUrl?: string | null; size?: number }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(iconUrl)}`} alt="" className="rounded object-contain shrink-0" style={{ width: size, height: size }} />;
  }
  return <span className="shrink-0 leading-none" style={{ fontSize: size }}>{icon || "📄"}</span>;
}

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
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>(ALL);          // app key ที่เลือก หรือ "__all__"
  const [showAppCfg, setShowAppCfg] = useState(false);  // กางตั้งค่าแอป (PWA)
  const [expanded, setExpanded] = useState<string | null>(null);  // เมนูที่กางตั้งค่าเพิ่ม
  const [addOpen, setAddOpen] = useState(false);        // เปิดตัวเพิ่มเมนูเข้าแอป
  const [addNew, setAddNew] = useState(false);          // สลับโหมดสร้างเมนูใหม่ในป๊อปอัป
  const [showAddApp, setShowAddApp] = useState(false);
  const [uploadingApp, setUploadingApp] = useState(false);
  const [origin, setOrigin] = useState("");
  const dragId = useRef<string | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000); };
  useEffect(() => { setOrigin(window.location.origin); }, []);

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
      setApps((a.data ?? []) as AppGroup[]);
      setModules(Array.isArray(mod.data) ? (mod.data as { key: string; label: string }[]) : []);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  // ---------- App (โมดูลใหญ่ / PWA) ----------
  const [naApp, setNaApp] = useState({ key: "", label: "", icon: "📦" });
  const patchApp = async (id: string, p: Partial<AppGroup>) => {
    setApps((as) => as.map((a) => (a.id === id ? { ...a, ...p } : a)));
    const j = await apiFetch("/api/menu/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch: p }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); await load(); }
  };
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
    if (!naApp.key.trim() || !naApp.label.trim()) { setErr("กรอกรหัส (key) + ชื่อแอป"); return; }
    const j = await apiFetch("/api/menu/apps", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { key: naApp.key.trim().toLowerCase(), label: naApp.label.trim(), icon: naApp.icon || "📦", sort_order: (apps.length + 1) * 10, permission_key: null, is_active: true } }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); return; }
    setNaApp({ key: "", label: "", icon: "📦" }); setShowAddApp(false); flash("เพิ่มแอปแล้ว"); await load();
  };
  const delApp = async (id: string, label: string) => {
    if (!confirm(`ลบแอป "${label}"?\n(เมนูจะไม่ถูกลบ แค่หลุดจากแอปนี้)`)) return;
    const j = await apiFetch(`/api/menu/apps?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (j.error) { setErr(j.error); return; }
    setSel(ALL); await load();
  };
  const copyShareLink = async (key: string) => {
    try { await navigator.clipboard.writeText(`${origin}/app/${key}`); flash("คัดลอกลิงก์แล้ว"); }
    catch { setErr("คัดลอกไม่สำเร็จ — ก๊อปลิงก์เองจากช่อง"); }
  };

  // ---------- Menu items ----------
  const patch = async (id: string, p: Partial<MenuRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
    const j = await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch: p }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); await load(); }
  };
  const del = async (id: string, label: string) => {
    if (!confirm(`ลบเมนู "${label}" ออกจากทุกแอป?`)) return;
    const j = await apiFetch(`/api/menu?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (j.error) { setErr(j.error); return; }
    setRows((rs) => rs.filter((r) => r.id !== id));
  };
  const toggleItemApp = (it: MenuRow, appKey: string) => {
    const cur = it.app_keys ?? [];
    const next = cur.includes(appKey) ? cur.filter((k) => k !== appKey) : [...cur, appKey];
    setRows((rs) => rs.map((r) => (r.id === it.id ? { ...r, app_keys: next } : r)));
    void apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, patch: { app_keys: next } }) })
      .then((r) => r.json()).then((j) => { if (j.error) { setErr(j.error); void load(); } });
  };
  const importDefaults = async () => {
    if (!confirm("นำเข้าเมนูเริ่มต้นทั้งหมด? (ของที่มีอยู่จะไม่ถูกทับ)")) return;
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch("/api/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: DEFAULT_MENU_ITEMS }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      flash(`นำเข้า ${j.inserted ?? 0} เมนู`); await load();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  // สร้างเมนูใหม่ (ในป๊อปอัป) → เพิ่มเข้าแอปที่เลือกให้เลย
  const [na, setNa] = useState({ section: "", label: "", href: "", icon: "📄" });
  const addItem = async () => {
    if (!na.label.trim() || !na.href.trim()) { setErr("กรอกชื่อ + ลิงก์"); return; }
    setBusy(true); setErr(null);
    try {
      const item: MenuRow = {
        section: na.section.trim() || "อื่น ๆ", section_order: 999, sort_order: 999,
        icon: na.icon || "📄", label: na.label.trim(), href: na.href.trim(),
        show_in_sidebar: true, show_in_launcher: true, permission_key: null, is_active: true,
        app_keys: sel === ALL ? [] : [sel],
      };
      const j = await apiFetch("/api/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setNa({ section: "", label: "", href: "", icon: "📄" }); setAddNew(false); setAddOpen(false);
      flash("เพิ่มเมนูแล้ว"); await load();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  // ---------- มุมมอง ----------
  const selectedApp = apps.find((a) => a.key === sel) ?? null;
  const sections = useMemo(() => [...new Set(rows.map((r) => r.section))], [rows]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    let visible = rows;
    if (sel !== ALL) visible = visible.filter((r) => (r.app_keys ?? []).includes(sel));
    if (s) visible = visible.filter((r) =>
      r.label.toLowerCase().includes(s) || (r.href ?? "").toLowerCase().includes(s) || (r.section ?? "").toLowerCase().includes(s));
    const m = new Map<string, { order: number; items: MenuRow[] }>();
    for (const r of visible) { const g = m.get(r.section) ?? { order: r.section_order, items: [] }; g.items.push(r); m.set(r.section, g); }
    return [...m.entries()].sort((a, b) => a[1].order - b[1].order)
      .map(([section, g]) => ({ section, items: g.items.sort((a, b) => a.sort_order - b.sort_order) }));
  }, [rows, q, sel]);
  const matchCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const notInApp = useMemo(() => {
    if (sel === ALL) return [];
    const s = q.trim().toLowerCase();
    return rows.filter((r) => !(r.app_keys ?? []).includes(sel))
      .filter((r) => !s || r.label.toLowerCase().includes(s) || (r.href ?? "").toLowerCase().includes(s));
  }, [rows, sel, q]);

  // ลากเรียงในหมวด (อัปเดต sort_order ของรายการที่แสดงอยู่)
  const reorder = (targetId: string, section: string) => {
    const dId = dragId.current; dragId.current = null;
    if (!dId || dId === targetId) return;
    const list = groups.find((g) => g.section === section)?.items ?? [];
    const from = list.findIndex((r) => r.id === dId);
    const to = list.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) return;
    const re = [...list]; const [mv] = re.splice(from, 1); re.splice(to, 0, mv);
    const updates = re.map((r, i) => ({ id: r.id!, sort_order: (i + 1) * 10 })).filter((u, i) => re[i].sort_order !== u.sort_order);
    setRows((rs) => rs.map((r) => { const u = updates.find((x) => x.id === r.id); return u ? { ...r, sort_order: u.sort_order } : r; }));
    updates.forEach((u) => void apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, patch: { sort_order: u.sort_order } }) }).then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); }));
  };

  // ตัวอย่างเมนูที่ผู้ใช้เห็น (sidebar ของแอปที่เลือก)
  const previewItems = sel === ALL ? [] : rows.filter((r) => r.is_active && r.show_in_sidebar && (r.app_keys ?? []).includes(sel))
    .sort((a, b) => (a.section_order - b.section_order) || (a.sort_order - b.sort_order));

  const appMenuForDefault = selectedApp
    ? rows.filter((r) => r.is_active && (r.app_keys ?? []).includes(selectedApp.key)).sort((a, b) => a.sort_order - b.sort_order)
    : [];

  const pill = (on: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${on ? "border-blue-400 bg-blue-50 text-blue-700 font-medium border-2" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`;

  if (!allowed) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-slate-800">จัดการเมนู</h1>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-emerald-600">✓ {msg}</span>}
            {rows.length === 0 && !loading && (
              <button onClick={importDefaults} disabled={busy} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">⬇ นำเข้าเมนูเริ่มต้น</button>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-4">เลือกแอป → จัดเมนูของแอปนั้น (ลากเรียง · ซ่อน/แสดง · เพิ่มเมนู) · เลือก “ทุกเมนู” เพื่อจัดการรวม</p>

        {err && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-2">⚠ {err}<button onClick={() => setErr(null)} className="text-red-400 hover:text-red-700">✕</button></div>}

        {/* 1. เลือกแอป */}
        <div className="text-xs font-medium text-slate-500 mb-1.5">เลือกแอปที่จะจัดเมนู</div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={() => { setSel(ALL); setShowAppCfg(false); setExpanded(null); }} className={pill(sel === ALL)}>📋 ทุกเมนู</button>
          {apps.map((a) => (
            <button key={a.id} onClick={() => { setSel(a.key); setShowAppCfg(false); setExpanded(null); }} className={pill(sel === a.key)}>
              <Ico icon={a.icon} iconUrl={a.icon_url} size={16} /> {a.label}
            </button>
          ))}
          <button onClick={() => setShowAddApp((s) => !s)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:bg-slate-50">＋ เพิ่มแอป</button>
        </div>
        {showAddApp && (
          <div className="mb-4 flex flex-wrap items-end gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <div><label className="text-[11px] text-slate-500">ไอคอน (emoji)</label><input value={naApp.icon} onChange={(e) => setNaApp({ ...naApp, icon: e.target.value })} className="block w-14 h-8 px-1 text-center text-base border border-slate-200 rounded" /></div>
            <div><label className="text-[11px] text-slate-500">รหัส (key)</label><input value={naApp.key} onChange={(e) => setNaApp({ ...naApp, key: e.target.value })} placeholder="purchasing" className="block w-28 h-8 px-2 text-xs font-mono border border-slate-200 rounded" /></div>
            <div><label className="text-[11px] text-slate-500">ชื่อแอป</label><input value={naApp.label} onChange={(e) => setNaApp({ ...naApp, label: e.target.value })} placeholder="จัดซื้อ" className="block w-36 h-8 px-2 text-sm border border-slate-200 rounded" /></div>
            <button onClick={addApp} className="h-8 px-3 text-sm font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700">＋ เพิ่มแอป</button>
          </div>
        )}

        {/* 2. แถบแอปที่เลือก + ตั้งค่าแอป (PWA) */}
        {selectedApp && (
          <div className="mb-4 bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Ico icon={selectedApp.icon} iconUrl={selectedApp.icon_url} size={22} />
                <span>กำลังจัดเมนูของแอป <b>{selectedApp.label}</b></span>
                <code className="text-[10px] text-slate-400">/app/{selectedApp.key}</code>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/app/${selectedApp.key}`} target="_blank" rel="noopener noreferrer" className="h-8 px-3 leading-8 text-xs font-medium bg-white border border-slate-200 rounded hover:border-blue-300 hover:text-blue-700">เปิดแอป ↗</a>
                <button onClick={() => setShowAppCfg((s) => !s)} className={`h-8 px-3 text-xs font-medium rounded border ${showAppCfg ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>⚙️ ตั้งค่าแอป</button>
              </div>
            </div>

            {showAppCfg && (
              <div className="mt-3 border border-blue-200 bg-blue-50/40 rounded-lg p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  {/* ไอคอน */}
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden text-2xl">
                      <Ico icon={selectedApp.icon} iconUrl={selectedApp.icon_url} size={selectedApp.icon_url ? 48 : 28} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={`h-7 px-2.5 leading-7 text-xs font-medium rounded cursor-pointer text-center ${uploadingApp ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                        {uploadingApp ? "กำลังอัป…" : "⬆ อัปโหลดไอคอน"}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploadingApp}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAppIcon(selectedApp.id!, f); e.target.value = ""; }} />
                      </label>
                      {selectedApp.icon_url
                        ? <button onClick={() => void patchApp(selectedApp.id!, { icon_url: null })} className="text-[11px] text-rose-500 hover:text-rose-700">ลบรูป (ใช้ emoji)</button>
                        : <input value={selectedApp.icon ?? ""} onChange={(e) => patchApp(selectedApp.id!, { icon: e.target.value })} placeholder="emoji" className="w-16 h-6 px-1 text-center text-sm border border-slate-200 rounded" />}
                    </div>
                  </div>
                  {/* สีธีม */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">สีแอป</span>
                    <input type="color" value={selectedApp.theme_color || "#2563eb"} onChange={(e) => void patchApp(selectedApp.id!, { theme_color: e.target.value })} className="w-9 h-8 p-0 border border-slate-200 rounded cursor-pointer" />
                  </div>
                  <button onClick={() => delApp(selectedApp.id!, selectedApp.label)} className="h-8 px-3 text-xs text-rose-600 border border-rose-200 rounded hover:bg-rose-50 ml-auto">🗑 ลบแอปนี้</button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 whitespace-nowrap">🔗 ลิงก์ส่งให้คนอื่น</span>
                  <input readOnly value={`${origin}/app/${selectedApp.key}`} onFocus={(e) => e.currentTarget.select()} className="flex-1 h-8 px-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded text-slate-600" />
                  <button type="button" onClick={() => void copyShareLink(selectedApp.key)} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">📋 คัดลอก</button>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-blue-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 whitespace-nowrap">🔒 ใครเข้าแอปได้</span>
                    <input defaultValue={selectedApp.permission_key ?? ""} list="perm-list" placeholder="ว่าง = ทุกคน"
                      onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (selectedApp.permission_key ?? null)) void patchApp(selectedApp.id!, { permission_key: v }); }}
                      className="w-44 h-8 px-2 text-xs border border-slate-200 rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 whitespace-nowrap">🏠 หน้าแรก</span>
                    <select value={selectedApp.default_href ?? ""} onChange={(e) => void patchApp(selectedApp.id!, { default_href: e.target.value || null })} className="w-48 h-8 px-1 text-xs border border-slate-200 rounded bg-white">
                      <option value="">— เมนูแรกของแอป —</option>
                      {appMenuForDefault.map((m) => <option key={m.id} value={m.href}>{m.icon} {m.label}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">ไอคอนแนะนำสี่เหลี่ยมจัตุรัส ≥ 512×512px (PNG) · ตั้ง “ใครเข้าได้” เพื่อล็อกไม่ให้คนไม่เกี่ยวเข้า (พิมพ์ URL ตรงก็เข้าไม่ได้)</p>
              </div>
            )}
          </div>
        )}

        {/* 3. เครื่องมือ: ค้นหา + เพิ่มเมนู */}
        {!loading && rows.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเมนู — ชื่อ / ลิงก์ / หมวด…"
                className="w-full h-9 pl-9 pr-9 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-400" />
              {q && <button onClick={() => setQ("")} title="ล้างคำค้น" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">✕</button>}
            </div>
            {q && <span className="text-xs text-slate-500 whitespace-nowrap">พบ {matchCount}</span>}
            {sel !== ALL && <button onClick={() => { setAddOpen(true); setAddNew(false); }} className="h-9 px-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 whitespace-nowrap">＋ เพิ่มเมนู</button>}
          </div>
        )}

        {/* 4. รายการเมนู + ตัวอย่าง */}
        {loading ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div> : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">ยังไม่มีเมนูในทะเบียน — ระบบใช้ “เมนูเริ่มต้น” อยู่<br />กด <b>นำเข้าเมนูเริ่มต้น</b> เพื่อเริ่มจัดการเอง</div>
        ) : (
          <div className={`grid grid-cols-1 gap-5 ${sel !== ALL ? "lg:grid-cols-[1fr_260px]" : ""}`}>
            <div className="space-y-5">
              {groups.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">
                  {sel !== ALL && !q ? <>แอปนี้ยังไม่มีเมนู — กด <b>＋ เพิ่มเมนู</b> ด้านบน</> : <>ไม่พบเมนูที่ตรงกับ “{q}”</>}
                </div>
              )}
              {groups.map((g) => (
                <div key={g.section} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-sm font-semibold text-slate-700">{g.section} <span className="text-slate-400 font-normal">({g.items.length})</span></div>
                  <div className="divide-y divide-slate-100">
                    {g.items.map((it) => (
                      <div key={it.id}>
                        <div draggable onDragStart={() => { dragId.current = it.id!; }} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(it.id!, g.section)}
                          className={`flex items-center gap-2.5 px-3 py-2 ${it.is_active ? "" : "opacity-55"}`}>
                          <span className="cursor-grab text-slate-300 hover:text-slate-500 select-none" title="ลากเพื่อเรียงลำดับ">⠿</span>
                          <Ico icon={it.icon} size={18} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-800 truncate flex items-center gap-1.5">{it.label}{!it.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">พักไว้</span>}</div>
                            <code className="text-[10px] text-slate-400">{it.href}</code>
                            {sel === ALL && apps.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {apps.map((a) => {
                                  const on = (it.app_keys ?? []).includes(a.key);
                                  return <button key={a.key} onClick={() => toggleItemApp(it, a.key)} title="แสดงในแอปนี้"
                                    className={`px-1.5 py-0.5 text-[10px] rounded border ${on ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"}`}><Ico icon={a.icon} iconUrl={a.icon_url} size={11} /> {a.label}</button>;
                                })}
                              </div>
                            )}
                          </div>
                          <button onClick={() => patch(it.id!, { is_active: !it.is_active })} title={it.is_active ? "กำลังใช้งาน — กดเพื่อพัก" : "พักอยู่ — กดเพื่อใช้งาน"}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${it.is_active ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-300 hover:bg-slate-100"}`}>{it.is_active ? "👁" : "🚫"}</button>
                          <button onClick={() => setExpanded((e) => (e === it.id ? null : it.id!))} title="ตั้งค่าเพิ่ม"
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${expanded === it.id ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-100"}`}>⋯</button>
                        </div>

                        {/* ตั้งค่าเพิ่ม (กาง) */}
                        {expanded === it.id && (
                          <div className="px-4 pb-3 pt-1 bg-slate-50/60 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                            <label className="flex items-center gap-1.5 text-slate-600">หมวด
                              <input list="section-list" defaultValue={it.section} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.section) patch(it.id!, { section: v }); }} className="w-36 h-7 px-2 border border-slate-200 rounded" /></label>
                            <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={it.show_in_sidebar} onChange={(e) => patch(it.id!, { show_in_sidebar: e.target.checked })} /> แถบเมนูซ้าย</label>
                            <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={it.show_in_launcher} onChange={(e) => patch(it.id!, { show_in_launcher: e.target.checked })} /> หน้ารวมแอป</label>
                            <label className="flex items-center gap-1.5 text-slate-600">ใครเห็น
                              <input defaultValue={it.permission_key ?? ""} list="perm-list" placeholder="ทุกคน" onBlur={(e) => patch(it.id!, { permission_key: e.target.value.trim() || null })} className="w-40 h-7 px-2 border border-slate-200 rounded" /></label>
                            <label className="flex items-center gap-1.5 text-slate-600">ผูกหน้าข้อมูล
                              <select value={it.module_key ?? ""} onChange={(e) => patch(it.id!, { module_key: e.target.value || null })} className="w-36 h-7 px-1 border border-slate-200 rounded bg-white">
                                <option value="">— ไม่ผูก —</option>
                                {modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                              </select></label>
                            <label className="flex items-center gap-1.5 text-slate-600">ลิงก์
                              <input defaultValue={it.href} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.href) patch(it.id!, { href: v }); }} className="w-44 h-7 px-2 font-mono border border-slate-200 rounded" /></label>
                            <div className="ml-auto flex items-center gap-2">
                              {sel !== ALL && <button onClick={() => toggleItemApp(it, sel)} className="h-7 px-2.5 text-amber-700 border border-amber-200 bg-amber-50 rounded hover:bg-amber-100">เอาออกจากแอปนี้</button>}
                              <button onClick={() => del(it.id!, it.label)} className="h-7 px-2.5 text-rose-600 border border-rose-200 rounded hover:bg-rose-50">🗑 ลบเมนู</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* ตัวอย่างสด (sidebar ของแอป) */}
            {sel !== ALL && (
              <div>
                <div className="text-xs text-slate-400 mb-1.5">ตัวอย่างที่ผู้ใช้เห็น</div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sticky top-4">
                  <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-200">
                    <Ico icon={selectedApp?.icon} iconUrl={selectedApp?.icon_url} size={18} />
                    <span className="text-sm font-medium text-slate-700">{selectedApp?.label}</span>
                  </div>
                  {previewItems.length === 0 ? <div className="text-[11px] text-slate-300 py-4 text-center">ยังไม่มีเมนูแสดง</div>
                    : previewItems.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-[13px] text-slate-600 px-2 py-1.5 rounded-md hover:bg-white"><Ico icon={m.icon} size={15} /><span className="truncate">{m.label}</span></div>
                    ))}
                  <div className="text-[10px] text-slate-400 mt-2 leading-relaxed">เปลี่ยนทางซ้าย → เห็นผลตรงนี้ทันที (เฉพาะที่ติ๊ก “แถบเมนูซ้าย” + ใช้งานอยู่)</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ป๊อปอัป: เพิ่มเมนูเข้าแอป */}
        {addOpen && sel !== ALL && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setAddOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="text-sm font-semibold text-slate-800">เพิ่มเมนูเข้าแอป «{selectedApp?.label}»</div>
                <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
              <div className="flex border-b border-slate-100 text-sm">
                <button onClick={() => setAddNew(false)} className={`flex-1 py-2 ${!addNew ? "border-b-2 border-blue-500 text-blue-700 font-medium" : "text-slate-500"}`}>เลือกจากเมนูที่มีอยู่</button>
                <button onClick={() => setAddNew(true)} className={`flex-1 py-2 ${addNew ? "border-b-2 border-blue-500 text-blue-700 font-medium" : "text-slate-500"}`}>สร้างเมนูใหม่</button>
              </div>
              {!addNew ? (
                <div className="flex-1 overflow-auto p-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา…" className="w-full h-8 px-2 mb-2 text-sm border border-slate-200 rounded" />
                  {notInApp.length === 0 ? <div className="text-center text-xs text-slate-300 py-6">เมนูทั้งหมดอยู่ในแอปนี้แล้ว</div>
                    : notInApp.map((r) => (
                      <button key={r.id} onClick={() => { toggleItemApp(r, sel); flash(`เพิ่ม “${r.label}” แล้ว`); }} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-emerald-50 text-left">
                        <Ico icon={r.icon} size={16} /><span className="flex-1 text-sm text-slate-700 truncate">{r.label}</span>
                        <span className="text-[10px] text-slate-400">{r.section}</span><span className="text-emerald-600 text-sm">＋</span>
                      </button>
                    ))}
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <div><label className="text-[11px] text-slate-500">ไอคอน</label><input value={na.icon} onChange={(e) => setNa({ ...na, icon: e.target.value })} className="block w-14 h-8 px-1 text-center text-base border border-slate-200 rounded" /></div>
                    <div className="flex-1"><label className="text-[11px] text-slate-500">ชื่อเมนู</label><input value={na.label} onChange={(e) => setNa({ ...na, label: e.target.value })} placeholder="เช่น รายงานขาย" className="block w-full h-8 px-2 text-sm border border-slate-200 rounded" /></div>
                  </div>
                  <div><label className="text-[11px] text-slate-500">ลิงก์ (href)</label><input value={na.href} onChange={(e) => setNa({ ...na, href: e.target.value })} placeholder="/m/..." className="block w-full h-8 px-2 text-sm font-mono border border-slate-200 rounded" /></div>
                  <div><label className="text-[11px] text-slate-500">หมวด</label><input list="section-list" value={na.section} onChange={(e) => setNa({ ...na, section: e.target.value })} placeholder="เช่น งานประจำวัน" className="block w-full h-8 px-2 text-sm border border-slate-200 rounded" /></div>
                  <button onClick={addItem} disabled={busy} className="w-full h-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">＋ สร้างเมนู + เพิ่มเข้าแอปนี้</button>
                </div>
              )}
            </div>
          </div>
        )}

        <datalist id="perm-list">
          {["admin.users", "products.view", "products.edit", "purchase_requests.view", "purchase_requests.approve", "sales.view", "inventory.view"].map((p) => <option key={p} value={p} />)}
        </datalist>
        <datalist id="section-list">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        <p className="mt-3 text-[11px] text-slate-400">ผู้แก้: {user?.name ?? "—"} · ผูก “ใครเห็น” แล้วเมนูจะโชว์เฉพาะคนที่มีสิทธิ์นั้น · ทุกการเปลี่ยนบันทึกอัตโนมัติ</p>
      </div>
    </PlaygroundShell>
  );
}
