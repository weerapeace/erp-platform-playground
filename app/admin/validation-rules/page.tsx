"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { validateValue, clearValidationCache, type ValidationRule } from "@/lib/validation";
import type { ValidationRulesResponse } from "@/app/api/validation-rules/route";

const CAT_COLOR: Record<string, string> = {
  format:   "bg-blue-50 text-blue-700",
  range:    "bg-emerald-50 text-emerald-700",
  required: "bg-amber-50 text-amber-700",
  business: "bg-purple-50 text-purple-700",
  custom:   "bg-slate-100 text-slate-700",
};

const TYPE_LABEL: Record<string, string> = {
  regex:    "🔤 Regex",
  min_max:  "📊 Range",
  length:   "📏 Length",
  required: "❗ Required",
  function: "⚙ Function",
};

export default function ValidationRulesAdminPage() {
  const canView = usePermission("validation.view");
  const canEdit = usePermission("admin.validation");
  const { user } = useAuth();

  const [rules,   setRules]   = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [selected,    setSelected]    = useState<ValidationRule | null>(null);
  const [editing,     setEditing]     = useState<ValidationRule | null>(null);
  const [editingCfg,  setEditingCfg]  = useState("");
  const [savedAt,     setSavedAt]     = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ValidationRule | null>(null);

  // sandbox
  const [testValue, setTestValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      clearValidationCache();
      const res = await apiFetch("/api/validation-rules");
      const json: ValidationRulesResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setRules(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  // grouped
  const grouped = useMemo(() => {
    const g: Record<string, ValidationRule[]> = {};
    for (const r of rules) (g[r.category] ??= []).push(r);
    return g;
  }, [rules]);

  // sandbox test — รัน rule ที่เลือกกับค่า test
  const rulesMap = useMemo(() => {
    const m: Record<string, ValidationRule> = {};
    rules.forEach(r => { m[r.key] = r; });
    return m;
  }, [rules]);

  const testResult = useMemo(() => {
    if (!selected) return null;
    if (!testValue && selected.validator_type !== "required") return null;
    return validateValue(testValue, [selected.key], rulesMap);
  }, [testValue, selected, rulesMap]);

  // start editing
  const startEdit = (r: ValidationRule) => {
    setEditing({ ...r });
    setEditingCfg(JSON.stringify(r.config, null, 2));
  };
  const cancelEdit = () => { setEditing(null); setEditingCfg(""); };

  const save = async () => {
    if (!editing) return;
    let cfg: Record<string, unknown>;
    try { cfg = JSON.parse(editingCfg || "{}"); }
    catch (e) { setError(`config JSON ผิด: ${e instanceof Error ? e.message : "?"}`); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiFetch("/api/validation-rules", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, config: cfg, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      cancelEdit();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const remove = async (r: ValidationRule) => {
    try {
      const res = await apiFetch(`/api/validation-rules?key=${r.key}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Validation Rules</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              กฎการตรวจสอบกลาง — ทุก form/import ใช้ rule เหล่านี้ผ่าน <code className="text-xs bg-slate-100 px-1 rounded">lib/validation</code>
            </p>
          </div>
          {savedAt && <span className="text-xs text-emerald-600">✓ บันทึกแล้ว {savedAt}</span>}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <div className="grid grid-cols-12 gap-3">
          {/* List */}
          <aside className="col-span-12 md:col-span-4">
            {loading ? (
              <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : Object.keys(grouped).sort().map(cat => (
              <div key={cat} className="mb-4">
                <div className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-t ${CAT_COLOR[cat]}`}>
                  {cat} · {grouped[cat].length}
                </div>
                <div className="bg-white border border-slate-200 rounded-b">
                  {grouped[cat].map(r => (
                    <button key={r.key} onClick={() => setSelected(r)}
                      className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${
                        selected?.key === r.key ? "bg-blue-50" : ""
                      } ${!r.active ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{r.key}</code>
                        {r.is_builtin && <span className="text-[9px] text-blue-600">built-in</span>}
                      </div>
                      <div className="text-sm text-slate-800 mt-0.5">{r.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Detail / Editor / Sandbox */}
          <section className="col-span-12 md:col-span-8">
            {!selected ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
                เลือก rule ทางซ้ายเพื่อดูรายละเอียด
              </div>
            ) : editing ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h2 className="font-semibold text-slate-800">แก้ rule: <code className="text-xs bg-slate-100 px-1.5 rounded">{editing.key}</code></h2>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">ป้ายชื่อ</span>
                  <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}
                    className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">คำอธิบาย</span>
                  <input value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })}
                    className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Error message ค่าเริ่มต้น</span>
                  <input value={editing.default_message ?? ""} onChange={e => setEditing({ ...editing, default_message: e.target.value })}
                    className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Config (JSON)</span>
                  <textarea value={editingCfg} onChange={e => setEditingCfg(e.target.value)} rows={8} spellCheck={false}
                    className="w-full mt-0.5 px-3 py-2 text-xs font-mono border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })}
                    className="rounded border-slate-300" />
                  <span>เปิดใช้งาน</span>
                </label>
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button onClick={save} disabled={saving}
                    className="h-9 px-4 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                    {saving ? "..." : "บันทึก"}
                  </button>
                  <button onClick={cancelEdit}
                    className="h-9 px-4 text-sm border border-slate-200 rounded hover:bg-slate-50 text-slate-700">ยกเลิก</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Detail */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">{selected.key}</code>
                    <span className={`text-xs px-2 py-0.5 rounded ${CAT_COLOR[selected.category]}`}>{selected.category}</span>
                    <span className="text-xs text-slate-500">{TYPE_LABEL[selected.validator_type]}</span>
                    {selected.is_builtin && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 rounded">built-in</span>}
                    {!selected.active && <span className="text-xs text-red-600 bg-red-50 px-1.5 rounded">ปิดอยู่</span>}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-800">{selected.label}</h2>
                  {selected.description && <p className="text-sm text-slate-500 mt-0.5">{selected.description}</p>}

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Config</p>
                      <pre className="text-xs font-mono bg-slate-50 p-2 rounded overflow-auto max-h-32">{JSON.stringify(selected.config, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Error message</p>
                      <div className="text-sm text-slate-700 bg-amber-50 border border-amber-200 p-2 rounded">{selected.default_message ?? "—"}</div>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                      <button onClick={() => startEdit(selected)}
                        className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700">แก้</button>
                      {!selected.is_builtin && (
                        <button onClick={() => setDeleteTarget(selected)}
                          className="h-8 px-3 text-xs font-medium border border-red-200 text-red-600 rounded hover:bg-red-50">ลบ</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Sandbox */}
                <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-5">
                  <h3 className="text-xs font-semibold text-emerald-900 uppercase tracking-wider mb-2">🧪 ทดสอบกฎนี้</h3>
                  <input value={testValue} onChange={e => setTestValue(e.target.value)}
                    placeholder="ใส่ค่าทดสอบ..."
                    className="w-full h-9 px-3 text-sm border border-slate-200 rounded bg-white" />
                  <div className="mt-2 text-sm">
                    {testResult == null ? (
                      <span className="text-slate-400">รอใส่ค่า...</span>
                    ) : testResult.length === 0 ? (
                      <span className="text-emerald-700 font-medium">✓ ผ่าน</span>
                    ) : (
                      <div className="text-red-700 space-y-0.5">
                        {testResult.map((m, i) => <div key={i}>⚠ {m}</div>)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Usage hint */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                  💡 <strong>วิธีใช้ใน FieldDef:</strong> <code className="bg-white px-1 rounded">validations: [&quot;{selected.key}&quot;]</code>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="ลบ Validation Rule"
        message={`ลบ "${deleteTarget?.label}" ใช่ไหม? (form/field ที่ใช้ rule นี้จะข้ามการตรวจ)`}
        confirmText="ลบ" cancelText="ยกเลิก" variant="danger"
        onConfirm={() => { if (deleteTarget) remove(deleteTarget); }} />
    </PlaygroundShell>
  );
}
