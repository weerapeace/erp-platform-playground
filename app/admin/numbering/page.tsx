"use client";

import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { NumberingRule, NumberingResponse } from "@/app/api/numbering/route";

// ---- Token helper ----

const TOKEN_DOCS: { token: string; desc: string }[] = [
  { token: "{YYYY}",  desc: "ปี 4 หลัก เช่น 2026" },
  { token: "{YY}",    desc: "ปี 2 หลัก เช่น 26" },
  { token: "{MM}",    desc: "เดือน 2 หลัก เช่น 05" },
  { token: "{DD}",    desc: "วัน 2 หลัก เช่น 30" },
  { token: "{BRANCH}",desc: "รหัสสาขา (ใส่จาก code ที่เรียก)" },
  { token: "{00000}", desc: "เลขรัน — จำนวน 0 = ความยาว pad" },
];

const RESET_LABEL: Record<string, string> = {
  never:   "ไม่รีเซ็ต",
  yearly:  "รีเซ็ตทุกปี",
  monthly: "รีเซ็ตทุกเดือน",
};
const RESET_COLOR: Record<string, string> = {
  never:   "bg-slate-100 text-slate-600",
  yearly:  "bg-blue-50 text-blue-700",
  monthly: "bg-purple-50 text-purple-700",
};

export default function NumberingAdminPage() {
  const canView = usePermission("numbering.view");
  const canEdit = usePermission("admin.numbering");

  const [rules,   setRules]   = useState<NumberingRule[]>([]);
  const [preview, setPreview] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [draft,   setDraft]   = useState<Record<string, NumberingRule>>({});
  const [saving,  setSaving]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/numbering");
      const json: NumberingResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setRules(json.data);
      setPreview(json.preview);
      const d: Record<string, NumberingRule> = {};
      json.data.forEach(r => { d[r.key] = { ...r }; });
      setDraft(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดไม่ได้");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const updateDraft = (key: string, patch: Partial<NumberingRule>) => {
    setDraft(p => ({ ...p, [key]: { ...p[key], ...patch } }));
  };

  const isDirty = (key: string) => {
    const o = rules.find(r => r.key === key); const d = draft[key];
    if (!o || !d) return false;
    return o.label !== d.label || o.pattern !== d.pattern ||
           o.reset_policy !== d.reset_policy || o.active !== d.active ||
           (o.notes ?? "") !== (d.notes ?? "");
  };

  // local preview แบบไม่ต้องเรียก API (สำหรับเห็นทันทีตอนพิมพ์)
  const localPreview = (pattern: string, reset: string, current: number): string => {
    const now = new Date();
    let next = current + 1;
    // ถ้า reset policy → assume period match (preview แบบลอย ๆ)
    if (reset !== "never") next = current + 1;
    let r = pattern;
    r = r.replace(/\{YYYY\}/g, String(now.getFullYear()));
    r = r.replace(/\{YY\}/g,   String(now.getFullYear()).slice(2));
    r = r.replace(/\{MM\}/g,   String(now.getMonth()+1).padStart(2,"0"));
    r = r.replace(/\{DD\}/g,   String(now.getDate()).padStart(2,"0"));
    r = r.replace(/\{BRANCH\}/g, "");
    const m = r.match(/\{0+\}/);
    if (m) r = r.replace(m[0], String(next).padStart(m[0].length - 2, "0"));
    return r;
  };

  const save = async (key: string) => {
    if (!canEdit) return;
    setSaving(key); setError(null);
    try {
      const d = draft[key];
      const res = await apiFetch("/api/numbering", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: d.key, label: d.label, pattern: d.pattern,
          reset_policy: d.reset_policy, active: d.active, notes: d.notes,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(null); }
  };

  return (
    <PlaygroundShell>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">เลขที่เอกสาร (Numbering)</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              จัดการรูปแบบเลขที่เอกสารกลาง — ทุกโมดูล (PR / PO / Invoice / QC) ใช้ service เดียวกัน
            </p>
          </div>
          {savedAt && <span className="text-xs text-emerald-600">✓ บันทึกแล้วเมื่อ {savedAt}</span>}
        </div>

        {/* Token reference */}
        <details className="mb-6 bg-blue-50 rounded-lg border border-blue-200">
          <summary className="px-4 py-2.5 cursor-pointer text-sm font-medium text-blue-800">
            🔤 ตัวแทน (token) ที่ใช้ได้ใน pattern
          </summary>
          <div className="px-4 pb-3 pt-1 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {TOKEN_DOCS.map(t => (
              <div key={t.token} className="flex gap-2">
                <code className="bg-white px-1.5 py-0.5 rounded text-blue-700 font-mono whitespace-nowrap">{t.token}</code>
                <span className="text-slate-600">{t.desc}</span>
              </div>
            ))}
          </div>
        </details>

        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {loading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-32 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {rules.map(r => {
              const d = draft[r.key] ?? r;
              const dirty = isDirty(r.key);
              const livePreview = localPreview(d.pattern, d.reset_policy, d.current_value);
              const savedPreview = preview[r.key];

              return (
                <div key={r.key} className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{r.key}</code>
                        <span className={`text-xs px-2 py-0.5 rounded ${RESET_COLOR[d.reset_policy]}`}>{RESET_LABEL[d.reset_policy]}</span>
                        {!d.active && <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">ปิดอยู่</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        เลขปัจจุบัน: <span className="font-semibold text-slate-600">{r.current_value}</span>
                        {r.last_reset_period && <> · งวด: {r.last_reset_period}</>}
                      </div>
                    </div>
                    {dirty && canEdit && (
                      <button onClick={() => save(r.key)} disabled={saving === r.key}
                        className="h-8 px-4 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {saving === r.key ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <label className="block col-span-2">
                      <span className="text-xs font-medium text-slate-600">ชื่อแสดงผล</span>
                      <input value={d.label} onChange={e => updateDraft(r.key, { label: e.target.value })} disabled={!canEdit}
                        className="w-full h-9 mt-0.5 px-2.5 text-sm border border-slate-200 rounded-md disabled:bg-slate-50" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">การรีเซ็ต</span>
                      <select value={d.reset_policy} onChange={e => updateDraft(r.key, { reset_policy: e.target.value as NumberingRule["reset_policy"] })} disabled={!canEdit}
                        className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50">
                        <option value="never">ไม่รีเซ็ต</option>
                        <option value="yearly">รีเซ็ตทุกปี</option>
                        <option value="monthly">รีเซ็ตทุกเดือน</option>
                      </select>
                    </label>
                  </div>

                  <label className="block mb-3">
                    <span className="text-xs font-medium text-slate-600">Pattern</span>
                    <input value={d.pattern} onChange={e => updateDraft(r.key, { pattern: e.target.value })} disabled={!canEdit}
                      placeholder="PR-{YYYY}-{00000}"
                      className="w-full h-9 mt-0.5 px-2.5 text-sm font-mono border border-slate-200 rounded-md disabled:bg-slate-50" />
                  </label>

                  <label className="block mb-3">
                    <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
                    <input value={d.notes ?? ""} onChange={e => updateDraft(r.key, { notes: e.target.value })} disabled={!canEdit}
                      className="w-full h-9 mt-0.5 px-2.5 text-sm border border-slate-200 rounded-md disabled:bg-slate-50" />
                  </label>

                  <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={d.active} onChange={e => updateDraft(r.key, { active: e.target.checked })}
                        disabled={!canEdit} className="rounded border-slate-300" />
                      <span className="text-slate-600">ใช้งานอยู่</span>
                    </label>
                    <div className="text-xs">
                      <span className="text-slate-400">ตัวอย่างเลขถัดไป:</span>
                      <code className="ml-2 font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-emerald-700">
                        {dirty ? livePreview : (savedPreview ?? livePreview)}
                      </code>
                      {dirty && <span className="ml-2 text-amber-600">(ยังไม่บันทึก)</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}
