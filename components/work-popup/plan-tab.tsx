"use client";
/**
 * แท็บ "แผนงาน" ในศูนย์แจ้งเตือน (ตัว Pet) — งานแผนงานทีมของฉัน (GET /api/team-plan?mine=1 · กลุ่ม/คำพูด lib/team-plan-pet)
 *   แถบงานหลักวันนี้ x/3 · กลุ่ม เกินกำหนด → ครบวันนี้ → ถัดไป → รอคนอื่น → ยังไม่ถึง (พับ) · เสร็จวันนี้ (พับ)
 *   ปุ่ม: ติ๊กเสร็จ/เอากลับ · เตือนอีก 1 ชม. (กำหนดเดิม) · เลื่อนไปพรุ่งนี้ · ดาวงานหลัก (3 งาน/วัน) · เปิด (ป๊อปแก้งานเดิม — WorkPopupHost วางนอกการ์ด) · เพิ่มงานด่วน
 *   ทุกปุ่มผ่าน API เดิมของแผนงาน (PATCH/POST /api/team-plan — สิทธิ์ tasks.edit / tasks.create + บันทึกประวัติ)
 * ไฟล์นี้โหลดแบบ dynamic จาก WorkPopupHost (ไม่ถ่วงทุกหน้า)
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { usePushToast } from "@/components/toast";
import { PlanEditModal } from "@/components/team-plan/edit-modal";
import { dueLabel, isOverdue, isStarredToday, MAX_STARS, PRIORITY_META, waitingDays, type PlanItem } from "@/lib/team-plan";
import { createPlanItem, patchPlanItem, type PlanPatch } from "@/lib/team-plan-client";
import { groupMyPlan, PLAN_GROUPS, shiftToTomorrow, type PlanGroupKey } from "@/lib/team-plan-pet";
import { checklistProgress } from "@/lib/record-tasks";

const FOLDED: PlanGroupKey[] = ["later", "done"];

function Row({ t, group, canEdit, busy, onPatch, onOpen }: {
  t: PlanItem; group: PlanGroupKey; canEdit: boolean; busy: boolean;
  onPatch: (t: PlanItem, p: PlanPatch, ok: string) => void;
  onOpen: (t: PlanItem) => void;
}) {
  const done = t.status === "resolved";
  const starred = isStarredToday(t.plan);
  const due = t.due_at ? dueLabel(t.due_at) : "";
  const dueCls = isOverdue(t.due_at) ? "text-red-600" : group === "today" ? "text-amber-700" : "text-slate-400";
  const snoozed = t.snooze_until && Date.parse(t.snooze_until) > Date.now() ? new Date(Date.parse(t.snooze_until) + 7 * 3600e3).toISOString().slice(11, 16) : null;
  const btn = "inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50";
  return (
    <div className="flex items-start gap-2 p-2">
      <input type="checkbox" checked={done} disabled={!canEdit || busy} aria-label={done ? "เอากลับเป็นงานค้าง" : "ติ๊กเสร็จ"}
        onChange={() => onPatch(t, { status: done ? "open" : "resolved" }, done ? "เอากลับเป็นงานค้างแล้ว" : "ติ๊กเสร็จแล้ว")}
        className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" />
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_META[t.priority].color }} />{PRIORITY_META[t.priority].label}</span>
          {due && <span className={dueCls}>{due}</span>}
          {snoozed ? <span className="inline-flex items-center gap-0.5"><Icon name="notify" />เตือนอีกครั้ง {snoozed}</span>
            : t.plan.remind !== "none" && t.due_at && !done && !isOverdue(t.due_at) && <span className="inline-flex items-center gap-0.5"><Icon name="notify" />{{ before_1h: "ก่อน 1 ชม.", before_1d: "ก่อน 1 วัน", morning: "เช้าวันนั้น" }[t.plan.remind as "before_1h" | "before_1d" | "morning"]}</span>}
          {t.plan.waiting && <span className="text-amber-700">รอ{t.plan.waiting.note ? `: ${t.plan.waiting.note}` : ""} · {waitingDays(t.plan.waiting.since)} วัน</span>}
          {(() => { const p = checklistProgress(t.checklist); return p.total ? <span className={`inline-flex items-center gap-0.5 ${p.allDone ? "text-emerald-600" : ""}`} title="เช็กลิสต์ในงาน"><Icon name="done" />{p.done}/{p.total}</span> : null; })()}
        </div>
        {!done && canEdit && (
          <div className="mt-1 flex flex-wrap gap-1">
            {t.due_at && <button type="button" disabled={busy} onClick={() => onPatch(t, { snooze: "1h" }, "จะเตือนอีกครั้งใน 1 ชม.")} className={btn}><Icon name="clock" />เตือนอีก 1 ชม.</button>}
            {(group === "over" || group === "today") && <button type="button" disabled={busy} onClick={() => onPatch(t, { due_at: shiftToTomorrow(t.due_at) }, "เลื่อนกำหนดเป็นพรุ่งนี้แล้ว")} className={btn}>เลื่อนไปพรุ่งนี้</button>}
            <button type="button" onClick={() => onOpen(t)} className={btn}>เปิด <Icon name="open" /></button>
          </div>
        )}
      </div>
      {!done && (
        <button type="button" disabled={!canEdit || busy} onClick={() => onPatch(t, { star: !starred }, starred ? "เอาออกจากงานหลักวันนี้แล้ว" : "เป็นงานหลักวันนี้แล้ว")}
          aria-label={starred ? "เอาออกจากงานหลักวันนี้" : "ตั้งเป็นงานหลักวันนี้"} title="งานหลักวันนี้ (สูงสุด 3 งาน)"
          className={`shrink-0 text-base ${starred ? "text-amber-500" : "text-slate-300 opacity-35 grayscale hover:opacity-80 hover:grayscale-0"}`}><Icon name="star" /></button>
      )}
    </div>
  );
}

export function PlanTab({ items, me, onChanged, onOpen, onGo }: {
  items: PlanItem[] | null; me: string;
  onChanged: () => void;
  onOpen: (t: PlanItem) => void;
  onGo: (href: string) => void;
}) {
  const { can } = useAuth();
  const canEdit = can("tasks.edit" as Parameters<typeof can>[0]);
  const canCreate = can("tasks.create" as Parameters<typeof can>[0]);
  const pushToast = usePushToast();
  const [local, setLocal] = useState<Record<string, PlanItem>>({});   // ผลลัพธ์ล่าสุดจากปุ่ม (ระหว่างรอโหลดใหม่)
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<PlanGroupKey>>(new Set());
  const [draft, setDraft] = useState("");
  const [addErr, setAddErr] = useState("");
  const [adding, setAdding] = useState(false);
  const merged = useMemo(() => (items ?? []).map((t) => local[t.id] ?? t), [items, local]);
  const g = useMemo(() => groupMyPlan(merged, me), [merged, me]);
  const stars = merged.filter((t) => t.status !== "resolved" && isStarredToday(t.plan)).length;

  const patch = async (t: PlanItem, p: PlanPatch, ok: string) => {
    setBusyId(t.id);
    try {
      const r = await patchPlanItem(t.id, p);
      setLocal((m) => ({ ...m, [t.id]: r.item }));
      pushToast("success", r.next ? `${ok} · สร้างรอบถัดไปแล้ว` : ok);
      onChanged();
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusyId(null); }
  };
  const add = async () => {
    const title = draft.trim();
    if (!title) { setAddErr("พิมพ์ชื่องานก่อนกด Enter"); return; }
    setAdding(true);
    try { await createPlanItem({ title, assigned_to: me, priority: "normal" }); setDraft(""); pushToast("success", "เพิ่มเป็นงานของคุณแล้ว"); onChanged(); }
    catch (e) { setAddErr((e as Error).message); }
    finally { setAdding(false); }
  };

  const any = PLAN_GROUPS.some((x) => g[x.key].length > 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        <Icon name="star" /><span>งานหลักวันนี้ {stars}/{MAX_STARS}</span><span className="flex-1" />
        {stars < MAX_STARS && <span className="text-[11px] text-amber-700">กดดาวที่งานเพื่อเลือก</span>}
      </div>
      {!any && <div className="rounded-xl bg-emerald-50 p-4 text-center text-sm text-emerald-700">ไม่มีงานค้างในแผนงานของคุณ</div>}
      {PLAN_GROUPS.map((sec) => {
        const list = g[sec.key];
        if (!list.length) return null;
        const folded = FOLDED.includes(sec.key) && !open.has(sec.key);
        return (
          <section key={sec.key}>
            <button type="button" disabled={!FOLDED.includes(sec.key)} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(sec.key)) n.delete(sec.key); else n.add(sec.key); return n; })}
              className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${sec.key === "over" ? "text-red-600" : "text-slate-600"}`}>
              <Icon name={sec.icon} />{sec.label} <span className="font-normal text-slate-400">{list.length}</span>
              {FOLDED.includes(sec.key) && <span className="font-normal text-slate-400">· {folded ? "แสดง" : "ซ่อน"}</span>}
            </button>
            {!folded && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {list.map((t) => <Row key={t.id} t={t} group={sec.key} canEdit={canEdit} busy={busyId === t.id} onPatch={(x, p, ok) => void patch(x, p, ok)} onOpen={onOpen} />)}
              </div>
            )}
          </section>
        );
      })}
      {canCreate && (
        <div>
          <input value={draft} disabled={adding} onChange={(e) => { setDraft(e.target.value); setAddErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void add(); }}
            placeholder="เพิ่มงานด่วน เช่น โทรตามช่างเย็บ แล้วกด Enter"
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-indigo-400 focus:outline-none" />
          {addErr && <p className="mt-1 text-xs text-red-600">{addErr}</p>}
        </div>
      )}
      <button type="button" onClick={() => onGo("/tasks/plan")} className="text-xs text-blue-700 hover:underline">เปิดแผนงานทั้งทีม →</button>
    </div>
  );
}

/** ป๊อปแก้งาน (ตัวเดิมของหน้าแผนงาน) — WorkPopupHost วางไว้นอกการ์ด */
export function PlanItemEditor({ item, me, onClose, onDone }: { item: PlanItem; me: string; onClose: () => void; onDone: () => void }) {
  const { can } = useAuth();
  return (
    <PlanEditModal item={item} me={me} canEdit={can("tasks.edit" as Parameters<typeof can>[0])}
      onClose={onClose} onSaved={() => { onDone(); onClose(); }} onDeleted={() => { onDone(); onClose(); }} onChecklist={() => onDone()} onDuplicated={() => { onDone(); onClose(); }} />
  );
}
