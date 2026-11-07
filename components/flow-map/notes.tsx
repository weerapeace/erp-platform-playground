"use client";

/**
 * แผนผังการทำงาน — โน้ตภายใน (2026-11-07 เปลี่ยนจากโพสต์อิทลอยบนผัง — เจ้าของขอ "เอาแปะโน้ตออก เป็น note ภายใน ไม่โชว์ออกมา")
 *   อยู่ในแผงขวาเท่านั้น: กดกล่อง/เส้น → "โน้ตภายใน" ของส่วนนั้น · ไม่ได้กดอะไร = โน้ตของผังนี้ (ไม่ติดกล่อง) · ไม่วาดอะไรบนผัง
 *   ส่วนตัว = useUserPref "flow_map_notes" (ต่อคน ตามไปทุกเครื่อง) · ทั้งทีม = /api/flow-map/notes (เห็นทุกคน · แก้/ลบได้เฉพาะเจ้าของ · ลงประวัติ)
 *   ชนิด/ตัวตรวจ = lib/flow-map-notes.ts (ช่อง x/y/color ยังเก็บไว้ให้ข้อมูลเดิมอ่านได้ แต่ไม่ใช้แล้ว)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import {
  FLOW_NOTE_MAX, FLOW_NOTE_LIMIT, cleanFlowNote,
  type FlowNote, type FlowNoteAttach, type FlowNoteData,
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
  /** เขียนโน้ตภายในใหม่ — shared = ทั้งทีม (บันทึกผ่าน API) · ไม่ = ส่วนตัว · คืน true ถ้าสำเร็จ */
  const create = async (text: string, attach: FlowNoteAttach, view: string, shared: boolean): Promise<boolean> => {
    const d: FlowNoteData = { text: text.slice(0, FLOW_NOTE_MAX), color: "yellow", view, x: 0, y: 0, attach, author: user?.name ?? null, at: new Date().toISOString() };
    if (!shared) { setPersonal((p) => ({ ...p, [newId()]: d })); return true; }
    try {
      const j = await json(await apiFetch("/api/flow-map/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }));
      setTeam((ts) => [...ts, j.data as FlowNote]);
      return true;
    } catch (e) { fail(e); return false; }
  };
  return { notes, add, create, update, remove, toggleShared };
}
export type FlowNotesApi = ReturnType<typeof useFlowNotes>;

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/** โน้ตภายใน 1 รายการ — ของตัวเอง: แก้ / ส่วนตัว↔ทั้งทีม / ลบ */
function InternalNoteRow({ note, api }: { note: FlowNote; api: FlowNotesApi }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  useEffect(() => { if (!editing) setDraft(note.text); }, [note.text, editing]);
  const save = () => {
    const text = draft.trim();
    setEditing(false);
    if (!text) { setDraft(note.text); return; }   // แก้จนว่าง = ไม่บันทึก (ลบให้กดปุ่มลบ)
    if (text !== note.text) void api.update(note, { text: text.slice(0, FLOW_NOTE_MAX) });
  };
  return (
    <div className="mt-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px]">
      {editing ? (
        <div>
          <textarea autoFocus value={draft} maxLength={FLOW_NOTE_MAX} rows={2} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setDraft(note.text); setEditing(false); } if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}
            className="w-full resize-y rounded-md border border-indigo-200 px-2 py-1 text-[12.5px] outline-none focus:border-indigo-400" />
          <div className="mt-1 flex justify-end gap-2 text-[11.5px]">
            <button type="button" onClick={() => { setDraft(note.text); setEditing(false); }} className="text-slate-500 hover:text-slate-700">{t("ยกเลิก", "Cancel")}</button>
            <button type="button" onClick={save} className="font-medium text-indigo-700 hover:text-indigo-900">{t("บันทึก", "Save")}</button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words text-slate-800">{note.text || <span className="text-slate-400">{t("(ยังไม่ได้เขียน)", "(empty)")}</span>}</div>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className={`rounded-full px-1.5 py-px ${note.shared ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{note.shared ? t("ทั้งทีม", "Team") : t("ส่วนตัว", "Private")}</span>
        <span className="truncate">{note.author ?? t("ฉัน", "Me")} · {fmtDay(note.at)}</span>
        {note.mine && !editing && (
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-slate-500 hover:text-indigo-700">{t("แก้", "Edit")}</button>
            <button type="button" onClick={() => void api.toggleShared(note)} title={note.shared ? t("เปลี่ยนเป็นส่วนตัว (เห็นคนเดียว)", "Make private") : t("แชร์ให้ทั้งทีมเห็น", "Share with team")}
              className="text-slate-500 hover:text-indigo-700">{note.shared ? t("ทำเป็นส่วนตัว", "Make private") : t("แชร์ทีม", "Share")}</button>
            <button type="button" onClick={() => void api.remove(note)} className="text-red-500 hover:text-red-700">{t("ลบ", "Delete")}</button>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * "โน้ตภายใน" ในแผงขวา — โน้ตของกล่อง/เส้นที่เลือก (attach) หรือของผังนี้ (attach = null) · ไม่โชว์บนผัง
 *   เขียนใหม่ได้ทันที: เลือก ส่วนตัว (เห็นคนเดียว) / ทั้งทีม · Enter = บันทึก (Shift+Enter ขึ้นบรรทัดใหม่)
 */
export function FlowInternalNotes({ notes, api, attach, view, title }: {
  notes: FlowNote[]; api: FlowNotesApi; attach: FlowNoteAttach; view: string; title?: string;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = async () => {
    const v = text.trim();
    if (!v) { setErr(t("เขียนโน้ตก่อนบันทึก", "Write something first")); return; }
    setBusy(true);
    const ok = await api.create(v, attach, view, shared);
    setBusy(false);
    if (ok) { setText(""); setErr(""); }
  };
  const seg = (on: boolean) => `h-7 px-2.5 text-[11.5px] rounded-md border ${on ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
        <Icon value="i:lock" size={14} />{title ?? t("โน้ตภายใน", "Internal notes")} ({notes.length})
        <span className="text-[11px] font-normal text-slate-400">{t("ไม่โชว์บนผัง", "not shown on the map")}</span>
      </div>
      {notes.map((n) => <InternalNoteRow key={n.id} note={n} api={api} />)}
      <div className="mt-2">
        <textarea value={text} maxLength={FLOW_NOTE_MAX} rows={2} disabled={busy}
          onChange={(e) => { setText(e.target.value); setErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void add(); } }}
          placeholder={t("เขียนโน้ตภายใน… (Enter บันทึก)", "Write an internal note… (Enter to save)")}
          className="w-full resize-y rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-indigo-300 disabled:bg-slate-50" />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setShared(false)} aria-pressed={!shared} className={seg(!shared)}>{t("ส่วนตัว (เห็นคนเดียว)", "Private")}</button>
          <button type="button" onClick={() => setShared(true)} aria-pressed={shared} className={seg(shared)}>{t("ทั้งทีม", "Team")}</button>
          <button type="button" onClick={() => void add()} disabled={busy}
            className="ml-auto h-7 px-3 text-[12px] font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
        </div>
        {err && <div className="mt-1 text-[11.5px] text-red-600">{err}</div>}
      </div>
    </div>
  );
}

