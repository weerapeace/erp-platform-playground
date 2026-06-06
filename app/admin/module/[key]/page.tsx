"use client";

/**
 * ตั้งค่าโมดูล (Module Settings) — /admin/module/<moduleKey>
 *
 * รวมการตั้งค่าที่เกี่ยวกับโมดูลเดียวไว้ที่เดียว (เข้าจากหมวด "⚙ ตั้งค่า" ในแถบเมนูซ้ายของแต่ละแอป)
 *  - Field Registry : ฝัง SchemaSyncClient (ล็อกเฉพาะโมดูลนี้)
 *  - Saved Views    : ดู/ลบ/ตั้ง default มุมมองของตารางนี้ (inline)
 *  - Table Layout   : ลิงก์ไปตัวจัดเลย์เอาต์ของตารางนี้ (ของกลางเดิม)
 *
 * tableId = `master-<moduleKey>` (คอนเวนชันกลางของ MasterPage/MasterCRUD)
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

const SchemaSyncClient = dynamic(
  () => import("@/app/admin/schema-sync/schema-sync-client").then((m) => m.SchemaSyncClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

type Tab = "general" | "fields" | "views" | "layout";

type App = { key: string; label: string; icon: string | null };
type ModuleGeneral = {
  key: string; table: string; label: string; description: string;
  primary_field: string; icon: string; is_active: boolean; sort_order: number;
};
type MenuLink = { id: string; app_keys: string[] | null; show_in_sidebar: boolean; show_in_launcher: boolean; section: string | null } | null;
type GeneralData = {
  module: ModuleGeneral;
  fields: { value: string; label: string }[];
  apps: App[];
  menu: MenuLink;
};
type SavedView = {
  id: string; table_id: string; label: string; visibility: "personal" | "team" | "system";
  is_default: boolean; owner_name: string | null; updated_at: string;
};

const VIS_ICON: Record<string, string> = { personal: "👤", team: "👥", system: "⭐" };

export default function ModuleSettingsPage() {
  const moduleKey = String(useParams().key ?? "");
  const tableId = `master-${moduleKey}`;
  const [tab, setTab] = useState<Tab>("general");
  const [label, setLabel] = useState(moduleKey);

  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      const m = (j.data as { key: string; label: string }[] | undefined)?.find((x) => x.key === moduleKey);
      if (m?.label) setLabel(m.label);
    }).catch(() => {});
  }, [moduleKey]);

  return (
    <PlaygroundShell>
      <div className="min-h-screen bg-slate-50">
        {/* header */}
        <div className="bg-white border-b border-slate-200 px-6 pt-5">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
            <Link href="/admin/schema-sync" className="hover:text-slate-600">ตั้งค่า</Link>
            <span>/</span>
            <span className="text-slate-600">{label}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">⚙ ตั้งค่าโมดูล: {label}</h1>
          <p className="text-sm text-slate-500 mt-0.5">โมดูล <code className="text-xs bg-slate-100 px-1 rounded">{moduleKey}</code> · ตาราง <code className="text-xs bg-slate-100 px-1 rounded">{tableId}</code></p>
          {/* tabs */}
          <div className="flex gap-1 mt-4 -mb-px">
            {([
              { id: "general", label: "⚙ ตั้งค่าทั่วไป" },
              { id: "fields", label: "🗂️ Field Registry" },
              { id: "views",  label: "🔖 Saved Views" },
              { id: "layout", label: "📐 Table Layout" },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`h-10 px-4 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        {tab === "general" && <GeneralPanel moduleKey={moduleKey} onLabelChange={setLabel} />}
        {tab === "fields" && (
          <SchemaSyncClient initialModule={moduleKey} lockModule embedded />
        )}
        {tab === "views"  && <SavedViewsPanel tableId={tableId} />}
        {tab === "layout" && <LayoutPanel tableId={tableId} moduleKey={moduleKey} />}
      </div>
    </PlaygroundShell>
  );
}

// ---- Saved Views (inline) ----
function SavedViewsPanel({ tableId }: { tableId: string }) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/saved-views?table_id=${encodeURIComponent(tableId)}`).then((r) => r.json());
      setViews((j.data ?? []) as SavedView[]);
    } catch { setViews([]); } finally { setLoading(false); }
  }, [tableId]);
  useEffect(() => { load(); }, [load]);

  const setDefault = async (id: string, makeDefault: boolean) => {
    await apiFetch(`/api/saved-views?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: makeDefault }),
    });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("ลบมุมมองนี้?")) return;
    await apiFetch(`/api/saved-views?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <p className="text-sm text-slate-500 mb-3">มุมมองที่บันทึกไว้ของตารางนี้ — กดดาวเพื่อตั้งเป็นค่าเริ่มต้น (เปิดหน้านี้ครั้งหน้าจะใช้มุมมองนั้น)</p>
      {loading ? (
        <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>
      ) : views.length === 0 ? (
        <div className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-200 rounded-lg">— ยังไม่มีมุมมองที่บันทึกไว้ —<br /><span className="text-xs">ไปที่หน้าตารางของโมดูลนี้ แล้วกดปุ่ม + เพื่อบันทึกมุมมอง</span></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {views.map((v) => (
            <div key={v.id} className="flex items-center gap-2 px-4 py-2.5">
              <button onClick={() => setDefault(v.id, !v.is_default)} title={v.is_default ? "ยกเลิก default" : "ตั้งเป็น default"}
                className={`w-7 h-7 rounded inline-flex items-center justify-center ${v.is_default ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}>
                {v.is_default ? "★" : "☆"}
              </button>
              <span className="text-sm">{VIS_ICON[v.visibility] ?? "👤"}</span>
              <span className="flex-1 text-sm text-slate-700">{v.label}</span>
              {v.owner_name && <span className="text-xs text-slate-400">{v.owner_name}</span>}
              <button onClick={() => remove(v.id)} title="ลบ"
                className="w-7 h-7 rounded text-slate-300 hover:text-red-500 inline-flex items-center justify-center">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- ตั้งค่าทั่วไป (General) ----
function GeneralPanel({ moduleKey, onLabelChange }: { moduleKey: string; onLabelChange: (s: string) => void }) {
  const [data, setData] = useState<GeneralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ฟอร์ม
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🧩");
  const [primaryField, setPrimaryField] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(100);
  const [appKeys, setAppKeys] = useState<string[]>([]);
  const [inSidebar, setInSidebar] = useState(false);
  const [inLauncher, setInLauncher] = useState(false);

  useEffect(() => {
    setLoading(true); setErr(null);
    apiFetch(`/api/admin/module-settings/${encodeURIComponent(moduleKey)}`).then((r) => r.json()).then((j) => {
      if (j.error || !j.data) { setErr(j.error ?? "โหลดข้อมูลไม่สำเร็จ"); return; }
      const d = j.data as GeneralData;
      setData(d);
      setLabel(d.module.label); setDescription(d.module.description);
      setIcon(d.module.icon || "🧩"); setPrimaryField(d.module.primary_field);
      setIsActive(d.module.is_active); setSortOrder(d.module.sort_order);
      setAppKeys(d.menu?.app_keys ?? []);
      setInSidebar(d.menu?.show_in_sidebar ?? false);
      setInLauncher(d.menu?.show_in_launcher ?? false);
    }).catch(() => setErr("โหลดข้อมูลไม่สำเร็จ")).finally(() => setLoading(false));
  }, [moduleKey]);

  const toggleApp = (k: string) =>
    setAppKeys((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);

  const save = async () => {
    if (!label.trim()) { setErr("กรุณากรอกชื่อโมดูล"); return; }
    setSaving(true); setErr(null); setMsg(null);
    try {
      const j = await apiFetch(`/api/admin/module-settings/${encodeURIComponent(moduleKey)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: { label: label.trim(), description, icon, primary_field: primaryField, is_active: isActive, sort_order: sortOrder },
          menu: { app_keys: appKeys, show_in_sidebar: inSidebar, show_in_launcher: inLauncher },
        }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      onLabelChange(label.trim());
      setMsg("บันทึกแล้ว ✓ (เมนูจะอัปเดตเมื่อรีโหลดหน้า)");
      setTimeout(() => setMsg(null), 4000);
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>;
  if (err && !data) return <div className="max-w-2xl mx-auto px-6 py-10 text-center text-sm text-red-600">⚠️ {err}</div>;

  const card = "bg-white border border-slate-200 rounded-xl p-5";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1.5";
  const inputCls = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
      {/* ===== ข้อมูลโมดูล ===== */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-800 mb-4">ข้อมูลโมดูล</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr] gap-3">
          <div>
            <label className={labelCls}>ไอคอน</label>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4}
              className={`${inputCls} text-center text-xl`} placeholder="🧩" />
          </div>
          <div>
            <label className={labelCls}>ชื่อโมดูล (ที่โชว์ในเมนู)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="เช่น ธนาคาร" />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>คำอธิบาย</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="คำอธิบายสั้น ๆ ใต้ชื่อ" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className={labelCls}>ฟิลด์ชื่อหลัก (Primary field)</label>
            <select value={primaryField} onChange={(e) => setPrimaryField(e.target.value)} className={inputCls}>
              <option value="">— ไม่กำหนด —</option>
              {data?.fields.map((f) => <option key={f.value} value={f.value}>{f.label} ({f.value})</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">ใช้เป็นชื่อตัวแทน record เวลาโมดูลอื่นเลือกอ้างถึง (เช่นใน dropdown)</p>
          </div>
          <div>
            <label className={labelCls}>ลำดับการแสดง</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} className={inputCls} />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-4 text-sm text-slate-700 cursor-pointer select-none">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-300 w-4 h-4" />
          เปิดใช้งานโมดูลนี้ <span className="text-xs text-slate-400">(ปิด = ซ่อนทั้งระบบ ไม่ลบข้อมูล)</span>
        </label>
      </div>

      {/* ===== ตำแหน่งในเมนู ===== */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">ตำแหน่งในเมนู</h3>
        <p className="text-xs text-slate-500 mb-4">เลือกว่าโมดูลนี้ไปอยู่ใต้ App หลักไหน และจะแสดงในเมนูหรือไม่</p>

        <label className={labelCls}>สังกัด App หลัก (เลือกได้หลายอัน)</label>
        {(data?.apps.length ?? 0) === 0 ? (
          <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">
            — ยังไม่มี App หลักในระบบ — สร้างได้ที่หน้า “จัดการเมนู”
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {data?.apps.map((a) => {
              const on = appKeys.includes(a.key);
              return (
                <button key={a.key} type="button" onClick={() => toggleApp(a.key)}
                  className={`flex items-center gap-2 px-3 h-10 rounded-lg border text-sm transition-colors ${
                    on ? "border-blue-400 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}>
                  <span>{a.icon ?? "📦"}</span>
                  <span className="flex-1 text-left truncate">{a.label}</span>
                  {on && <span className="text-blue-500">✓</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={inSidebar} onChange={(e) => setInSidebar(e.target.checked)} className="rounded border-slate-300 w-4 h-4" />
            แสดงในเมนูซ้าย (Sidebar)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={inLauncher} onChange={(e) => setInLauncher(e.target.checked)} className="rounded border-slate-300 w-4 h-4" />
            แสดงในหน้ารวมแอป (App Launcher)
          </label>
        </div>
      </div>

      {/* ===== actions ===== */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="h-10 px-6 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        {err && <span className="text-sm text-red-600">⚠️ {err}</span>}
      </div>
    </div>
  );
}

// ---- Table Layout — ค่าเริ่มต้นตาราง (sort / group / สีแถว) + ลิงก์ตัวจัดคอลัมน์ ----
type SortDir = "asc" | "desc";
type SortSpec = { column: string; dir: SortDir };
type RowColorOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "empty" | "not_empty";
type RowColorRule = { column: string; op: RowColorOp; value?: string; color: string };
type LayoutSettings = {
  default_sort?: SortSpec | null;
  secondary_sort?: SortSpec | null;
  group_by?: string | null;
  row_color_rules?: RowColorRule[];
  summaries?: Record<string, "sum" | "count" | "avg">;
};
type FullLayout = {
  label?: string; description?: string | null; columns?: unknown[];
  default_density?: string; default_page_size?: number; default_view_mode?: string;
  notes?: string | null; settings?: LayoutSettings;
};

const COLOR_OPTS = [
  { key: "red", label: "แดง" }, { key: "orange", label: "ส้ม" }, { key: "amber", label: "เหลือง" },
  { key: "green", label: "เขียว" }, { key: "blue", label: "ฟ้า" }, { key: "purple", label: "ม่วง" }, { key: "slate", label: "เทา" },
];
const OP_OPTS: { key: RowColorOp; label: string }[] = [
  { key: "eq", label: "เท่ากับ" }, { key: "ne", label: "ไม่เท่ากับ" },
  { key: "lt", label: "น้อยกว่า" }, { key: "lte", label: "น้อยกว่า/เท่ากับ" },
  { key: "gt", label: "มากกว่า" }, { key: "gte", label: "มากกว่า/เท่ากับ" },
  { key: "empty", label: "ว่าง" }, { key: "not_empty", label: "ไม่ว่าง" },
];

function LayoutPanel({ tableId, moduleKey }: { tableId: string; moduleKey: string }) {
  const [fields, setFields] = useState<{ value: string; label: string }[]>([]);
  const [full, setFull] = useState<FullLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [sortCol, setSortCol] = useState(""); const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sort2Col, setSort2Col] = useState(""); const [sort2Dir, setSort2Dir] = useState<SortDir>("asc");
  const [groupBy, setGroupBy] = useState("");
  const [rules, setRules] = useState<RowColorRule[]>([]);
  const [summaries, setSummaries] = useState<Record<string, "sum" | "count" | "avg">>({});

  useEffect(() => {
    setLoading(true); setErr(null);
    Promise.all([
      apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(moduleKey)}`).then((r) => r.json()).catch(() => ({})),
      apiFetch(`/api/table-layouts?table_id=${encodeURIComponent(tableId)}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([fr, lr]) => {
      const fl = (fr.fields as { column_name: string | null; field_label: string }[] | undefined) ?? [];
      setFields(fl.filter((f) => f.column_name).map((f) => ({ value: String(f.column_name), label: f.field_label || String(f.column_name) })));
      const layout = (lr.data as FullLayout | null) ?? null;
      setFull(layout);
      const s = layout?.settings ?? {};
      setSortCol(s.default_sort?.column ?? ""); setSortDir(s.default_sort?.dir ?? "asc");
      setSort2Col(s.secondary_sort?.column ?? ""); setSort2Dir(s.secondary_sort?.dir ?? "asc");
      setGroupBy(s.group_by ?? "");
      setRules(Array.isArray(s.row_color_rules) ? s.row_color_rules : []);
      setSummaries((s.summaries as Record<string, "sum" | "count" | "avg">) ?? {});
    }).finally(() => setLoading(false));
  }, [tableId, moduleKey]);

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null);
    const settings: LayoutSettings = {
      default_sort: sortCol ? { column: sortCol, dir: sortDir } : null,
      secondary_sort: sort2Col ? { column: sort2Col, dir: sort2Dir } : null,
      group_by: groupBy || null,
      row_color_rules: rules.filter((r) => r.column && r.color),
      summaries: Object.keys(summaries).length ? summaries : undefined,
    };
    try {
      const j = await apiFetch("/api/admin/table-layouts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_id: tableId,
          label: full?.label || tableId,
          description: full?.description ?? null,
          columns: full?.columns ?? [],
          default_density: full?.default_density ?? "normal",
          default_page_size: full?.default_page_size ?? 20,
          default_view_mode: full?.default_view_mode ?? "table",
          notes: full?.notes ?? null,
          settings,
        }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setMsg("บันทึกแล้ว ✓ (เปิดตารางใหม่จะใช้ค่านี้)");
      setTimeout(() => setMsg(null), 4000);
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>;

  const card = "bg-white border border-slate-200 rounded-xl p-5";
  const sel = "h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white";
  const colSelect = (val: string, on: (v: string) => void, allowNone = true) => (
    <select value={val} onChange={(e) => on(e.target.value)} className={sel}>
      {allowNone && <option value="">— ไม่กำหนด —</option>}
      {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
    </select>
  );
  const dirSelect = (val: SortDir, on: (v: SortDir) => void) => (
    <select value={val} onChange={(e) => on(e.target.value as SortDir)} className={sel}>
      <option value="asc">น้อย → มาก (A→Z, เก่า→ใหม่)</option>
      <option value="desc">มาก → น้อย (Z→A, ใหม่→เก่า)</option>
    </select>
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
      {/* การเรียง + จัดกลุ่ม */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-800 mb-4">ค่าเริ่มต้นตาราง</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">เรียงเริ่มต้น (Default sort)</label>
            <div className="flex flex-wrap gap-2">{colSelect(sortCol, setSortCol)} {sortCol && dirSelect(sortDir, setSortDir)}</div>
          </div>
          {sortCol && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">เรียงรอง (ตัวตัดสินเมื่อค่าหลักเท่ากัน)</label>
              <div className="flex flex-wrap gap-2">{colSelect(sort2Col, setSort2Col)} {sort2Col && dirSelect(sort2Dir, setSort2Dir)}</div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">จัดกลุ่มเริ่มต้น (Group by)</label>
            {colSelect(groupBy, setGroupBy)}
          </div>
        </div>
      </div>

      {/* สีแถวตามเงื่อนไข */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-800">ระบายสีแถวตามเงื่อนไข</h3>
          <button onClick={() => setRules((r) => [...r, { column: fields[0]?.value ?? "", op: "eq", value: "", color: "red" }])}
            className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">+ เพิ่มกฎ</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">เช่น สต๊อก น้อยกว่า 10 → แดง · กฎบนสุดที่เข้าเงื่อนไขชนะ</p>
        {rules.length === 0 ? (
          <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">— ยังไม่มีกฎ —</div>
        ) : (
          <div className="space-y-2">
            {rules.map((r, i) => {
              const upd = (p: Partial<RowColorRule>) => setRules((arr) => arr.map((x, j) => j === i ? { ...x, ...p } : x));
              const noVal = r.op === "empty" || r.op === "not_empty";
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 bg-slate-50 rounded-lg p-2">
                  <select value={r.column} onChange={(e) => upd({ column: e.target.value })} className={sel}>
                    {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={r.op} onChange={(e) => upd({ op: e.target.value as RowColorOp })} className={sel}>
                    {OP_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  {!noVal && <input value={r.value ?? ""} onChange={(e) => upd({ value: e.target.value })} placeholder="ค่า" className={`${sel} w-24`} />}
                  <select value={r.color} onChange={(e) => upd({ color: e.target.value })} className={sel}>
                    {COLOR_OPTS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <span className="w-6 h-6 rounded border border-slate-300" style={{ backgroundColor: ({ red:"#fecaca",orange:"#fed7aa",amber:"#fde68a",green:"#bbf7d0",blue:"#bfdbfe",purple:"#e9d5ff",slate:"#e2e8f0" } as Record<string,string>)[r.color] }} />
                  <button onClick={() => setRules((arr) => arr.filter((_, j) => j !== i))} className="ml-auto text-slate-400 hover:text-red-500 text-sm">✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* สรุปท้ายคอลัมน์ */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">สรุปท้ายคอลัมน์ (Total row)</h3>
        <p className="text-xs text-slate-500 mb-3">แสดงแถวสรุปท้ายตาราง เช่น รวมยอด/นับจำนวน/เฉลี่ย ของคอลัมน์ที่เลือก</p>
        <div className="space-y-2">
          {fields.map((f) => {
            const cur = summaries[f.value] ?? "";
            return (
              <div key={f.value} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-slate-700 truncate">{f.label}</span>
                <select value={cur}
                  onChange={(e) => setSummaries((p) => {
                    const n = { ...p }; const v = e.target.value;
                    if (v) n[f.value] = v as "sum" | "count" | "avg"; else delete n[f.value];
                    return n;
                  })}
                  className={sel}>
                  <option value="">— ไม่สรุป —</option>
                  <option value="sum">รวมยอด (sum)</option>
                  <option value="count">นับจำนวน (count)</option>
                  <option value="avg">เฉลี่ย (avg)</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="h-10 px-6 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : "บันทึกค่าเริ่มต้นตาราง"}
        </button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        {err && <span className="text-sm text-red-600">⚠️ {err}</span>}
      </div>

      {/* ลิงก์ตัวจัดคอลัมน์เดิม */}
      <div className="text-center pt-2">
        <Link href={`/admin/table-layouts?table=${encodeURIComponent(tableId)}`} className="text-sm text-blue-600 hover:underline">
          จัดคอลัมน์ / ความหนาแน่น / จำนวนต่อหน้า (ตัวจัดเลย์เอาต์เต็ม) →
        </Link>
      </div>
    </div>
  );
}
