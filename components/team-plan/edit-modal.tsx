"use client";
/**
 * ป๊อปแก้ 1 งานในแผนงานทีม — ชื่อ · โน้ต · ความด่วน · สำคัญ · กำหนด · ผู้รับผิดชอบ · เตือน · ทำซ้ำ · รอคนอื่น · ลบ
 * โน้ต = กล่องพิมพ์จัดรูปแบบกลาง (RichTextEditor แบบย่อ: bullet / ลำดับเลข / หนา / เอียง · พิมพ์ "- " = bullet) เก็บ HTML · โน้ตเก่าที่เป็นข้อความแปลงด้วย lib/rich-note
 * เช็กลิสต์ในงาน = ของกลาง RecordChecklist (lib/team-plan TEAM_PLAN_CHECK) + แม่แบบหลายข้อ · ติ๊กครบ = ถาม "ปิดงานนี้เลยไหม?" (เจ้าของขอ 2026-11-12)
 * + ใส่แผนส่วนตัวของฉัน (วันนี้/พรุ่งนี้/สัปดาห์นี้ — ของกลาง lib/planner-client · ใช้แทนการลากบนมือถือ)
 * บันทึกเฉพาะช่องที่เปลี่ยน (PATCH /api/team-plan/[id]) · ปิดตอนยังไม่บันทึก = ถามก่อน (ERPModal กลาง)
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { RecordChecklist, WhoChip, WhoPicker } from "@/components/record-tasks/checklist";
import { ERPDateTime24 } from "@/components/form";
import {
  dueLabel, PRIORITIES, PRIORITY_META, REMIND_LABEL, REMIND_MODES, TEAM_PLAN_CHECK, waitingDays,
  type PlanItem, type Priority, type RemindMode, type RepeatRule,
} from "@/lib/team-plan";
import { deletePlanItem, patchPlanItem, type PlanPatch } from "@/lib/team-plan-client";
import { addToPlan } from "@/lib/planner-client";
import { bucketLabel, type PlanBucket } from "@/lib/planner";
import { noteToHtml, noteToText } from "@/lib/rich-note";
import { checklistProgress, type ChecklistSummary } from "@/lib/record-tasks";

// กล่องพิมพ์จัดรูปแบบหนัก (Tiptap) → โหลดตอนเปิดป๊อปเท่านั้น ไม่ถ่วงหน้ากระดาน
const RichTextEditor = dynamic(() => import("@/components/rich-text").then((m) => m.RichTextEditor), {
  ssr: false, loading: () => <div className="h-[96px] animate-pulse rounded-lg border border-slate-200 bg-slate-50" />,
});

/** ISO → "YYYY-MM-DDTHH:mm" เวลาไทย (ค่าของช่อง ERPDateTime24) */
const toLocal = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : null);

export function PlanEditModal({ item, canEdit, me, onClose, onSaved, onDeleted, onChecklist }: {
  item: PlanItem; canEdit: boolean; me: string;
  onClose: () => void; onSaved: (list: PlanItem[]) => void; onDeleted: (id: string) => void;
  /** เช็กลิสต์เปลี่ยน (บันทึกทันทีทีละข้อ ไม่ต้องกดบันทึก) → การ์ดบนกระดานอัปเดตป้าย "2/4" */
  onChecklist?: (id: string, s: ChecklistSummary) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const [initNote] = useState(() => noteToHtml(item.note));   // โน้ตเก่าแบบข้อความ → HTML (บรรทัด "- " = bullet)
  const [note, setNote] = useState(initNote);
  const [check, setCheck] = useState<ChecklistSummary | null>(item.checklist ?? null);
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [important, setImportant] = useState(item.plan.important);
  const [due, setDue] = useState(toLocal(item.due_at));
  const [who, setWho] = useState<{ id: string; name: string } | null>(item.assigned_to ? { id: item.assigned_to, name: item.assigned_name ?? "ผู้ใช้" } : null);
  const [picking, setPicking] = useState(false);
  const [remind, setRemind] = useState<RemindMode>(item.plan.remind);
  const [repeatEvery, setRepeatEvery] = useState<RepeatRule["every"] | "">(item.plan.repeat?.every ?? "");
  const [repeatN, setRepeatN] = useState(item.plan.repeat?.n ?? 1);
  const [waitingOn, setWaitingOn] = useState(!!item.plan.waiting);
  const [waitingNote, setWaitingNote] = useState(item.plan.waiting?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // เฉพาะช่องที่เปลี่ยน
  const patch = useMemo<PlanPatch>(() => {
    const p: PlanPatch = {};
    if (title.trim() !== item.title) p.title = title.trim();
    const noteOut = noteToText(note).trim() ? note : null;   // กล่องว่าง (เหลือแท็กเปล่า) = ไม่มีโน้ต
    if (noteOut !== (initNote || null)) p.note = noteOut;
    if (priority !== item.priority) p.priority = priority;
    if (important !== item.plan.important) p.important = important;
    const dueIso = fromLocal(due);
    if ((dueIso ?? null) !== (item.due_at ? new Date(item.due_at).toISOString() : null)) p.due_at = dueIso;
    if ((who?.id ?? null) !== item.assigned_to) p.assigned_to = who?.id ?? null;
    if (remind !== item.plan.remind) p.remind = remind;
    const rep: RepeatRule | null = repeatEvery ? { every: repeatEvery, n: Math.max(1, Math.min(30, Math.round(repeatN) || 1)) } : null;
    if (JSON.stringify(rep) !== JSON.stringify(item.plan.repeat)) p.repeat = rep;
    const wait = waitingOn ? { note: waitingNote.trim() } : null;
    if (JSON.stringify(wait) !== JSON.stringify(item.plan.waiting ? { note: item.plan.waiting.note } : null)) p.waiting = wait;
    return p;
  }, [title, note, initNote, priority, important, due, who, remind, repeatEvery, repeatN, waitingOn, waitingNote, item]);
  const dirty = Object.keys(patch).length > 0;

  const save = async (extra: PlanPatch = {}) => {
    if (!title.trim()) { setErr("ชื่องานว่างไม่ได้"); return; }
    if (repeatEvery && !due) { setErr("งานทำซ้ำต้องมีกำหนด — ใส่วันกำหนดก่อน"); return; }
    const body = { ...patch, ...extra };
    if (!Object.keys(body).length) { onClose(); return; }
    setBusy(true); setErr(null);
    try {
      const { item: saved, next } = await patchPlanItem(item.id, body);
      onSaved(next ? [saved, next] : [saved]);
      if (next) toast.success(`งานทำซ้ำ — สร้างรอบถัดไปแล้ว (${dueLabel(next.due_at)})`);
      else toast.success(extra.status === "resolved" ? "ติ๊กเสร็จแล้ว" : "บันทึกแล้ว");
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await deletePlanItem(item.id); toast.success("ลบงานแล้ว"); onDeleted(item.id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); setAskDelete(false); }
  };

  const done = item.status === "resolved";
  const prog = checklistProgress(check);
  const lbl = "mb-1 block text-xs font-medium text-slate-600";
  const field = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-slate-50";

  return (
    <ERPModal open onClose={onClose} title="งานในแผนงาน" size="md" hasUnsavedChanges={dirty}
      footer={<>
        {canEdit && (item.plan.created_by_id === me) && (
          <button type="button" onClick={() => setAskDelete(true)} disabled={busy} className="mr-auto h-9 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50"><Icon name="delete" /> ลบ</button>
        )}
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ปิด</button>
        {canEdit && !done && <button type="button" onClick={() => void save({ status: "resolved" })} disabled={busy} className="h-9 rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm text-emerald-700 hover:bg-emerald-100"><Icon name="done" /> เสร็จแล้ว</button>}
        {canEdit && <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : <><Icon name="save" /> บันทึก</>}</button>}
      </>}>
      <div className="space-y-3">
        <div>
          <label className={lbl}>ชื่องาน</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} disabled={!canEdit} className={field} />
        </div>
        <div>
          <label className={lbl}>ความด่วน</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRIORITIES.map((p) => (
              <button key={p} type="button" disabled={!canEdit} onClick={() => setPriority(p)}
                className={`h-8 rounded-full border px-3 text-xs ${priority === p ? "font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                style={priority === p ? { borderColor: PRIORITY_META[p].color, color: PRIORITY_META[p].color, background: `${PRIORITY_META[p].color}14` } : undefined}>
                {PRIORITY_META[p].label}
              </button>
            ))}
            <label className="ml-2 flex cursor-pointer items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={important} disabled={!canEdit} onChange={(e) => setImportant(e.target.checked)} className="h-3.5 w-3.5 accent-violet-600" /> สำคัญ (ใช้ในตาราง 4 ช่อง)
            </label>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>กำหนด</label>
            <div className="flex items-center gap-1.5">
              <ERPDateTime24 value={due} onChange={setDue} defaultTime="18:00" disabled={!canEdit} />
              {due && canEdit && <button type="button" onClick={() => setDue("")} className="text-xs text-slate-400 hover:text-slate-700">ล้าง</button>}
            </div>
          </div>
          <div>
            <label className={lbl}>เตือนก่อนถึงกำหนด</label>
            <select value={remind} disabled={!canEdit || !due} onChange={(e) => setRemind(e.target.value as RemindMode)} className={field}>
              {REMIND_MODES.map((m) => <option key={m} value={m}>{REMIND_LABEL[m]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lbl}>ผู้รับผิดชอบ</label>
          <WhoChip name={who?.name} onClick={canEdit ? () => setPicking((p) => !p) : undefined} />
          {picking && <WhoPicker allowNone={!!who} onCancel={() => setPicking(false)} onPick={(u) => { setWho(u); setPicking(false); }} />}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}><Icon name="repeat" /> ทำซ้ำ</label>
            <div className="flex items-center gap-1.5">
              <select value={repeatEvery} disabled={!canEdit} onChange={(e) => setRepeatEvery(e.target.value as RepeatRule["every"] | "")} className={field}>
                <option value="">ไม่ทำซ้ำ</option><option value="day">ทุกวัน</option><option value="week">ทุกสัปดาห์</option><option value="month">ทุกเดือน</option>
              </select>
              {repeatEvery && <>
                <span className="text-xs text-slate-500">ทุก</span>
                <input type="number" min={1} max={30} value={repeatN} disabled={!canEdit} onChange={(e) => setRepeatN(Number(e.target.value))} className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-sm" aria-label="ทุกกี่รอบ" />
              </>}
            </div>
            {repeatEvery && <p className="mt-1 text-[11px] text-slate-400">ติ๊กเสร็จแล้วระบบสร้างรอบถัดไปให้เอง</p>}
          </div>
          <div>
            <label className="mb-1 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={waitingOn} disabled={!canEdit} onChange={(e) => setWaitingOn(e.target.checked)} className="h-3.5 w-3.5 accent-amber-500" />
              <Icon name="waiting" /> รอคนอื่นอยู่
            </label>
            <input value={waitingNote} onChange={(e) => setWaitingNote(e.target.value)} disabled={!canEdit || !waitingOn} maxLength={120}
              placeholder="รออะไร / รอใคร เช่น รอลูกค้าตอบ" className={field} />
            {item.plan.waiting && waitingOn && <p className="mt-1 text-[11px] text-amber-700">รอมาแล้ว {waitingDays(item.plan.waiting.since)} วัน</p>}
          </div>
        </div>
        <div>
          <label className={lbl}>โน้ต <span className="font-normal text-slate-400">· กดปุ่ม bullet หรือพิมพ์ "- " ขึ้นต้นบรรทัด</span></label>
          <RichTextEditor toolbar="basic" value={note} onChange={setNote} editable={canEdit} minHeight={72} placeholder="รายละเอียดเพิ่มเติม…" />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600"><Icon name="done" /> เช็กลิสต์</span>
            {prog.total > 0 && <>
              <span className={`text-xs tabular-nums ${prog.allDone ? "text-emerald-700" : "text-slate-500"}`}>เสร็จ {prog.done}/{prog.total}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden><span className="block h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></span>
            </>}
            <span className="ml-auto text-[11px] text-slate-400">ติ๊ก/เพิ่มแล้วบันทึกทันที</span>
          </div>
          <RecordChecklist moduleKey={TEAM_PLAN_CHECK.moduleKey} recordType={TEAM_PLAN_CHECK.recordType} recordId={item.id} canEdit={canEdit}
            presetType={TEAM_PLAN_CHECK.presetType} templateType={TEAM_PLAN_CHECK.templateType} presetTitle="ข้อที่ใช้บ่อย"
            emptyText="ยังไม่มีข้อ — พิมพ์เพิ่มด้านล่าง หรือใส่จากแม่แบบ" placeholder="＋ เพิ่มข้อ… (Enter)"
            onChange={(s) => { setCheck(s); onChecklist?.(item.id, s); }} />
          {canEdit && !done && prog.allDone && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span><Icon name="done" /> เช็กลิสต์ครบทุกข้อแล้ว — ปิดงานนี้เลยไหม?</span>
              <button type="button" onClick={() => void save({ status: "resolved" })} disabled={busy}
                className="h-8 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">ปิดงาน</button>
            </div>
          )}
        </div>
        {!done && <PersonalPlanRow item={item} />}
        {item.plan.source && (
          <a href={item.plan.source.href} className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><Icon name="link" /> เปิดเรื่องเดิม: {item.plan.source.label}</a>
        )}
        <p className="text-[11px] text-slate-400">สร้างโดย {item.created_by ?? "—"}{done && item.resolved_by ? ` · เสร็จโดย ${item.resolved_by}` : ""}</p>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={() => void remove()} loading={busy} variant="danger"
        title="ลบงานนี้?" message={`"${item.title}" จะหายจากแผนงาน (ยังมีบันทึกในประวัติ)`} confirmText="ลบ" />
    </ERPModal>
  );
}

/** ใส่งานนี้ลงแผนส่วนตัวของฉัน (แดชบอร์ด → แผนงาน) · ใส่ซ้ำ = ระบบข้ามให้ (unique ต้นทาง) */
function PersonalPlanRow({ item }: { item: PlanItem }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const put = async (bucket: PlanBucket) => {
    setBusy(true);
    try {
      const rows = await addToPlan({
        title: item.title, bucket, source_type: "task", source_id: item.id,
        link: `/tasks/plan?item=${encodeURIComponent(item.id)}`, module: "tasks", due_at: item.due_at,
      });
      toast.success(rows.length ? `ใส่แผนส่วนตัว "${bucketLabel(bucket)}" แล้ว — ดูที่แดชบอร์ด → แผนงาน` : "งานนี้อยู่ในแผนส่วนตัวของคุณอยู่แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ใส่แผนส่วนตัวไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
      <span><Icon name="calendar" /> ใส่แผนส่วนตัวของฉัน:</span>
      {(["today", "tomorrow", "week"] as PlanBucket[]).map((b) => (
        <button key={b} type="button" disabled={busy} onClick={() => void put(b)}
          className="h-7 rounded-md border border-slate-200 bg-white px-2.5 hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">{bucketLabel(b)}</button>
      ))}
    </div>
  );
}
