"use client";

/**
 * โน้ตส่วนตัว (My Note) — ของกลาง: จดโน้ตสั้น ๆ ติดกับรายการไหนก็ได้ "เห็นคนเดียว"
 * --------------------------------------------------------------------------
 * เก็บ: user_ui_prefs key `my_notes:<scope>` = { [id]: { t, at } } ผ่าน useUserPref
 *   ต่อคน · ตามไปทุกเครื่อง · คนอื่น (รวมแอดมิน) ไม่เห็นในหน้าจอ · ไม่ใช่ข้อมูลธุรกิจ → ไม่ลง audit log
 *   บันทึกแบบ "อ่านค่าล่าสุดจากเซิร์ฟเวอร์ก่อนแล้วค่อยรวม" → เปิดสองเครื่องพร้อมกันโน้ตไม่ทับกัน
 *   ข้อความ ≤ MY_NOTE_MAX ตัวอักษร · เก็บไม่เกิน MY_NOTE_LIMIT รายการ (เกิน = ทิ้งที่แก้นานสุด)
 *
 * ใช้:
 *   const myNotes = useMyNotes("mo");                                    // scope = ประเภทเอกสาร
 *   <MyNoteCell note={myNotes.notes[moNo]} onSave={(t) => myNotes.setNote(moNo, t)} />
 *   myNotes.text(moNo)                                                   // ข้อความ (ใช้ค้นหา/เรียง)
 *
 * ที่ใช้: บอร์ดจ่ายงาน — คอลัมน์ "โน้ตของฉัน" ทั้ง 3 แท็บ (ผูกเลขใบสั่งผลิต · โน้ตเดียวกันขึ้นทุกแท็บ)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";

export type MyNote = { t: string; at: string };
export type MyNotes = Record<string, MyNote>;
export const MY_NOTE_MAX = 500;
export const MY_NOTE_LIMIT = 2000;

const parseNotes = (v: unknown): MyNotes | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: MyNotes = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const o = n as { t?: unknown; at?: unknown } | null;
    if (o && typeof o.t === "string" && o.t.trim()) out[k] = { t: o.t.slice(0, MY_NOTE_MAX), at: typeof o.at === "string" ? o.at : "" };
  }
  return out;
};

export function useMyNotes(scope: string) {
  const key = `my_notes:${scope}`;
  const [saved, setNotes] = useUserPref<MyNotes>(key, {}, parseNotes);
  // ระหว่างรออ่านค่าล่าสุดจากเซิร์ฟเวอร์ → โชว์ค่าที่เพิ่งพิมพ์ทันที (null = ลบ)
  const [pending, setPending] = useState<Record<string, string | null>>({});
  const notes = useMemo(() => {
    const ids = Object.keys(pending);
    if (!ids.length) return saved;
    const out = { ...saved };
    for (const id of ids) { const t = pending[id]; if (t) out[id] = { t, at: new Date().toISOString() }; else delete out[id]; }
    return out;
  }, [saved, pending]);
  const latest = useRef(saved);
  latest.current = saved;
  const setNote = useCallback(async (id: string, text: string) => {
    const t = text.trim().slice(0, MY_NOTE_MAX);
    setPending((p) => ({ ...p, [id]: t || null }));
    // ค่าล่าสุดจากเซิร์ฟเวอร์ (อีกเครื่องอาจเพิ่งจด) → รวมกับของในหน้า แล้วแก้เฉพาะรายการนี้
    let base = latest.current;
    try {
      const r = await apiFetch(`/api/user-prefs?key=${encodeURIComponent(key)}`);
      if (r.ok) {
        const srv = parseNotes(((await r.json())?.value as { v?: unknown } | undefined)?.v);
        // รวมรายการต่อรายการ — ของใครแก้ทีหลังชนะ
        if (srv) { base = { ...srv }; for (const [k, n] of Object.entries(latest.current)) if (!base[k] || n.at > base[k].at) base[k] = n; }
      }
    } catch { /* ใช้ของในหน้า */ }
    const next = { ...base };
    if (t) next[id] = { t, at: new Date().toISOString() }; else delete next[id];
    const keys = Object.keys(next);
    if (keys.length > MY_NOTE_LIMIT) keys.sort((a, b) => next[a].at.localeCompare(next[b].at)).slice(0, keys.length - MY_NOTE_LIMIT).forEach((k) => delete next[k]);
    setNotes(next);
    setPending((p) => { const n = { ...p }; delete n[id]; return n; });
  }, [key, setNotes]);
  const text = useCallback((id: string | null | undefined) => (id ? notes[id]?.t ?? "" : ""), [notes]);
  return { notes, setNote, text };
}

const noteWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

/** ช่องโน้ตในตาราง: มีโน้ต = กระดาษโน้ตสีเหลือง (2 บรรทัด ชี้ดูเต็ม) · ว่าง = "＋ โน้ต" จาง ๆ · กด = แก้ (Enter บันทึก · Shift+Enter ขึ้นบรรทัด · Esc ยกเลิก)
 *  กด/พิมพ์ในช่องไม่ไหลไปเป็นการกดแถว */
export function MyNoteCell({ note, onSave, disabled = false, placeholder = "＋ โน้ต" }: {
  note: MyNote | undefined;
  onSave: (text: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}) {
  const cur = note?.t ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cur);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setDraft(cur); }, [cur, editing]);
  useEffect(() => { if (editing) { const el = ref.current; el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); } }, [editing]);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const commit = () => { setEditing(false); if (draft.trim() !== cur) void onSave(draft); };

  if (editing) {
    return (
      <textarea ref={ref} value={draft} maxLength={MY_NOTE_MAX} rows={3}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onClick={stop} onDoubleClick={stop} onPointerDown={stop}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.stopPropagation(); setDraft(cur); setEditing(false); }
        }}
        placeholder="จดอะไรก็ได้ — เห็นคนเดียว"
        className="block w-full resize-y rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] leading-snug text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-400" />
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); setEditing(true); }} onDoubleClick={stop}
      title={note ? `${note.t}\n\n(โน้ตส่วนตัว — เห็นคนเดียว · กดเพื่อแก้)` : "จดโน้ตส่วนตัว — เห็นคนเดียว"}
      className={`block w-full min-w-0 rounded-md px-1.5 py-1 text-left text-[12px] leading-snug disabled:cursor-default ${note ? "bg-amber-50 text-slate-700 hover:bg-amber-100" : "text-slate-300 hover:bg-slate-50 hover:text-slate-500"}`}>
      {note ? <>
        <span className="line-clamp-2 whitespace-pre-line break-words">{note.t}</span>
        {note.at && <span className="mt-0.5 block text-[10px] text-slate-400">{noteWhen(note.at)}</span>}
      </> : placeholder}
    </button>
  );
}
