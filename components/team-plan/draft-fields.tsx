"use client";
/**
 * ช่องตั้งค่างานใหม่ของแผนงานทีม (ของกลาง) — ความด่วน · กำหนด · ผู้รับผิดชอบ · เตือน · สำคัญ
 * ใช้ร่วม: แถบเพิ่มงานเร็วในหน้าแผนงาน + ป๊อป "ใส่แผนงาน" จากโมดูลอื่น (ใบงาน / Comment / SKU / โพสต์)
 */
import { useMemo, useState } from "react";
import { WhoChip, WhoPicker } from "@/components/record-tasks/checklist";
import { ERPDateTime24 } from "@/components/form";
import { PRIORITIES, PRIORITY_META, quickDue, REMIND_LABEL, REMIND_MODES, type Priority, type RemindMode } from "@/lib/team-plan";
import type { PlanDraft } from "@/lib/team-plan-client";

type DueKind = "today" | "tomorrow" | "friday" | "pick" | "none";
export type PlanDraftState = {
  priority: Priority; dueKind: DueKind; dueCustom: string; who: { id: string; name: string } | null; remind: RemindMode; important: boolean;
};

export function usePlanDraft(init: Partial<PlanDraftState> = {}) {
  const [s, setS] = useState<PlanDraftState>({ priority: "normal", dueKind: "tomorrow", dueCustom: "", who: null, remind: "before_1h", important: true, ...init });
  const set = (p: Partial<PlanDraftState>) => setS((cur) => ({ ...cur, ...p }));
  const dueIso = useMemo(() => (s.dueKind === "pick" ? (s.dueCustom ? new Date(`${s.dueCustom}:00+07:00`).toISOString() : null) : quickDue(s.dueKind)), [s.dueKind, s.dueCustom]);
  /** ตรวจก่อนส่ง — คืนข้อความเตือน (null = ผ่าน) */
  const problem = s.dueKind === "pick" && !dueIso ? "เลือกวันกำหนดก่อน หรือเลือก 'ไม่กำหนด'" : null;
  /** ค่าที่ส่ง API (ไม่เลือกคน = ตัวเอง) */
  const toDraft = (title: string, me: string | null, extra: Partial<PlanDraft> = {}): PlanDraft => ({
    title, priority: s.priority, due_at: dueIso, assigned_to: s.who?.id ?? (me || null),
    remind: dueIso ? s.remind : "none", important: s.important, ...extra,
  });
  return { s, set, dueIso, problem, toDraft };
}

export function PlanDraftFields({ draft, meName }: { draft: ReturnType<typeof usePlanDraft>; meName: string }) {
  const { s, set } = draft;
  const [picking, setPicking] = useState(false);
  const pc = (p: Priority) => `h-7 rounded-full border px-2.5 text-xs ${s.priority === p ? "font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
        <span className="flex flex-wrap items-center gap-1">ความด่วน
          {PRIORITIES.map((p) => (
            <button key={p} type="button" onClick={() => set({ priority: p })} className={pc(p)}
              style={s.priority === p ? { borderColor: PRIORITY_META[p].color, color: PRIORITY_META[p].color, background: `${PRIORITY_META[p].color}14` } : undefined}>
              {PRIORITY_META[p].label}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-1">กำหนด
          <select value={s.dueKind} onChange={(e) => set({ dueKind: e.target.value as DueKind })} className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs">
            <option value="today">วันนี้</option><option value="tomorrow">พรุ่งนี้</option><option value="friday">ศุกร์นี้</option>
            <option value="pick">เลือกวัน…</option><option value="none">ไม่กำหนด</option>
          </select>
          {s.dueKind === "pick" && <ERPDateTime24 value={s.dueCustom} onChange={(v) => set({ dueCustom: v })} defaultTime="18:00" />}
        </span>
        <span className="flex items-center gap-1">ใคร
          <WhoChip name={s.who?.name ?? (meName ? `${meName} (ฉัน)` : null)} onClick={() => setPicking((p) => !p)} title="เลือกผู้รับผิดชอบ" />
        </span>
        {s.dueKind !== "none" && (
          <span className="flex items-center gap-1">เตือน
            <select value={s.remind} onChange={(e) => set({ remind: e.target.value as RemindMode })} className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs">
              {REMIND_MODES.map((m) => <option key={m} value={m}>{REMIND_LABEL[m]}</option>)}
            </select>
          </span>
        )}
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={s.important} onChange={(e) => set({ important: e.target.checked })} className="h-3.5 w-3.5 accent-violet-600" /> สำคัญ</label>
      </div>
      {picking && <WhoPicker allowNone={!!s.who} onCancel={() => setPicking(false)} onPick={(u) => { set({ who: u }); setPicking(false); }} />}
    </>
  );
}
