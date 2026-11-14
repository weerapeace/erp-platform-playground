"use client";
/**
 * 📚 Design Library — แผง Prompt ในหน้าสูตร (รอบ 6)
 * ทุก prompt มีสวิตช์ (ค่าเริ่ม = ตั้งของทีมใน ⚙️ ตัวเลือก → Prompt · ปรับเฉพาะสูตรนี้ได้) · ปิด = ไม่พิมพ์ในใบสรุป PDF
 * แก้ข้อความได้ (ป้าย "แก้เองแล้ว" + กลับเป็นของระบบ · สูตรเปลี่ยนหลังแก้ = เตือน "อาจไม่ตรงสูตร") · เพิ่ม prompt ของสูตรเอง ใส่คำแทน {ขนาด} ฯลฯ ได้
 * ตัวคิด = lib/design-library resolvePrompts (pure + เทสต์)
 */
import { useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { MAX_CUSTOM_PROMPTS, PROMPT_VARS, resolvePrompts, type Choice, type RecipePrompts, type ResolvedPrompt, type Spec } from "@/lib/design-library";
import { newId } from "./shared";

const SOURCE_LABEL: Record<ResolvedPrompt["source"], string> = { system: "ระบบ", team: "แม่แบบทีม", recipe: "ของสูตรนี้" };

export function PromptsPanel({ template, spec, choices, dirty, colorway, readOnly, onChange }: {
  template: { name: string; category?: string | null }; spec: Spec; choices: Choice[]; dirty: boolean; colorway: string | null;
  readOnly: boolean; onChange: (p: RecipePrompts) => void;
}) {
  const toast = useToast();
  const P = spec.prompts;
  const list = useMemo(() => resolvePrompts(template, spec, choices), [template, spec, choices]);
  const [editing, setEditing] = useState<string | null>(null);   // key ที่กำลังแก้ ("new" = เพิ่มใหม่)
  const [draft, setDraft] = useState({ title: "", text: "" });
  const [del, setDel] = useState<ResolvedPrompt | null>(null);
  const [showVars, setShowVars] = useState(false);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("คัดลอก prompt แล้ว"); } catch { toast.error("คัดลอกไม่สำเร็จ — ลองเลือกข้อความแล้วกด Ctrl+C"); }
  };
  const ownId = (key: string) => key.slice(4);
  const startEdit = (p: ResolvedPrompt) => {
    const raw = p.source === "recipe" ? P.custom.find((c) => c.id === ownId(p.key))?.text ?? p.text : p.text;
    setEditing(p.key); setDraft({ title: p.title, text: raw });
  };
  const saveEdit = (p: ResolvedPrompt | null) => {
    const text = draft.text.trim();
    if (!text) { toast.error("ใส่ข้อความ prompt ก่อน"); return; }
    if (!p) {
      if (P.custom.length >= MAX_CUSTOM_PROMPTS) { toast.error(`เพิ่มได้สูงสุด ${MAX_CUSTOM_PROMPTS} prompt ต่อสูตร`); return; }
      onChange({ ...P, custom: [...P.custom, { id: newId(), title: draft.title.trim() || "Prompt ของสูตร", text }] });
    } else if (p.source === "recipe") {
      onChange({ ...P, custom: P.custom.map((c) => (c.id === ownId(p.key) ? { ...c, title: draft.title.trim() || c.title, text } : c)) });
    } else if (text === p.generated) {
      const { [p.key]: _gone, ...rest } = P.edits; void _gone; onChange({ ...P, edits: rest });
    } else {
      onChange({ ...P, edits: { ...P.edits, [p.key]: { text, base: p.generated } } });
    }
    setEditing(null);
  };
  const reset = (p: ResolvedPrompt) => { const { [p.key]: _gone, ...rest } = P.edits; void _gone; onChange({ ...P, edits: rest }); };
  const toggle = (p: ResolvedPrompt) => onChange({ ...P, on: { ...P.on, [p.key]: !p.on } });
  const remove = (p: ResolvedPrompt) => {
    const { [p.key]: _off, ...on } = P.on; void _off;
    onChange({ ...P, on, custom: P.custom.filter((c) => c.id !== ownId(p.key)) });
    setDel(null);
  };

  const editor = (p: ResolvedPrompt | null) => (
    <div className="mt-2 space-y-2">
      {(!p || p.source === "recipe") && <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="ชื่อ prompt เช่น ถ่ายบนโต๊ะไม้" maxLength={80} className="w-full h-8 px-2 border border-slate-200 rounded-md text-[13px]" />}
      <textarea rows={5} value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} maxLength={4000}
        placeholder="เช่น Lifestyle photo of the {กระเป๋า} on a wooden table, soft daylight."
        className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-[12px] font-mono" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowVars((v) => !v)} className="text-[12px] text-indigo-700 hover:underline">{showVars ? "ซ่อนคำแทน" : "คำแทนที่ใช้ได้ {…}"}</button>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => setEditing(null)} className="h-8 px-3 text-[12px] rounded-md border border-slate-200 bg-white">ยกเลิก</button>
          <button type="button" onClick={() => saveEdit(p)} className="h-8 px-3 text-[12px] rounded-md bg-indigo-600 text-white">ใช้ข้อความนี้</button>
        </span>
      </div>
      {showVars && (
        <div className="flex flex-wrap gap-1">{PROMPT_VARS.map((v) => (
          <button key={v.key} type="button" title={v.label} onClick={() => setDraft((d) => ({ ...d, text: `${d.text}{${v.key}}` }))}
            className="h-7 px-2 text-[11.5px] rounded-full border border-slate-200 bg-white hover:bg-slate-50 font-mono">{`{${v.key}}`}</button>
        ))}</div>
      )}
      {p && p.source !== "recipe" && <p className="text-[11px] text-slate-400">แก้แล้วข้อความนี้จะไม่เปลี่ยนตามสูตรอีก — ถ้าแก้สูตรทีหลัง ระบบจะเตือนให้ตรวจ</p>}
    </div>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 mt-4">
      <div className="text-[14px] font-medium text-slate-800 mb-1 flex items-center gap-2"><Icon value="i:sparkles" />Prompt สำหรับ GPT{colorway && <span className="text-indigo-700 font-normal">· {colorway}</span>}
        <span className="ml-auto text-[12px] font-normal text-slate-500">เปิดอยู่ {list.filter((p) => p.on).length}/{list.length} · ใบสรุป PDF พิมพ์เฉพาะที่เปิด</span></div>
      <p className="text-[12px] text-slate-500 mb-2">แนบรูปจากใบสรุป PDF (เส้นชี้ + รูปชิ้นส่วน) ไปพร้อม prompt · เลข [ref N] = เลขจุดบนรูป{dirty ? " · ยังไม่ได้บันทึก — prompt นี้ตามที่แก้อยู่ตอนนี้" : ""}</p>
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.key} className={`rounded-lg border p-2 ${p.on ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50/60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" role="switch" aria-checked={p.on} disabled={readOnly} onClick={() => toggle(p)} title={p.on ? "ปิด prompt นี้" : "เปิด prompt นี้"}
                className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${p.on ? "bg-indigo-600" : "bg-slate-300"} disabled:opacity-50`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${p.on ? "left-[18px]" : "left-0.5"}`} />
              </button>
              <span className={`text-[13px] font-medium ${p.on ? "text-slate-700" : "text-slate-400"}`}>{p.title}</span>
              <span className="text-[11px] text-slate-400">{SOURCE_LABEL[p.source]}</span>
              {p.edited && <span className={`text-[11px] px-1.5 py-0.5 rounded ${p.stale ? "bg-amber-100 text-amber-800" : "bg-indigo-50 text-indigo-700"}`}>{p.stale ? "แก้เองแล้ว · สูตรเปลี่ยนหลังแก้ ตรวจอีกครั้ง" : "แก้เองแล้ว"}</span>}
              <span className="ml-auto flex gap-1">
                {p.edited && !readOnly && <button type="button" onClick={() => reset(p)} title="กลับเป็นข้อความของระบบ (ตามสูตรล่าสุด)" className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center"><Icon value="i:arrow-back-up" /></button>}
                {!readOnly && <button type="button" onClick={() => startEdit(p)} title="แก้ข้อความ" className="h-7 w-7 rounded-md border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center"><Icon value="i:pencil" /></button>}
                {p.source === "recipe" && !readOnly && <button type="button" onClick={() => setDel(p)} title="ลบ prompt นี้" className="h-7 w-7 rounded-md border border-slate-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"><Icon value="i:trash" /></button>}
                <button type="button" onClick={() => void copy(p.text)} className="h-7 px-2.5 text-[12px] rounded-md border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1"><Icon value="i:copy" />คัดลอก</button>
              </span>
            </div>
            {editing === p.key ? editor(p) : p.on && (
              <>
                {p.hint && <div className="text-[11.5px] text-indigo-700 mt-1">{p.hint}</div>}
                <div className="text-[12px] font-mono text-slate-600 whitespace-pre-wrap break-words mt-1">{p.text}</div>
              </>
            )}
          </div>
        ))}
        {!readOnly && (editing === "new"
          ? <div className="rounded-lg border border-indigo-200 p-2"><div className="text-[13px] font-medium text-slate-700">เพิ่ม prompt ของสูตรนี้</div>{editor(null)}</div>
          : <button type="button" onClick={() => { setEditing("new"); setDraft({ title: "", text: "" }); }}
              className="h-9 px-4 text-sm rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-1.5"><Icon value="i:plus" />เพิ่ม prompt</button>)}
        <p className="text-[11px] text-slate-400">แม่แบบ prompt ที่ใช้ทุกสูตร + ค่าเปิด/ปิดตั้งต้น ตั้งได้ที่ ⚙️ ตัวเลือก → Prompt (ผู้ดูแล)</p>
      </div>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove(del)} variant="danger" confirmText="ลบ"
        title={`ลบ prompt “${del?.title ?? ""}”?`} message="ลบออกจากสูตรนี้ (กดบันทึกสูตรถึงจะมีผล)" />
    </section>
  );
}
