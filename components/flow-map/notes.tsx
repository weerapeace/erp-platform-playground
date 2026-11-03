"use client";

/**
 * แผนผังการทำงาน — โน้ตแปะ (post-it): แปะบนผัง / ติดกล่องหรือเส้น · 4 สี · ลากย้ายได้ · ส่วนตัว ↔ ทั้งทีม
 *   ส่วนตัว = useUserPref "flow_map_notes" (ต่อคน ตามไปทุกเครื่อง) · ทั้งทีม = /api/flow-map/notes (เห็นทุกคน · แก้/ลบได้เฉพาะเจ้าของ)
 * ชนิด/สี/ตัวตรวจ = lib/flow-map-notes.ts
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import {
  FLOW_NOTE_COLORS, FLOW_NOTE_COLOR_ORDER, FLOW_NOTE_MAX, FLOW_NOTE_W, FLOW_NOTE_H, FLOW_NOTE_LIMIT, cleanFlowNote,
  type FlowNote, type FlowNoteData,
} from "@/lib/flow-map-notes";

type Personal = Record<string, FlowNoteData>;
const parsePersonal = (raw: unknown): Personal | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Personal = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) { const d = cleanFlowNote(v); if (d && /^p_/.test(id)) out[id] = d; }
  return out;
};
const newId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const json = async (r: Response) => { const j = await r.json().catch(() => ({})); if (!r.ok || j?.error) throw new Error(j?.error || "บันทึกโน้ตไม่สำเร็จ"); return j; };

/** โน้ตทั้งหมดของคนนี้ (ส่วนตัว) + ของทีม */
export function useFlowNotes() {
  const { user } = useAuth();
  const toast = useToast();
  const [personal, setPersonalPref] = useUserPref<Personal>("flow_map_notes", {}, parsePersonal);
  const latest = useRef<Personal>(personal);
  latest.current = personal;
  const setPersonal = useCallback((fn: (p: Personal) => Personal) => {
    const next = fn(latest.current);
    const ids = Object.keys(next);
    if (ids.length > FLOW_NOTE_LIMIT) ids.sort((a, b) => next[a].at.localeCompare(next[b].at)).slice(0, ids.length - FLOW_NOTE_LIMIT).forEach((id) => delete next[id]);
    latest.current = next;
    setPersonalPref(next);
  }, [setPersonalPref]);
  const [team, setTeam] = useState<FlowNote[]>([]);
  useEffect(() => {
    let off = false;
    apiFetch("/api/flow-map/notes").then((r) => r.json()).then((j) => { if (!off && Array.isArray(j?.data)) setTeam(j.data as FlowNote[]); }).catch(() => { /* ไม่มีโน้ตทีม */ });
    return () => { off = true; };
  }, []);

  const notes: FlowNote[] = [
    ...Object.entries(personal).map(([id, d]) => ({ ...d, id, shared: false, mine: true })),
    ...team,
  ];
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "บันทึกโน้ตไม่สำเร็จ");

  /** สร้างโน้ตใหม่ (ส่วนตัว) แล้วคืน id ไว้เปิดแก้ทันที */
  const add = (d: Omit<FlowNoteData, "author" | "at">): string => {
    const id = newId();
    setPersonal((p) => ({ ...p, [id]: { ...d, author: user?.name ?? null, at: new Date().toISOString() } }));
    return id;
  };
  const update = async (n: FlowNote, patch: Partial<FlowNoteData>) => {
    if (!n.shared) { setPersonal((p) => (p[n.id] ? { ...p, [n.id]: { ...p[n.id], ...patch, at: new Date().toISOString() } } : p)); return; }
    setTeam((ts) => ts.map((x) => (x.id === n.id ? { ...x, ...patch } : x)));
    try {
      const j = await json(await apiFetch("/api/flow-map/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id, ...patch }) }));
      setTeam((ts) => ts.map((x) => (x.id === n.id ? (j.data as FlowNote) : x)));
    } catch (e) { fail(e); }
  };
  const remove = async (n: FlowNote) => {
    if (!n.shared) { setPersonal((p) => { const q = { ...p }; delete q[n.id]; return q; }); return; }
    const before = team;
    setTeam((ts) => ts.filter((x) => x.id !== n.id));
    try { await json(await apiFetch(`/api/flow-map/notes?id=${encodeURIComponent(n.id)}`, { method: "DELETE" })); }
    catch (e) { setTeam(before); fail(e); }
  };
  /** ส่วนตัว ↔ ทั้งทีม (ย้ายที่เก็บ) */
  const toggleShared = async (n: FlowNote) => {
    const data: FlowNoteData = { text: n.text, color: n.color, view: n.view, x: n.x, y: n.y, attach: n.attach, author: n.author ?? user?.name ?? null, at: n.at };
    try {
      if (!n.shared) {
        const j = await json(await apiFetch("/api/flow-map/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
        setTeam((ts) => [...ts, j.data as FlowNote]);
        setPersonal((p) => { const q = { ...p }; delete q[n.id]; return q; });
        toast.success("แชร์โน้ตให้ทั้งทีมเห็นแล้ว");
      } else {
        await json(await apiFetch(`/api/flow-map/notes?id=${encodeURIComponent(n.id)}`, { method: "DELETE" }));
        setTeam((ts) => ts.filter((x) => x.id !== n.id));
        setPersonal((p) => ({ ...p, [newId()]: { ...data, at: new Date().toISOString() } }));
        toast.success("เปลี่ยนเป็นโน้ตส่วนตัวแล้ว");
      }
    } catch (e) { fail(e); }
  };
  return { notes, add, update, remove, toggleShared };
}
export type FlowNotesApi = ReturnType<typeof useFlowNotes>;

/** โน้ต 1 แผ่นบนผัง (วาดใน SVG ด้วย foreignObject → ย่อขยายตามผัง) · ลากที่แถบบนเพื่อย้าย */
export function FlowSticky({ note, api, editing, onEdit, svgWidth }: {
  note: FlowNote; api: FlowNotesApi; editing: boolean; onEdit: (id: string | null) => void; svgWidth: () => number;
}) {
  const t = useT();
  const c = FLOW_NOTE_COLORS[note.color];
  const [pos, setPos] = useState<[number, number]>([note.x, note.y]);
  const [draft, setDraft] = useState(note.text);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null);
  useEffect(() => { setPos([note.x, note.y]); }, [note.x, note.y]);
  useEffect(() => { if (!editing) setDraft(note.text); }, [note.text, editing]);
  const canEdit = note.mine;
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: pos[0], y: pos[1], moved: false };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const k = 680 / Math.max(1, svgWidth());
    const nx = Math.round(d.x + (e.clientX - d.sx) * k), ny = Math.round(d.y + (e.clientY - d.sy) * k);
    if (Math.abs(nx - d.x) + Math.abs(ny - d.y) > 2) d.moved = true;
    setPos([Math.min(680 - FLOW_NOTE_W, Math.max(0, nx)), Math.max(0, ny)]);
  };
  const onUp = () => { const d = drag.current; drag.current = null; if (d?.moved) void api.update(note, { x: pos[0], y: pos[1] }); };
  const save = () => {
    onEdit(null);
    const text = draft.trim();
    if (!text) { void api.remove(note); return; }
    if (text !== note.text) void api.update(note, { text: text.slice(0, FLOW_NOTE_MAX) });
  };
  return (
    <foreignObject x={pos[0]} y={pos[1]} width={FLOW_NOTE_W} height={FLOW_NOTE_H + 18} style={{ overflow: "visible" }}>
      <div onClick={(e) => e.stopPropagation()} className="h-full flex flex-col rounded-[4px_4px_10px_4px] shadow-sm text-[10px] leading-snug select-none"
        style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, transform: "rotate(-1.5deg)" }}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          className={`flex items-center gap-1 px-1.5 pt-1 opacity-75 ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`} style={{ touchAction: "none" }}>
          <span className="truncate flex-1">{note.author ?? t("ฉัน", "Me")} · {note.shared ? t("ทั้งทีม", "Team") : t("ส่วนตัว", "Private")}</span>
          {canEdit && <>
            <button type="button" title={t("เปลี่ยนสี", "Color")} aria-label={t("เปลี่ยนสี", "Color")} onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void api.update(note, { color: FLOW_NOTE_COLOR_ORDER[(FLOW_NOTE_COLOR_ORDER.indexOf(note.color) + 1) % FLOW_NOTE_COLOR_ORDER.length] })}
              className="w-3 h-3 rounded-full border" style={{ background: FLOW_NOTE_COLORS[FLOW_NOTE_COLOR_ORDER[(FLOW_NOTE_COLOR_ORDER.indexOf(note.color) + 1) % 4]].bg, borderColor: c.border }} />
            <button type="button" title={note.shared ? t("เปลี่ยนเป็นส่วนตัว", "Make private") : t("แชร์ให้ทั้งทีม", "Share with team")} onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void api.toggleShared(note)} className="px-0.5 hover:opacity-100"><Icon value={note.shared ? "👥" : "🔒"} /></button>
            <button type="button" title={t("ลบโน้ต", "Delete")} aria-label={t("ลบโน้ต", "Delete")} onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void api.remove(note)} className="px-0.5 hover:opacity-100">✕</button>
          </>}
        </div>
        {editing && canEdit ? (
          <textarea autoFocus value={draft} maxLength={FLOW_NOTE_MAX} onChange={(e) => setDraft(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === "Escape") { setDraft(note.text); onEdit(null); } if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}
            placeholder={t("เขียนโน้ต… (Enter บันทึก)", "Write a note… (Enter to save)")}
            className="flex-1 w-full resize-none bg-transparent px-1.5 pb-1 text-[11px] outline-none" style={{ color: c.text }} />
        ) : (
          <div onClick={() => canEdit && onEdit(note.id)} className={`flex-1 px-1.5 pb-1 text-[11px] whitespace-pre-wrap break-words overflow-hidden ${canEdit ? "cursor-text" : ""}`}>
            {note.text || <span className="opacity-50">{t("แตะเพื่อเขียน…", "Tap to write…")}</span>}
          </div>
        )}
      </div>
    </foreignObject>
  );
}

/** รายการโน้ตในแผงรายละเอียด (โน้ตที่ติดกล่อง/เส้นนี้) + ปุ่มแปะโน้ตที่ส่วนนี้ */
export function FlowNoteList({ notes, onAdd, onEdit }: { notes: FlowNote[]; onAdd: () => void; onEdit: (n: FlowNote) => void }) {
  const t = useT();
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] font-medium text-slate-800"><Icon value="📝" /> {t(`โน้ตที่แปะส่วนนี้ (${notes.length})`, `Notes here (${notes.length})`)}</span>
        <button type="button" onClick={onAdd} className="h-7 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">{t("＋ แปะโน้ต", "＋ Add note")}</button>
      </div>
      {notes.map((n) => {
        const c = FLOW_NOTE_COLORS[n.color];
        return (
          <button key={n.id} type="button" onClick={() => onEdit(n)} className="w-full text-left mt-1.5 px-2.5 py-1.5 rounded-lg text-[12px]"
            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
            <span className="whitespace-pre-wrap break-words">{n.text || t("(ยังไม่ได้เขียน)", "(empty)")}</span>
            <span className="block text-[10px] opacity-70 mt-0.5">{n.author ?? t("ฉัน", "Me")} · {n.shared ? t("ทั้งทีม", "Team") : t("ส่วนตัว", "Private")} · {new Date(n.at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
          </button>
        );
      })}
    </div>
  );
}

export { FLOW_NOTE_W, FLOW_NOTE_H };
