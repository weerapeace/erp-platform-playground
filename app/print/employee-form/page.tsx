"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildEmployeeFormHtml, type EmployeeFormLang, type SkillOption } from "@/lib/employee-form-print";

const LANGS: { key: EmployeeFormLang; label: string }[] = [
  { key: "th", label: "ไทย" },
  { key: "en", label: "English" },
  { key: "my", label: "พม่า / မြန်မာ" },
];

type Skill = { id: string; th: string; en: string; my: string; sort: number };

export default function EmployeeFormPrintPage() {
  const router = useRouter();
  const [lang, setLang] = useState<EmployeeFormLang>("th");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadSkills = useCallback(async () => {
    try {
      const json = await apiFetch("/api/lookups?type=employee_skill&limit=200").then((r) => r.json());
      const rows = (json.data ?? []) as Array<{ id: string; name: string; sort_order?: number; metadata?: { en?: string; my?: string } }>;
      setSkills(rows.map((r) => ({ id: r.id, th: r.name, en: r.metadata?.en ?? "", my: r.metadata?.my ?? "", sort: r.sort_order ?? 0 })));
    } catch {
      setSkills([]);
    }
  }, []);
  useEffect(() => { void loadSkills(); }, [loadSkills]);

  const skillOpts: SkillOption[] = useMemo(() => skills.map((s) => ({ th: s.th, en: s.en, my: s.my })), [skills]);
  const html = useMemo(() => buildEmployeeFormHtml(lang, skillOpts), [lang, skillOpts]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="mx-auto max-w-[860px] px-4 pb-10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">ภาษาฟอร์ม:</span>
          {LANGS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLang(l.key)}
              className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                lang === l.key
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={() => setSettingsOpen(true)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            title="เพิ่ม/แก้/ลบ รายการทักษะที่ติ๊กในฟอร์ม (3 ภาษา)"
          >
            ⚙️ ตั้งค่าทักษะ
          </button>
          <span className="ml-auto text-xs text-slate-400">กดปุ่ม “พิมพ์” ด้านบนเพื่อพิมพ์ หรือบันทึกเป็น PDF</span>
        </div>
        <PrintFrame html={html} />
      </div>
      {settingsOpen && (
        <SkillSettings
          skills={skills}
          onClose={() => setSettingsOpen(false)}
          onChanged={loadSkills}
        />
      )}
    </div>
  );
}

function SkillSettings({ skills, onClose, onChanged }: { skills: Skill[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<Skill[]>(skills);
  const [draft, setDraft] = useState({ th: "", en: "", my: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setRows(skills); }, [skills]);

  const setField = (id: string, key: "th" | "en" | "my", val: string) =>
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, [key]: val } : r)));

  async function saveRow(r: Skill) {
    if (!r.th.trim()) { setMsg("กรุณากรอกชื่อทักษะ (ไทย)"); return; }
    setBusy(true); setMsg(null);
    try {
      await apiFetch(`/api/lookups/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: r.th.trim(), metadata: { en: r.en.trim(), my: r.my.trim() } }),
      }).then((x) => x.json());
      setMsg("บันทึกแล้ว");
      await onChanged();
    } catch { setMsg("บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  async function delRow(r: Skill) {
    if (!confirm(`ลบทักษะ "${r.th}" ?`)) return;
    setBusy(true); setMsg(null);
    try {
      await apiFetch(`/api/lookups/${encodeURIComponent(r.id)}`, { method: "DELETE" }).then((x) => x.json());
      await onChanged();
    } catch { setMsg("ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  async function addRow() {
    if (!draft.th.trim()) { setMsg("กรุณากรอกชื่อทักษะ (ไทย)"); return; }
    setBusy(true); setMsg(null);
    try {
      await apiFetch("/api/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookup_type: "employee_skill", name: draft.th.trim(), metadata: { en: draft.en.trim(), my: draft.my.trim() }, sort_order: rows.length + 1 }),
      }).then((x) => x.json());
      setDraft({ th: "", en: "", my: "" });
      await onChanged();
    } catch { setMsg("เพิ่มไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="font-semibold text-slate-800">⚙️ ตั้งค่ารายการทักษะ <span className="text-xs font-normal text-slate-400">(3 ภาษา — ใช้เป็น checkbox ในฟอร์ม)</span></div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <div className="p-5">
          <div className="mb-1 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-[11px] font-semibold text-slate-400">
            <span>ไทย</span><span>English</span><span>พม่า / မြန်မာ</span><span></span>
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <input value={r.th} onChange={(e) => setField(r.id, "th", e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                <input value={r.en} onChange={(e) => setField(r.id, "en", e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                <input value={r.my} onChange={(e) => setField(r.id, "my", e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                <div className="flex gap-1">
                  <button onClick={() => saveRow(r)} disabled={busy} className="h-9 rounded-lg border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40" title="บันทึก">💾</button>
                  <button onClick={() => delRow(r)} disabled={busy} className="h-9 rounded-lg border border-red-200 px-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40" title="ลบ">🗑</button>
                </div>
              </div>
            ))}
            {!rows.length && <div className="py-4 text-center text-sm text-slate-400">ยังไม่มีทักษะ — เพิ่มด้านล่าง</div>}
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">＋ เพิ่มทักษะใหม่</div>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input value={draft.th} onChange={(e) => setDraft((d) => ({ ...d, th: e.target.value }))} placeholder="ไทย (จำเป็น)" className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
              <input value={draft.en} onChange={(e) => setDraft((d) => ({ ...d, en: e.target.value }))} placeholder="English" className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
              <input value={draft.my} onChange={(e) => setDraft((d) => ({ ...d, my: e.target.value }))} placeholder="พม่า" className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
              <button onClick={addRow} disabled={busy} className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">เพิ่ม</button>
            </div>
          </div>

          {msg && <div className="mt-3 text-sm text-slate-500">{msg}</div>}
          <div className="mt-4 text-right">
            <button onClick={onClose} className="h-9 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">เสร็จสิ้น</button>
          </div>
        </div>
      </div>
    </div>
  );
}
