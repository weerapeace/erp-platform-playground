"use client";

/**
 * ร่าง "งานถึงไหนแล้ว" — ช่องในตารางบอร์ดจ่ายงาน + ป๊อปเช็กลิสต์ 5 ขั้น (เจ้าของขอ 2026-11-12)
 *   "ตรงโน้ตอยากให้มี check ได้ว่า update ถึงไหนแล้ว จะได้ไป update จริง · ถ้า check อันไหน มีให้ใส่ข้อมูลนั้นด้วย · อยากให้ปุ่ม update ดึงไปได้ด้วย"
 *   ทั้งทีมเห็น (1 ใบ = 1 ร่าง · เห็นว่าใครจด เมื่อไหร่) · ร่างไม่แตะตัวเลขจริง — บันทึกจริงที่ป๊อปอัปเดตงาน (ดึงร่างไปกรอกให้)
 * ของกลางที่ใช้: ERPModal · ConfirmDialog · CrewPick · กติกา ./update-note · API /api/mo/update-notes
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { isHireDesk } from "@/lib/work-entry-rules";
import { CrewPick, type CrewPerson } from "./crew-pick";
import { UN_LABEL, UN_ORDER, unOn, unSummary, unTick, type UnKey, type UnSteps, type UpdateNote } from "./update-note";

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** ร่างของทุกใบ (โหลดครั้งเดียว + หลังจด/ลบ/อัปเดตจริง) */
export function useUpdateNotes(enabled: boolean) {
  const toast = useToast();
  const [notes, setNotes] = useState<Record<string, UpdateNote>>({});
  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/mo/update-notes"); const j = await r.json();
      if (r.ok && Array.isArray(j.data)) setNotes(Object.fromEntries((j.data as UpdateNote[]).map((n) => [n.mo_no, n])));
    } catch { /* ช่องร่างไม่ขึ้น ใช้บอร์ดต่อได้ */ }
  }, []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  const save = async (moNo: string, moId: string | null, steps: UnSteps, note: string): Promise<boolean> => {
    try {
      const r = await apiFetch("/api/mo/update-notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mo_no: moNo, mo_id: moId, steps, note }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "บันทึกร่างไม่สำเร็จ");
      setNotes((s) => ({ ...s, [moNo]: j.data as UpdateNote })); toast.success("จดร่างแล้ว — ยังไม่ได้อัปเดตจริง"); return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกร่างไม่สำเร็จ"); return false; }
  };
  const remove = async (moNo: string): Promise<boolean> => {
    try {
      const r = await apiFetch(`/api/mo/update-notes?mo_no=${encodeURIComponent(moNo)}`, { method: "DELETE" });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "ลบร่างไม่สำเร็จ");
      setNotes((s) => { const n = { ...s }; delete n[moNo]; return n; }); toast.success("ลบร่างแล้ว"); return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบร่างไม่สำเร็จ"); return false; }
  };
  /** บันทึกจริงสำเร็จ → ร่างเป็น "อัปเดตแล้ว" (ใบที่ไม่มีร่าง/อัปเดตแล้ว = ไม่ทำอะไร) */
  const markApplied = async (moNo: string) => {
    const n = notes[moNo]; if (!n || n.applied_at) return;
    try {
      const r = await apiFetch("/api/mo/update-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "applied", mo_no: moNo }) });
      const j = await r.json(); if (r.ok && j.data) setNotes((s) => ({ ...s, [moNo]: j.data as UpdateNote }));
    } catch { /* ป้ายยังเป็นร่าง — ไม่กระทบของจริงที่บันทึกแล้ว */ }
  };
  /** ร่างที่ยังไม่อัปเดตจริง (ป้าย "มีร่าง" ที่ปุ่มอัปเดต / ป๊อปอัปเดตดึงไปกรอก) */
  const pending = (moNo: string | null | undefined) => { const n = moNo ? notes[moNo] : undefined; return n && !n.applied_at && unOn(n.steps).length ? n : null; };
  return { notes, load, save, remove, markApplied, pending };
}

/** ช่องในตาราง: ว่าง = "+ จดว่าถึงไหน" · ร่าง = ป้ายเหลือง + ขั้นไกลสุด + ตัวเลข · อัปเดตแล้ว = ป้ายเขียว */
export function UpdateNoteCell({ note, deskName, onOpen, canEdit }: {
  note: UpdateNote | undefined; deskName: (id: string) => string | null; onOpen: () => void; canEdit: boolean;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (!note || !unOn(note.steps).length) {
    return canEdit ? <button type="button" onClick={(e) => { stop(e); onOpen(); }} className="text-[11px] text-slate-400 hover:text-violet-700">＋ จดว่าถึงไหน</button> : <span className="text-slate-300">—</span>;
  }
  const s = unSummary(note.steps, deskName), done = !!note.applied_at;
  return (
    <button type="button" onClick={(e) => { stop(e); onOpen(); }} title={`${done ? `อัปเดตจริงแล้ว · ${note.applied_name ?? ""} ${when(note.applied_at)}` : "ร่าง — ยังไม่ได้อัปเดตจริง"}\nจดโดย ${note.updated_name ?? "—"} · ${when(note.updated_at)}${note.note ? `\n${note.note}` : ""}`}
      className="block max-w-full text-left">
      <span className="flex items-center gap-1">
        <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-medium ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{done ? "อัปเดตแล้ว" : "ร่าง"}</span>
        <span className="truncate text-[12px] text-slate-700">ถึง <b>{s.last}</b></span>
      </span>
      {s.detail && <span className="block truncate text-[11px] text-slate-500">{s.detail}</span>}
      <span className="block truncate text-[10px] text-slate-400">{note.updated_name ?? ""} · {when(note.updated_at)}</span>
    </button>
  );
}

/** ป๊อปจดร่าง: ติ๊ก 5 ขั้น · ติ๊กข้อไหน กรอกข้อมูลข้อนั้น · บันทึกร่าง / บันทึก + อัปเดตจริงเลย */
export function UpdateNoteEditor({ mo, note, departments, craftsmen, onClose, onSave, onDelete, onUpdateNow }: {
  /** ใบที่จด (null = ปิด) */
  mo: { mo_no: string; mo_id: string | null; product_sku: string | null; qty: number } | null;
  note: UpdateNote | undefined;
  departments: { id: string; name: string }[];
  craftsmen: CrewPerson[];
  onClose: () => void;
  onSave: (steps: UnSteps, note: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** มีสิทธิ์อัปเดตจริง → ปุ่ม "บันทึกร่าง แล้วอัปเดตจริงเลย" (เปิดป๊อปอัปเดตงาน ดึงร่างไปกรอก) */
  onUpdateNow?: () => void;
}) {
  const [steps, setSteps] = useState<UnSteps>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const sig = mo ? `${mo.mo_no}|${note?.updated_at ?? ""}` : "";
  useEffect(() => { setSteps(note?.steps ?? {}); setText(note?.note ?? ""); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => JSON.stringify(steps) !== JSON.stringify(note?.steps ?? {}) || text.trim() !== (note?.note ?? ""), [steps, text, note]);
  const qty = mo?.qty ?? 0;
  const set = <K extends UnKey>(k: K, patch: Partial<NonNullable<UnSteps[K]>>) => setSteps((s) => (s[k] ? { ...s, [k]: { ...s[k], ...patch } } : s));
  const desk = steps.disp?.deptId ? departments.find((d) => d.id === steps.disp?.deptId) ?? null : null;
  const pool = desk ? (isHireDesk(desk.name) ? craftsmen : craftsmen.filter((c) => c.department_id === desk.id)) : [];
  const empty = !unOn(steps).length && !text.trim();

  const save = async (thenUpdate: boolean) => {
    if (!mo || busy) return;
    if (empty) { if (thenUpdate) onUpdateNow?.(); return; }
    if (!dirty && thenUpdate) { onUpdateNow?.(); return; }
    setBusy(true);
    const ok = await onSave(steps, text);
    setBusy(false);
    if (ok) { if (thenUpdate) onUpdateNow?.(); else onClose(); }
  };
  const numIn = (v: number, on: (n: number) => void, label: string, w = "w-20") => (
    <input type="number" min={0} step="any" value={v || ""} placeholder="0" aria-label={label} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))}
      className={`h-8 ${w} rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-400`} />
  );

  return (
    <>
      <ERPModal open={!!mo} onClose={onClose} size="md" hasUnsavedChanges={dirty} storageKey="wb-update-note"
        title={`จดร่าง: งานถึงไหนแล้ว · ${mo?.product_sku ?? mo?.mo_no ?? ""}`}
        description="ติ๊กตามที่เห็นจริงหน้างาน — ยังไม่บันทึกจริง · ปุ่ม &quot;อัปเดต&quot; จะดึงร่างนี้ไปกรอกให้"
        footer={<>
          {note && <button type="button" onClick={() => setAskDel(true)} disabled={busy} className="mr-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[12px] text-rose-600 hover:bg-rose-50"><Icon name="delete" /> ลบร่าง</button>}
          <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
          {onUpdateNow && <button type="button" onClick={() => void save(true)} disabled={busy || empty} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-40"><Icon name="refresh" /> {dirty ? "บันทึกร่าง แล้วอัปเดตจริงเลย" : "อัปเดตจริงเลย"}</button>}
          <button type="button" onClick={() => void save(false)} disabled={busy || !dirty || empty} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"><Icon name="save" /> {busy ? "กำลังบันทึก…" : "บันทึกร่าง"}</button>
        </>}>
        {mo && (
          <div className="space-y-3">
            {note && (
              <div className={`rounded-lg px-3 py-2 text-[12px] ${note.applied_at ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {note.applied_at ? <>อัปเดตจริงแล้ว · {note.applied_name ?? ""} {when(note.applied_at)} — แก้ร่างใหม่ = กลับเป็นร่าง</> : <>ร่างยังไม่ได้อัปเดตจริง</>}
                <span className="opacity-75"> · จดล่าสุดโดย {note.updated_name ?? "—"} {when(note.updated_at)}</span>
              </div>
            )}
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {UN_ORDER.map((k, i) => {
                const on = !!steps[k];
                return (
                  <div key={k} className={`px-3 py-2.5 ${on ? "bg-violet-50/40" : ""}`}>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input type="checkbox" checked={on} onChange={(e) => setSteps((s) => unTick(s, k, e.target.checked, qty))} className="h-4 w-4 accent-violet-600" />
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-500">{i + 1}</span>
                      <span className={`text-sm ${on ? "font-semibold text-slate-800" : "text-slate-600"}`}>{UN_LABEL[k]}</span>
                    </label>
                    {on && (
                      <div className="ml-14 mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                        {k === "prep" && <>วันที่ <input type="date" value={steps.prep?.date ?? ""} onChange={(e) => set("prep", { date: e.target.value || null })} className="h-8 rounded-lg border border-slate-200 px-2 text-sm" /> <span className="text-slate-400">(เว้นว่าง = จำไม่ได้)</span></>}
                        {k === "disp" && steps.disp && <div className="w-full space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <select value={steps.disp.deptId} onChange={(e) => set("disp", { deptId: e.target.value, crewIds: [] })} aria-label="โต๊ะที่จ่าย"
                              className="h-8 min-w-[10rem] rounded-lg border border-slate-200 bg-white px-2 text-sm">
                              <option value="">— เลือกโต๊ะ —</option>
                              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {numIn(steps.disp.qty, (n) => set("disp", { qty: n }), "จำนวนที่จ่าย")} ชิ้น <span className="text-slate-400">/ สั่ง {qty}</span>
                          </div>
                          {desk && <div>
                            <div className="mb-1 text-[11px] text-slate-500">คนรับงาน {isHireDesk(desk.name) ? "(ช่างเหมา — ควรระบุ)" : "(ไม่เลือก = ทั้งโต๊ะ)"}</div>
                            <CrewPick people={pool} everyone={craftsmen} desks={departments} value={steps.disp.crewIds} onChange={(ids) => set("disp", { crewIds: ids })} />
                          </div>}
                        </div>}
                        {k === "ret" && steps.ret && <>รับคืน {numIn(steps.ret.qty, (n) => set("ret", { qty: n }), "จำนวนรับคืน")} ชิ้น · เสีย {numIn(steps.ret.bad, (n) => set("ret", { bad: n }), "จำนวนเสีย", "w-16")} ชิ้น</>}
                        {k === "qc" && steps.qc && <>ของดีเข้าชั้น {numIn(steps.qc.good, (n) => set("qc", { good: n }), "ของดีเข้าชั้น QC")} ชิ้น</>}
                        {k === "ship" && steps.ship && <>ส่งออก {numIn(steps.ship.qty, (n) => set("ship", { qty: n }), "จำนวนส่งออก")} ชิ้น</>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <label className="block text-[12px] text-slate-500">หมายเหตุ (ไม่บังคับ)
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={2} placeholder="เช่น ช่างบอกว่าเหลืออีก 10 ชิ้นพรุ่งนี้"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </label>
            <div className="text-[11px] text-slate-400">ติ๊กขั้นหลัง ระบบติ๊กขั้นก่อนหน้าให้ด้วย (เอาออกได้) · ทั้งทีมเห็นร่างนี้ · ใครจดใหม่ = แทนชุดเดิม</div>
          </div>
        )}
      </ERPModal>
      <ConfirmDialog open={askDel} onClose={() => setAskDel(false)} variant="danger" title="ลบร่างนี้?" message="ลบเฉพาะร่าง — ข้อมูลจริงของงานไม่เปลี่ยน"
        confirmText="ลบร่าง" onConfirm={async () => { setAskDel(false); setBusy(true); const ok = await onDelete(); setBusy(false); if (ok) onClose(); }} />
    </>
  );
}
