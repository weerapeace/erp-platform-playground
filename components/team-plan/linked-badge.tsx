"use client";
/**
 * 🔗 ป้าย "อยู่ในแผนงาน N งาน" (ของกลาง) — โชว์กลับในเรื่องที่ถูกผูกกับงานในแผนงานทีม
 *   <PlanLinkedBadge kind="design_sheet" id={sheet.id} />
 *   นับทั้งงานที่ผูกด้วยเส้นบนกระดานแผนงาน (metadata.plan.linked) และงานที่สร้างด้วยปุ่ม "ใส่แผนงาน" ของเรื่องนั้น
 *   กดแล้วกางรายการ → เปิดงานในหน้าแผนงาน (แท็บใหม่) · ไม่มีงาน / ไม่มีสิทธิ์ tasks.view = ไม่โชว์อะไรเลย
 *   ชนิด (kind) = ชนิดการ์ดบนกระดาน (lib/team-plan PLAN_LINK_KINDS) · API: GET /api/team-plan?linked=<kind>:<id>
 * ใช้แล้วที่: ป๊อปใบงานออกแบบ (แถบหัว) · ป๊อปโพสต์คอนเทนต์ · ป๊อปงาน (Task)
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { dueLabel, isOverdue, isPlanDone, type PlanItem } from "@/lib/team-plan";
import { listLinkedPlanItems } from "@/lib/team-plan-client";

export function PlanLinkedBadge({ kind, id, className }: { kind: string; id: string | null | undefined; className?: string }) {
  const { can } = useAuth();
  const allowed = can("tasks.view");
  const [list, setList] = useState<PlanItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!allowed || !id) { setList(null); return; }
    let alive = true;
    listLinkedPlanItems(kind, id).then((l) => { if (alive) setList(l); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [allowed, kind, id]);
  if (!allowed || !id || !list?.length) return null;
  const pending = list.filter((t) => !isPlanDone(t)).length;
  return (
    <div ref={boxRef} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="งานในแผนงานทีมที่ผูกกับเรื่องนี้"
        className={className ?? "inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"}>
        <Icon name="magnet" /> อยู่ในแผนงาน {list.length} งาน{pending < list.length ? ` · ค้าง ${pending}` : ""}
      </button>
      <FloatingDropdown anchorRef={boxRef} open={open} onClose={() => setOpen(false)} minWidth={260} maxWidth={360}>
        <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl">
          {list.map((t) => {
            const done = isPlanDone(t);
            return (
              <a key={t.id} href={`/tasks/plan?item=${encodeURIComponent(t.id)}`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
                className="block px-3 py-2 hover:bg-slate-50">
                <span className={`block text-sm ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</span>
                <span className="block text-[11px] text-slate-400">
                  {done ? "เสร็จแล้ว" : t.due_at ? <span className={isOverdue(t.due_at) ? "text-rose-600" : ""}>{dueLabel(t.due_at)}</span> : "ไม่มีกำหนด"}
                  {t.assigned_name ? ` · ${t.assigned_name}` : ""}
                </span>
              </a>
            );
          })}
        </div>
      </FloatingDropdown>
    </div>
  );
}
