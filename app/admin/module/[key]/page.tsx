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

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { IconPicker } from "@/components/icon-picker";
import { TableLayoutPanel } from "@/components/table-layout-panel";
import {
  STANDARD_ROW_ACTION_ICONS,
  getDefaultRowActionSettings,
  getModuleRowActionMetas,
  getRowActionStorageKey,
  loadRowActionSettings,
  renderStandardRowActionIcon,
  resetRowActionSettings,
  saveRowActionSettings,
  type RowActionSetting,
  type RowActionPlacement,
  type StandardRowActionIconKey,
} from "@/components/data-table/row-actions";

const SchemaSyncClient = dynamic(
  () => import("@/app/admin/schema-sync/schema-sync-client").then((m) => m.SchemaSyncClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

type Tab = "general" | "fields" | "views" | "layout" | "actions";

type App = { key: string; label: string; icon: string | null };
type ModuleGeneral = {
  key: string; table: string; label: string; description: string;
  primary_field: string; group_label: string; icon: string; is_active: boolean; sort_order: number;
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
              { id: "actions", label: "⋮ Row Actions" },
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
        {tab === "layout" && <TableLayoutPanel tableId={tableId} moduleKey={moduleKey} />}
        {tab === "actions" && <RowActionsPanel moduleKey={moduleKey} tableId={tableId} />}
      </div>
    </PlaygroundShell>
  );
}

function RowActionsPanel({ moduleKey, tableId }: { moduleKey: string; tableId: string }) {
  const modulePath = moduleKey === "quotations" ? "/quotations" : `/master/${moduleKey}`;
  const actions = useMemo(() => getModuleRowActionMetas(moduleKey), [moduleKey]);
  const storageKey = getRowActionStorageKey(moduleKey === "quotations" ? "quotations" : tableId);
  const [settings, setSettings] = useState<Record<string, RowActionSetting>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadRowActionSettings(storageKey, actions));
    setSaved(false);
  }, [actions, storageKey]);

  const setPlacement = (actionId: string, placement: RowActionPlacement) => {
    setSettings((current) => ({
      ...current,
      [actionId]: { ...(current[actionId] ?? getDefaultRowActionSettings(actions)[actionId]), placement },
    }));
    setSaved(false);
  };

  const setIcon = (actionId: string, iconKey: StandardRowActionIconKey) => {
    setSettings((current) => ({
      ...current,
      [actionId]: { ...(current[actionId] ?? getDefaultRowActionSettings(actions)[actionId]), iconKey },
    }));
    setSaved(false);
  };

  const save = () => {
    saveRowActionSettings(storageKey, settings);
    setSaved(true);
  };

  const reset = () => {
    setSettings(resetRowActionSettings(storageKey, actions));
    setSaved(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Row Actions</h3>
            <p className="text-sm text-slate-500 mt-1">
              เลือกว่าปุ่มจัดการของแต่ละแถวจะโชว์บนตารางเลย อยู่ในเมนู ⋮ หรือซ่อนไว้ และเลือก icon มาตรฐานของปุ่มได้
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              disabled={actions.length === 0}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              onClick={save}
              disabled={actions.length === 0}
              className="h-9 px-4 rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              บันทึก
            </button>
            <Link
              href={modulePath}
              className="shrink-0 h-9 px-3 inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              ไปหน้าตาราง
            </Link>
          </div>
        </div>

        {actions.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
            โมดูลนี้ยังไม่ได้ประกาศ Row Actions กลางไว้ จึงยังตั้งค่าจากหน้านี้ไม่ได้
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1.5fr_220px_220px] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div>Action</div>
              <div>แสดงที่ไหน</div>
              <div>Icon</div>
            </div>
            {actions.map((action) => {
              const current = settings[action.id] ?? getDefaultRowActionSettings(actions)[action.id];
              return (
                <div key={action.id} className="grid grid-cols-[1.5fr_220px_220px] items-center gap-3 border-t border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={action.group === "อันตราย" ? "text-red-500" : "text-slate-500"}>
                        {renderStandardRowActionIcon(current.iconKey)}
                      </span>
                      <span className="font-medium text-slate-800">{action.label}</span>
                      {action.group && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{action.group}</span>}
                    </div>
                    {action.description && <p className="mt-1 text-xs text-slate-400">{action.description}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                    {([
                      ["inline", "บนแถว"],
                      ["menu", "เมนู"],
                      ["hidden", "ซ่อน"],
                    ] as const).map(([placement, label]) => (
                      <button
                        key={placement}
                        type="button"
                        onClick={() => setPlacement(action.id, placement)}
                        className={`h-8 rounded-md text-xs font-medium transition-colors ${
                          current.placement === placement ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={current.iconKey}
                    onChange={(event) => setIcon(action.id, event.target.value as StandardRowActionIconKey)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {STANDARD_ROW_ACTION_ICONS.map((icon) => (
                      <option key={icon.key} value={icon.key}>{icon.label}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>
            ตอนนี้การตั้งค่ายังจำเฉพาะเครื่องนี้ก่อน เฟสถัดไปค่อยย้ายไปบันทึกเป็นค่า module กลาง เพื่อให้ทุกคนในทีมเห็นเหมือนกัน
          </span>
          {saved && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">บันทึกแล้ว</span>}
        </div>
      </div>
    </div>
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
  const [groupLabel, setGroupLabel] = useState("");
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState(false);   // โหมด "สร้างกลุ่มใหม่"
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
      setGroupLabel(d.module.group_label ?? "");
      setIsActive(d.module.is_active); setSortOrder(d.module.sort_order);
      setAppKeys(d.menu?.app_keys ?? []);
      setInSidebar(d.menu?.show_in_sidebar ?? false);
      setInLauncher(d.menu?.show_in_launcher ?? false);
    }).catch(() => setErr("โหลดข้อมูลไม่สำเร็จ")).finally(() => setLoading(false));
  }, [moduleKey]);

  // รายชื่อกลุ่มที่มีอยู่แล้ว (datalist ช่วยเลือกซ้ำได้ง่าย)
  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      const gs = [...new Set(((j.data ?? []) as { group_label?: string | null }[]).map((m) => m.group_label).filter((g): g is string => !!g))];
      setGroupOptions(gs.sort());
    }).catch(() => {});
  }, []);

  const toggleApp = (k: string) =>
    setAppKeys((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);

  const save = async () => {
    if (!label.trim()) { setErr("กรุณากรอกชื่อโมดูล"); return; }
    setSaving(true); setErr(null); setMsg(null);
    try {
      const j = await apiFetch(`/api/admin/module-settings/${encodeURIComponent(moduleKey)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: { label: label.trim(), description, icon, primary_field: primaryField, group_label: groupLabel, is_active: isActive, sort_order: sortOrder },
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
            <div className="mt-0.5"><IconPicker value={icon} onChange={setIcon} /></div>
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
        <div className="mt-3">
          <label className={labelCls}>กลุ่ม (รวมหลายโมดูลเป็นหน้าแท็บเดียว)</label>
          {newGroup ? (
            <div className="flex gap-2">
              <input value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} autoFocus
                className={inputCls} placeholder="ชื่อกลุ่มใหม่ เช่น ข้อมูลสินค้า" />
              <button type="button" onClick={() => { setNewGroup(false); setGroupLabel(""); }}
                className="shrink-0 h-10 px-3 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            </div>
          ) : (
            <select
              value={groupLabel && [...groupOptions, groupLabel].includes(groupLabel) ? groupLabel : ""}
              onChange={(e) => {
                if (e.target.value === "__new__") { setNewGroup(true); setGroupLabel(""); }
                else setGroupLabel(e.target.value);
              }}
              className={inputCls}>
              <option value="">— ไม่รวมกลุ่ม —</option>
              {[...new Set([...groupOptions, groupLabel].filter(Boolean))].map((g) => <option key={g} value={g}>{g}</option>)}
              <option value="__new__">➕ สร้างกลุ่มใหม่…</option>
            </select>
          )}
          <p className="text-[11px] text-slate-400 mt-1">โมดูลที่อยู่กลุ่มเดียวกัน จะรวมเป็นแท็บในหน้าเดียว และ<b>เมนู “{groupLabel || "ชื่อกลุ่ม"}” จะโผล่ในเมนูซ้ายให้อัตโนมัติ</b> (เมนูย่อยของโมดูลที่เข้ากลุ่มจะถูกซ่อนกันซ้ำ) · เลือก “สังกัด App” ด้านล่างให้ตรงกับที่อยากให้กลุ่มโผล่</p>
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

