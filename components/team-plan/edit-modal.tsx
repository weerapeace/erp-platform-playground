"use client";
/**
 * ป๊อปแก้ 1 งานในแผนงานทีม — ชื่อ · โน้ต · ความด่วน · สำคัญ · กำหนด · ผู้รับผิดชอบ · เตือน · ทำซ้ำ · รอคนอื่น · ลบ
 * โน้ต = กล่องพิมพ์จัดรูปแบบกลาง (RichTextEditor แบบย่อ: bullet / ลำดับเลข / หนา / เอียง · พิมพ์ "- " = bullet) เก็บ HTML · โน้ตเก่าที่เป็นข้อความแปลงด้วย lib/rich-note
 * เช็กลิสต์ในงาน = ของกลาง RecordChecklist (lib/team-plan TEAM_PLAN_CHECK) + แม่แบบหลายข้อ · ติ๊กครบ = ถาม "ปิดงานนี้เลยไหม?" (เจ้าของขอ 2026-11-12)
 * + แท็ก · คนติดตาม (กระดิ่งตอนเสร็จ) · เวลาที่คาดว่าใช้ · รูป/ไฟล์แนบ (RecordFilesField) · คอมเมนต์ (CommentThread) · ประวัติ (RecordHistoryInline) · ทำสำเนา
 * + ใส่แผนส่วนตัวของฉัน (วันนี้/พรุ่งนี้/สัปดาห์นี้ — ของกลาง lib/planner-client · ใช้แทนการลากบนมือถือ)
 * บันทึกเฉพาะช่องที่เปลี่ยน (PATCH /api/team-plan/[id]) · ปิดตอนยังไม่บันทึก = ถามก่อน (ERPModal กลาง)
 * หน้าตา 2026-11-16 (เจ้าของเลือกจาก widget): ช่องที่มีข้อมูลแล้วล็อก ดับเบิลคลิกถึงแก้ (ของกลาง InlineField) · ช่องว่างกดใส่ได้เลย
 *   PC 2 คอลัมน์: ซ้าย = ข้อมูล/โน้ต/ไฟล์/คอมเมนต์ · ขวา = เช็กลิสต์ + ผูกไว้ · มือถือ = คอลัมน์เดียว (เช็กลิสต์ต่อจากข้อมูล)
 *   โน้ตพิมพ์ได้ตลอด · ธีมรายคน (ปุ่มแต่งหน้า · useDrawerTheme("plan")): กระจกใส (Liquid Glass แบบเบา) + พื้นหลัง + ขนาด · กระจกไม่ตั้งพื้นหลัง = สีตามความด่วน
 */
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { RecordChecklist, WhoChip, WhoPicker } from "@/components/record-tasks/checklist";
import { ERPDateTime24 } from "@/components/form";
import {
  dueLabel, isOverdue, REPEAT_LABEL, nthWeekdayOf, WEEKDAY_TH, ESTIMATE_OPTIONS, estimateLabel, linkedHref, PLAN_LINK_KINDS, PLAN_WATCHERS_MAX, PRIORITIES, PRIORITY_META, REMIND_LABEL, REMIND_MODES, TEAM_PLAN_CHECK, TEAM_PLAN_FILES, waitingDays,
  type PlanItem, type PlanLinkedRef, type PlanWatcher, type Priority, type RemindMode, type RepeatRule,
} from "@/lib/team-plan";
import { deletePlanItem, duplicatePlanItem, patchPlanItem, type PlanPatch } from "@/lib/team-plan-client";
import { RecordFilesField } from "@/components/record-files";
import { ImageAttachKeys } from "@/components/image-attach";
import { CommentThread } from "@/components/comment-thread";
import { RecordHistoryInline } from "@/components/activity-feed/record-history-drawer";
import { PlanTagChip, PlanTagInput } from "./tag-input";
import { InlineField } from "@/components/inline-edit";
import { DrawerThemeButton, GLASS_CARD, PLAIN_CARD, drawerBgStyle, drawerZoom, glassBackdropStyle, useDrawerTheme } from "@/app/tasks/drawer-theme";
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
/** ISO → "อา. 15 พ.ย. 18:00" (เวลาไทย) — โชว์วันจริงในช่องกำหนด (ป้าย "เกินกำหนด/พรุ่งนี้" อยู่ข้าง ๆ) */
const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const dueDateText = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 7 * 3600e3);   // เวลาไทย +07:00 คงที่
  return `${TH_DOW[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]} ${d.toISOString().slice(11, 16)}`;
};

export function PlanEditModal({ item, canEdit, me, onClose, onSaved, onDeleted, onChecklist, tagSuggestions = [], onDuplicated }: {
  item: PlanItem; canEdit: boolean; me: string;
  onClose: () => void; onSaved: (list: PlanItem[]) => void; onDeleted: (id: string) => void;
  /** เช็กลิสต์เปลี่ยน (บันทึกทันทีทีละข้อ ไม่ต้องกดบันทึก) → การ์ดบนกระดานอัปเดตป้าย "2/4" */
  onChecklist?: (id: string, s: ChecklistSummary) => void;
  /** แท็กที่ทีมใช้อยู่ (แนะนำตอนพิมพ์) */
  tagSuggestions?: string[];
  /** ทำสำเนาแล้ว → หน้าแม่ใส่งานใหม่ + เปิดงานใหม่ */
  onDuplicated?: (copy: PlanItem) => void;
}) {
  const toast = useToast();
  const { theme, update: updateTheme } = useDrawerTheme("plan");   // ธีมป๊อปรายคน (กระจกใส/พื้นหลัง/ขนาด)
  const [title, setTitle] = useState(item.title);
  const [initNote] = useState(() => noteToHtml(item.note));   // โน้ตเก่าแบบข้อความ → HTML (บรรทัด "- " = bullet)
  const [note, setNote] = useState(initNote);
  const [check, setCheck] = useState<ChecklistSummary | null>(item.checklist ?? null);
  const [tags, setTags] = useState<string[]>(item.plan.tags);
  const [cover, setCover] = useState<string | null>(item.plan.cover);
  const [watchers, setWatchers] = useState<PlanWatcher[]>(item.plan.watchers);
  const [pickWatcher, setPickWatcher] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(item.plan.estimate_min);
  const [showHistory, setShowHistory] = useState(false);
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [important, setImportant] = useState(item.plan.important);
  const [due, setDue] = useState(toLocal(item.due_at));
  const [who, setWho] = useState<{ id: string; name: string } | null>(item.assigned_to ? { id: item.assigned_to, name: item.assigned_name ?? "ผู้ใช้" } : null);
  const [remind, setRemind] = useState<RemindMode>(item.plan.remind);
  // ทำซ้ำ: "month_nth" = รายเดือนแบบวันในสัปดาห์ที่ N (เช่น พุธที่ 2 ของทุกเดือน)
  const [repeatEvery, setRepeatEvery] = useState<RepeatRule["every"] | "month_nth" | "">(item.plan.repeat ? (item.plan.repeat.nth ? "month_nth" : item.plan.repeat.every) : "");
  const [repeatN, setRepeatN] = useState(item.plan.repeat?.n ?? 1);
  const [repeatNth, setRepeatNth] = useState(item.plan.repeat?.nth ?? 1);
  const [repeatWd, setRepeatWd] = useState(item.plan.repeat?.wd ?? 3);
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
    const rn = Math.max(1, Math.min(30, Math.round(repeatN) || 1));
    const rep: RepeatRule | null = !repeatEvery ? null : repeatEvery === "month_nth" ? { every: "month", n: rn, nth: repeatNth, wd: repeatWd } : { every: repeatEvery, n: rn };
    if (JSON.stringify(rep) !== JSON.stringify(item.plan.repeat)) p.repeat = rep;
    const wait = waitingOn ? { note: waitingNote.trim() } : null;
    if (JSON.stringify(wait) !== JSON.stringify(item.plan.waiting ? { note: item.plan.waiting.note } : null)) p.waiting = wait;
    if (JSON.stringify(tags) !== JSON.stringify(item.plan.tags)) p.tags = tags;
    if (JSON.stringify(watchers.map((w) => w.id)) !== JSON.stringify(item.plan.watchers.map((w) => w.id))) p.watchers = watchers;
    if (estimate !== item.plan.estimate_min) p.estimate_min = estimate;
    if (cover !== item.plan.cover) p.cover = cover;
    return p;
  }, [title, note, initNote, priority, important, due, who, remind, repeatEvery, repeatN, repeatNth, repeatWd, waitingOn, waitingNote, tags, watchers, estimate, cover, item]);
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
  const duplicate = async () => {
    if (dirty) { setErr("บันทึกการแก้ไขก่อน แล้วค่อยทำสำเนา"); return; }
    setBusy(true); setErr(null);
    try {
      const copy = await duplicatePlanItem(item.id);
      toast.success(`ทำสำเนาแล้ว — "${copy.title}"${copy.checklist ? " (เช็กลิสต์ชุดเดิม ยังไม่ติ๊ก)" : ""}`);
      onDuplicated?.(copy);
    } catch (e) { setErr(e instanceof Error ? e.message : "ทำสำเนาไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  /** เลิกผูก 1 อย่าง (บันทึกทันที ไม่ต้องกดบันทึก) */
  const unlink = async (r: PlanLinkedRef) => {
    setBusy(true); setErr(null);
    try {
      const { item: saved } = await patchPlanItem(item.id, { linked: item.plan.linked.filter((x) => !(x.kind === r.kind && x.id === r.id)) });
      onSaved([saved]);
      toast.success(`เลิกผูก ${r.label} แล้ว`);
    } catch (e) { setErr(e instanceof Error ? e.message : "เลิกผูกไม่สำเร็จ"); }
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
  // 🫧 ธีมป๊อปรายคน (ของกลาง drawer-theme) — กระจกใส + พื้นหลัง + ขนาด · ไม่ตั้งพื้นหลัง = สีตามความด่วน
  const glass = theme.glass;
  const card = `rounded-2xl border ${glass ? GLASS_CARD : PLAIN_CARD}`;
  const lbl = "mb-1 block text-xs font-medium text-slate-600";
  const field = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-slate-50";
  const row = "flex items-start gap-2 border-b border-slate-200/70 px-3 py-2 last:border-b-0";
  const rowLbl = "flex w-24 shrink-0 sm:w-28 items-center gap-1.5 pt-1 text-xs text-slate-500";
  const chip = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs";
  const dueIso = fromLocal(due);
  const overdue = !done && isOverdue(dueIso);
  const pMeta = PRIORITY_META[priority];
  const repDraft: RepeatRule | null = !repeatEvery ? null
    : repeatEvery === "month_nth" ? { every: "month", n: Math.max(1, Math.round(repeatN) || 1), nth: repeatNth, wd: repeatWd }
    : { every: repeatEvery, n: Math.max(1, Math.round(repeatN) || 1) };
  const ro = !canEdit;

  return (
    <ERPModal open onClose={onClose} title="งานในแผนงาน" size="xl" hasUnsavedChanges={dirty}
      footer={<>
        {canEdit && (item.plan.created_by_id === me) && (
          <button type="button" onClick={() => setAskDelete(true)} disabled={busy} className="mr-auto h-9 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50"><Icon name="delete" /> ลบ</button>
        )}
        {canEdit && <button type="button" onClick={() => void duplicate()} disabled={busy} title="สร้างงานใหม่ที่เหมือนงานนี้ (เช็กลิสต์ชุดเดิมแบบยังไม่ติ๊ก · ไม่รวมไฟล์แนบ/คอมเมนต์)"
          className={`h-9 whitespace-nowrap rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 ${canEdit && item.plan.created_by_id === me ? "" : "mr-auto"}`}><Icon name="documents" /><span className="hidden sm:inline"> ทำสำเนา</span></button>}
        <button type="button" onClick={onClose} disabled={busy} className="h-9 whitespace-nowrap rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ปิด</button>
        {canEdit && !done && <button type="button" onClick={() => void save({ status: "resolved" })} disabled={busy} className="h-9 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm text-emerald-700 hover:bg-emerald-100"><Icon name="done" /> เสร็จแล้ว</button>}
        {canEdit && <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="h-9 whitespace-nowrap rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : <><Icon name="save" /> บันทึก</>}</button>}
      </>}>
      {/* พื้นป๊อป: กระจกใส = วงสีตามความด่วน (หรือพื้นหลังที่ตั้งเอง) ให้เห็นทะลุการ์ด · ปกติ = พื้นที่ตั้งไว้/เทาอ่อน */}
      <div className="-mx-3 -my-3 min-h-full px-3 py-3 sm:-mx-6 sm:-my-5 sm:px-6 sm:py-5"
        style={{ ...(glass ? glassBackdropStyle(theme, pMeta.color) : { background: "#f8fafc", ...drawerBgStyle(theme) }), zoom: drawerZoom(theme.size) }}>
        {/* หัว: ชื่องาน + ป้ายสถานะ (มีค่าแล้วล็อก ดับเบิลคลิกเพื่อแก้) */}
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <InlineField filled={!!title.trim()} disabled={ro} emptyLabel="ตั้งชื่องาน"
              display={<h3 className="break-words text-lg font-semibold text-slate-900">{title}</h3>}
              editor={(fin) => <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} autoFocus aria-label="ชื่องาน"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fin(); } }} className={field} />} />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <InlineField filled disabled={ro} emptyLabel="" hint="ดับเบิลคลิกเพื่อเปลี่ยนความด่วน"
                display={<span className={chip} style={{ background: `${pMeta.color}1f`, color: pMeta.color }}>{pMeta.label}</span>}
                editor={(fin) => (
                  <div className="flex flex-wrap gap-1">
                    {PRIORITIES.map((p) => (
                      <button key={p} type="button" onClick={() => { setPriority(p); fin(); }}
                        className={`h-7 rounded-full border px-3 text-xs ${priority === p ? "font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                        style={priority === p ? { borderColor: PRIORITY_META[p].color, color: PRIORITY_META[p].color, background: `${PRIORITY_META[p].color}14` } : undefined}>
                        {PRIORITY_META[p].label}
                      </button>
                    ))}
                  </div>
                )} />
              <InlineField filled={important} disabled={ro} emptyLabel="สำคัญ?" emptyText="" hint="ดับเบิลคลิกเพื่อเปลี่ยน"
                display={<span className={`${chip} bg-violet-100 text-violet-800`}><Icon name="star" /> สำคัญ</span>}
                editor={(fin) => (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={important} onChange={(e) => { setImportant(e.target.checked); fin(); }} className="h-3.5 w-3.5 accent-violet-600" /> สำคัญ (ใช้ในตาราง 4 ช่อง)
                  </label>
                )} />
              {overdue && <span className={`${chip} bg-rose-100 text-rose-700`}><Icon name="warning" /> {dueLabel(dueIso)}</span>}
              {done && <span className={`${chip} bg-emerald-100 text-emerald-800`}><Icon name="done" /> เสร็จแล้ว</span>}
              {item.plan.linked.length > 0 && <span className={`${chip} bg-indigo-100 text-indigo-800`}><Icon name="magnet" /> ผูกไว้ {item.plan.linked.length} อย่าง</span>}
            </div>
          </div>
          <DrawerThemeButton theme={theme} update={updateTheme} sections={[]} parts={["glass", "background", "size"]} label="แต่งหน้าป๊อปงาน (ของฉัน)" />
        </div>

        {/* PC: ซ้าย = ข้อมูล/โน้ต/ไฟล์/คอมเมนต์ · ขวา = เช็กลิสต์ + ผูกไว้ · มือถือ: คอลัมน์เดียว เรียงตาม order (เช็กลิสต์ต่อจากข้อมูล) */}
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-start">
          <div className="contents md:flex md:flex-col md:gap-3">
            <div className={`${card} order-1 md:order-none`}>
              <div className={row}><span className={rowLbl}><Icon name="calendar" /> กำหนด</span>
                <div className="min-w-0 flex-1"><InlineField filled={!!due} disabled={ro} emptyLabel="ตั้งกำหนด"
                  display={<span className={`text-sm ${overdue ? "font-medium text-rose-600" : "text-slate-800"}`}>{dueDateText(dueIso)}<span className="ml-1.5 text-xs font-normal text-slate-400">{dueLabel(dueIso)}</span></span>}
                  editor={() => (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ERPDateTime24 value={due} onChange={setDue} defaultTime="18:00" />
                      {due && <button type="button" onClick={() => setDue("")} className="text-xs text-slate-400 hover:text-slate-700">ล้าง</button>}
                    </div>
                  )} /></div>
              </div>
              <div className={row}><span className={rowLbl}><Icon name="notify" /> เตือน</span>
                <div className="min-w-0 flex-1">{!due ? <span className="text-xs text-slate-400">ตั้งกำหนดก่อน แล้วค่อยตั้งเตือน</span> : (
                  <InlineField filled={remind !== "none"} disabled={ro} emptyLabel="ตั้งเตือน" emptyText="ไม่เตือน"
                    display={<span className="text-sm text-slate-800">{REMIND_LABEL[remind]}</span>}
                    editor={(fin) => (
                      <select value={remind} onChange={(e) => { setRemind(e.target.value as RemindMode); fin(); }} className={field} autoFocus>
                        {REMIND_MODES.map((m) => <option key={m} value={m}>{REMIND_LABEL[m]}</option>)}
                      </select>
                    )} />
                )}</div>
              </div>
              <div className={row}><span className={rowLbl}><Icon name="user" /> ผู้รับผิดชอบ</span>
                <div className="min-w-0 flex-1"><InlineField filled={!!who} disabled={ro} emptyLabel="มอบให้ใคร" emptyText="ยังไม่ระบุ"
                  display={<WhoChip name={who?.name} />}
                  editor={(fin) => <WhoPicker allowNone={!!who} onCancel={fin} onPick={(u) => { setWho(u); fin(); }} />} /></div>
              </div>
              <div className={row}><span className={rowLbl}><Icon name="view" /> คนติดตาม</span>
                <div className="min-w-0 flex-1"><InlineField filled={watchers.length > 0} disabled={ro} emptyLabel="เพิ่มคนติดตาม" emptyText="ไม่มี"
                  display={<span className="flex flex-wrap gap-1">{watchers.map((w) => <WhoChip key={w.id} name={w.name} compact />)}</span>}
                  editor={() => (
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {watchers.map((w) => (
                          <span key={w.id} className="inline-flex items-center gap-1">
                            <WhoChip name={w.name} compact />
                            <button type="button" onClick={() => setWatchers((l) => l.filter((x) => x.id !== w.id))} aria-label={`เอา ${w.name} ออกจากคนติดตาม`} className="text-xs text-slate-300 hover:text-rose-500">×</button>
                          </span>
                        ))}
                        {watchers.length < PLAN_WATCHERS_MAX && (
                          <button type="button" onClick={() => setPickWatcher((p) => !p)} className="h-7 rounded-full border border-dashed border-slate-300 bg-white px-2.5 text-xs text-slate-500 hover:border-violet-300 hover:text-violet-700">＋ เพิ่ม</button>
                        )}
                      </div>
                      {pickWatcher && <WhoPicker allowNone={false} onCancel={() => setPickWatcher(false)}
                        onPick={(u) => { if (u && !watchers.some((w) => w.id === u.id)) setWatchers((l) => [...l, { id: u.id, name: u.name }]); setPickWatcher(false); }} />}
                      <p className="mt-1 text-[11px] text-slate-400">ได้แจ้งเตือนตอนงานเสร็จ</p>
                    </div>
                  )} /></div>
              </div>
              <div className={row}><span className={rowLbl}><Icon name="tag" /> แท็ก / โปรเจกต์</span>
                <div className="min-w-0 flex-1"><InlineField filled={tags.length > 0} disabled={ro} emptyLabel="ใส่แท็ก" emptyText="ไม่มี"
                  display={<span className="flex flex-wrap gap-1">{tags.map((g) => <PlanTagChip key={g} tag={g} />)}</span>}
                  editor={() => <PlanTagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />} /></div>
              </div>
              <div className={row}><span className={rowLbl}><Icon name="clock" /> เวลาที่คาด</span>
                <div className="min-w-0 flex-1"><InlineField filled={!!estimate} disabled={ro} emptyLabel="ประเมินเวลา" emptyText="ไม่ระบุ"
                  display={<span className="text-sm text-slate-800">~{estimateLabel(estimate)}</span>}
                  editor={(fin) => (
                    <select value={estimate ?? ""} autoFocus onChange={(e) => { setEstimate(e.target.value ? Number(e.target.value) : null); fin(); }} className={`${field} sm:w-48`}>
                      <option value="">ไม่ระบุ</option>
                      {estimate && !(ESTIMATE_OPTIONS as readonly number[]).includes(estimate) && <option value={estimate}>{estimateLabel(estimate)}</option>}
                      {ESTIMATE_OPTIONS.map((m) => <option key={m} value={m}>{m === 240 ? "ครึ่งวัน (4 ชม.)" : m === 480 ? "1 วัน (8 ชม.)" : estimateLabel(m)}</option>)}
                    </select>
                  )} /></div>
              </div>
              <div className={row}><span className={rowLbl}><Icon name="repeat" /> ทำซ้ำ</span>
                <div className="min-w-0 flex-1"><InlineField filled={!!repeatEvery} disabled={ro} emptyLabel="ตั้งทำซ้ำ" emptyText="ไม่ทำซ้ำ"
                  display={<span className="text-sm text-slate-800">{REPEAT_LABEL(repDraft)}</span>}
                  editor={() => (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <select value={repeatEvery} className={field}
                          onChange={(e) => {
                            const v = e.target.value as RepeatRule["every"] | "month_nth" | "";
                            // เลือกแบบวันในสัปดาห์ → ตั้งค่าเริ่มจากวันกำหนด (เช่น กำหนดพุธที่ 2 → พุธที่ 2 ของทุกเดือน)
                            if (v === "month_nth" && due) { const x = nthWeekdayOf(due.slice(0, 10)); setRepeatNth(x.nth); setRepeatWd(x.wd); }
                            setRepeatEvery(v);
                          }}>
                          <option value="">ไม่ทำซ้ำ</option><option value="day">ทุกวัน</option><option value="week">ทุกสัปดาห์</option>
                          <option value="month">ทุกเดือน (วันที่เดิม)</option><option value="month_nth">ทุกเดือน (เช่น พุธที่ 2)</option>
                        </select>
                        {repeatEvery && <>
                          <span className="text-xs text-slate-500">ทุก</span>
                          <input type="number" min={1} max={30} value={repeatN} onChange={(e) => setRepeatN(Number(e.target.value))} className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-sm" aria-label="ทุกกี่รอบ" />
                        </>}
                      </div>
                      {repeatEvery === "month_nth" && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                          <select value={repeatWd} onChange={(e) => setRepeatWd(Number(e.target.value))} aria-label="วันในสัปดาห์" className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                            {WEEKDAY_TH.map((w, i) => <option key={w} value={i}>{w}</option>)}
                          </select>
                          <span>ที่</span>
                          <select value={repeatNth} onChange={(e) => setRepeatNth(Number(e.target.value))} aria-label="สัปดาห์ที่" className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                            {[1, 2, 3, 4].map((k) => <option key={k} value={k}>{k}</option>)}
                          </select>
                          <span>ของเดือน</span>
                        </div>
                      )}
                      {repeatEvery && <p className="mt-1 text-[11px] text-slate-400">ติ๊กเสร็จแล้วระบบสร้างรอบถัดไปให้เอง{repeatEvery === "month_nth" ? ` — รอบหน้า = ${WEEKDAY_TH[repeatWd]}ที่ ${repeatNth} ของเดือนถัดไป` : ""}</p>}
                    </div>
                  )} /></div>
              </div>
              <div className={row}><span className={rowLbl}><Icon name="waiting" /> รอคนอื่น</span>
                <div className="min-w-0 flex-1"><InlineField filled={waitingOn} disabled={ro} emptyLabel="รออะไร / รอใคร" emptyText="ไม่ได้รอ"
                  display={<span className="text-sm text-amber-800">รอ{waitingNote.trim() ? `: ${waitingNote.trim()}` : ""}{item.plan.waiting ? ` · ${waitingDays(item.plan.waiting.since)} วัน` : ""}</span>}
                  editor={() => (
                    <div className="space-y-1.5">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={waitingOn} onChange={(e) => setWaitingOn(e.target.checked)} className="h-3.5 w-3.5 accent-amber-500" /> รอคนอื่นอยู่
                      </label>
                      <input value={waitingNote} onChange={(e) => { setWaitingNote(e.target.value); if (!waitingOn) setWaitingOn(true); }} maxLength={120}
                        placeholder="รออะไร / รอใคร เช่น รอลูกค้าตอบ" className={field} />
                    </div>
                  )} /></div>
              </div>
            </div>

            {/* โน้ต — พิมพ์ได้ตลอด (เจ้าของขอ 2026-11-16) */}
            <div className={`${card} order-3 p-3 md:order-none`}>
              <label className={lbl}><Icon name="note" /> โน้ต <span className="font-normal text-slate-400">· พิมพ์ได้เลย · กดปุ่ม bullet หรือพิมพ์ &quot;- &quot; ขึ้นต้นบรรทัด</span></label>
              <RichTextEditor toolbar="basic" value={note} onChange={setNote} editable={canEdit} minHeight={88} placeholder="รายละเอียดเพิ่มเติม…" />
            </div>
            <div className={`${card} order-5 p-3 md:order-none`}>
              <RecordFilesField entityType={TEAM_PLAN_FILES} entityId={item.id} readonly={!canEdit} title="รูป / ไฟล์แนบ"
                description="ลากไฟล์มาวาง หรือกดเลือก — เช่น แคปหน้าเว็บที่ต้องแก้ ใบเสนอราคา" />
            </div>
            <div className={`${card} order-6 p-2 md:order-none`}>
              <CommentThread entityType={TEAM_PLAN_FILES} entityId={item.id} title="คอมเมนต์" maxHeight={240} />
            </div>
            <div className="order-8 md:order-none">
              <button type="button" onClick={() => setShowHistory((s) => !s)} className="text-xs text-slate-500 hover:text-slate-800">
                {showHistory ? "▾" : "▸"} <Icon name="history" /> ประวัติของงานนี้ (ใครแก้ ใครเลื่อนกำหนด ใครติ๊ก)
              </button>
              {showHistory && <div className={`${card} mt-1.5 max-h-72 overflow-y-auto p-2`}><RecordHistoryInline entityType="record_task" entityId={item.id} emptyMessage="ยังไม่มีประวัติของงานนี้" /></div>}
            </div>
          </div>

          <div className="contents md:flex md:flex-col md:gap-3">
            {/* เช็กลิสต์ — คอลัมน์ขวา (เจ้าของขอ 2026-11-16) · ติ๊ก/เพิ่มแล้วบันทึกทันที */}
            <div className={`${card} order-2 p-3 md:order-none`}>
              <div className="mb-1 flex items-center gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-600"><Icon name="done" /> เช็กลิสต์</span>
                {prog.total > 0 && <>
                  <span className={`text-xs tabular-nums ${prog.allDone ? "text-emerald-700" : "text-slate-500"}`}>เสร็จ {prog.done}/{prog.total}</span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden><span className="block h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></span>
                </>}
                <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">ติ๊ก/เพิ่มแล้วบันทึกทันที</span>
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
            {/* 🖼 รูปปก = รูปเล็กหน้าการ์ดบนกระดานแผนงาน (เจ้าของเลือก 2026-11-16: แนบเอง → ไม่แนบใช้รูปของสิ่งที่ผูก) */}
            <div className={`${card} order-4 p-3 md:order-none`}>
              <label className={lbl}><Icon name="image" /> รูปปก <span className="font-normal text-slate-400">· รูปเล็กหน้าการ์ดบนกระดาน · ลากวาง / Ctrl+V / เลือกไฟล์</span></label>
              <ImageAttachKeys value={cover ? [cover] : []} onChange={(keys) => setCover(keys.length ? keys[keys.length - 1] : null)} folder="team-plan" maxSize={800} disabled={ro} />
              {!cover && (() => {
                const hit = item.plan.linked.find((r) => r.image);
                return <p className="mt-1 text-[11px] text-slate-400">{hit ? `ไม่แนบ = ใช้รูปของ "${hit.label}" ที่ผูกไว้` : "ไม่แนบ = ใช้รูปของสิ่งที่ผูกไว้บนกระดาน (ถ้ามี)"}</p>;
              })()}
            </div>
            {(item.plan.linked.length > 0 || item.plan.source) && (
              <div className={`${card} order-4 space-y-2 p-3 md:order-none`}>
                {item.plan.source && (
                  <a href={item.plan.source.href} className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><Icon name="link" /> เปิดเรื่องเดิม: {item.plan.source.label}</a>
                )}
                {item.plan.linked.length > 0 && (
                  <div>
                    <label className={lbl}><Icon name="magnet" /> ผูกไว้ {item.plan.linked.length} อย่าง <span className="font-normal text-slate-400">· ลากเส้นบนกระดานแผนงาน (ลบเส้น = เลิกผูก)</span></label>
                    <div className="flex flex-wrap gap-1.5">
                      {item.plan.linked.map((r) => {
                        const href = linkedHref(r);
                        return (
                          <span key={`${r.kind}:${r.id}`} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
                            <span className="shrink-0 text-indigo-400">{PLAN_LINK_KINDS[r.kind]?.label ?? r.kind}</span>
                            {href ? <a href={href} target="_blank" rel="noreferrer" className="truncate hover:underline">{r.label}</a> : <span className="truncate">{r.label}</span>}
                            {canEdit && <button type="button" disabled={busy} title="เลิกผูก (ถ้าเส้นบนกระดานยังอยู่ ระบบจะผูกกลับตอนกระดานบันทึก — ลบเส้นบนกระดานด้วย)"
                              onClick={() => void unlink(r)} className="shrink-0 rounded px-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-rose-600"><Icon name="cancel" /></button>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!done && <div className="order-7 md:order-none"><PersonalPlanRow item={item} /></div>}
            <div className="order-9 md:order-none">
              <p className="text-[11px] text-slate-400">สร้างโดย {item.created_by ?? "—"}{done && item.resolved_by ? ` · เสร็จโดย ${item.resolved_by}` : ""}{canEdit ? " · ช่องที่มีข้อมูลแล้ว ดับเบิลคลิกเพื่อแก้" : ""}</p>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
          </div>
        </div>
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
