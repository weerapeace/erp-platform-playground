"use client";
/**
 * แท็บ "Task" ในศูนย์แจ้งเตือน (ตัว Pet) — งาน Task Manager ที่รอฉัน (GET /api/creative-tasks/inbox · lib/task-inbox)
 *   กลุ่ม: รอคุณตรวจ · ต้องแก้ (ของคุณ) · มอบให้คุณ — งานค้างเกิน 30 วันพับไว้
 *   ปุ่มลัดงานรอตรวจ: อนุมัติ (ยืนยันในบรรทัด) · ตีกลับแก้ (เปิดแผงตรวจเร็วที่ฟอร์มตีกลับ) · ตรวจเร็ว · เปิดงาน
 *   ปุ่มชุดเดียวกับลิ้นชักงาน: สิทธิ์ tasks.approve + เส้นทางสถานะจริง · งานที่สถานะมาจากงานย่อย คนทั่วไปไม่มีปุ่มอนุมัติ
 *   เปลี่ยนสถานะผ่านของกลาง applyTaskTransition (เช็กงานย่อยค้าง + บันทึกประวัติฝั่ง server)
 * TaskInboxQuickCheck = แผงตรวจเร็ว (ProductQuickCheck ผ่าน TaskQuickCheck) — WorkPopupHost วางไว้นอกการ์ด (การ์ดยุบแล้วแผงไม่หาย)
 * ไฟล์นี้โหลดแบบ dynamic จาก WorkPopupHost (ไม่ถ่วงทุกหน้า)
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { usePushToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import { dueLabel, INBOX_GROUPS, splitStale, todayBkk, type InboxGroup, type InboxItem, type InboxPayload } from "@/lib/task-inbox";
import { transitionsFrom, useCreativeStatuses } from "@/app/tasks/use-statuses";
import { applyTaskTransition } from "@/app/tasks/task-actions";
import { TaskQuickCheck } from "@/app/tasks/task-quick-check";
import type { CreativeTask } from "@/app/tasks/data";

const TaskImagesViewer = dynamic(() => import("@/app/tasks/task-images-viewer").then((m) => m.TaskImagesViewer), { ssr: false });
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

export const taskHref = (id: string) => `/tasks?task=${id}`;

/** ปุ่มอนุมัติ/ตีกลับของงานนี้ (ชุดเดียวกับท้ายลิ้นชักงาน) */
function useInboxActions() {
  useCreativeStatuses();   // โหลดเส้นทางสถานะ (แคช 5 นาที) ให้ transitionsFrom / applyTaskTransition ใช้
  const { can, user } = useAuth();
  const canApprove = can("tasks.approve" as Parameters<typeof can>[0]);
  const isManager = user?.role === "admin" || user?.role === "manager";
  return (it: Pick<InboxItem, "status" | "has_subtasks">) => {
    if (!canApprove || (it.has_subtasks && !isManager)) return { approveTo: null as string | null, reviseTo: null as string | null };
    const tr = transitionsFrom(it.status);
    return { approveTo: tr.find((x) => x.kind === "approve")?.to_key ?? null, reviseTo: tr.find((x) => x.kind === "revise")?.to_key ?? null };
  };
}

function Row({ it, group, today, actionsOf, onGo, onQuickCheck, onChanged }: {
  it: InboxItem; group: InboxGroup; today: string;
  actionsOf: ReturnType<typeof useInboxActions>;
  onGo: (href: string) => void;
  onQuickCheck: (it: InboxItem, mode?: "revise") => void;
  onChanged: () => void;
}) {
  const pushToast = usePushToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const due = dueLabel(it.due_date, today);
  const { approveTo, reviseTo } = group === "review" ? actionsOf(it) : { approveTo: null, reviseTo: null };
  const approve = async () => {
    if (!approveTo) return;
    setBusy(true);
    try { if (await applyTaskTransition({ id: it.id, status: it.status, task_no: it.task_no, title: it.title } as CreativeTask, approveTo, { pushToast })) onChanged(); }
    finally { setBusy(false); setConfirm(false); }
  };
  const btn = "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium";
  return (
    <div className="flex gap-2.5 p-2">
      {it.cover_key
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={r2ImageUrl(it.cover_key, 120) ?? ""} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md border border-slate-200 bg-white object-contain" />
        : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300"><Icon name="list" /></div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1 truncate text-sm text-slate-800"><span className="text-slate-400">{it.task_no}</span> {it.title}</div>
          {it.checks != null && (it.checks > 0
            ? <span className="shrink-0 rounded-full bg-amber-50 px-1.5 text-[11px] text-amber-700" title="จุดที่ระบบเช็กเจอในข้อมูลสินค้า — กดตรวจเร็วเพื่อดู">เช็ก {it.checks}</span>
            : <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 text-[11px] text-emerald-700">ครบ</span>)}
        </div>
        <div className={`text-[11px] ${due.tone === "danger" ? "text-red-600" : due.tone === "warn" ? "text-amber-700" : "text-slate-400"}`}>{due.text}</div>
        <div className="truncate text-[11px] text-slate-400">{[it.brand, it.task_type, it.parent_code].filter(Boolean).join(" · ") || "—"}</div>
        {confirm ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-600">{it.checks ? `ยังมี ${it.checks} จุดที่เช็กเจอ · ` : ""}อนุมัติงานนี้?</span>
            <button type="button" disabled={busy} onClick={() => void approve()} className={`${btn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50`}>{busy ? "กำลังบันทึก…" : "ยืนยันอนุมัติ"}</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(false)} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>ไม่ใช่</button>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {approveTo && <button type="button" onClick={() => setConfirm(true)} className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}><Icon name="done" />อนุมัติ</button>}
            {reviseTo && <button type="button" onClick={() => onQuickCheck(it, "revise")} className={`${btn} border-orange-200 bg-white text-orange-700 hover:bg-orange-50`}><Icon name="back" />ตีกลับแก้</button>}
            {it.parent_code && <button type="button" onClick={() => onQuickCheck(it)} className={`${btn} border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700`}><Icon name="inspect" />ตรวจเร็ว</button>}
            <button type="button" onClick={() => onGo(taskHref(it.id))} className={`${btn} border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700`}>เปิดงาน <Icon name="open" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskInboxTab({ data, onGo, onQuickCheck, onChanged }: {
  data: InboxPayload | null;
  onGo: (href: string) => void;
  onQuickCheck: (it: InboxItem, mode?: "revise") => void;
  onChanged: () => void;
}) {
  const actionsOf = useInboxActions();
  const today = todayBkk();
  const groups = INBOX_GROUPS.filter((g) => (data?.[g.key].length ?? 0) > 0);
  const [pick, setPick] = useState<InboxGroup | null>(null);
  const [showStale, setShowStale] = useState(false);
  const active = groups.find((g) => g.key === pick)?.key ?? groups[0]?.key ?? null;
  if (!data || !active) return <div className="rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-700">ไม่มีงานรอคุณ เยี่ยมมาก</div>;
  const { recent, stale } = splitStale(data[active], today);
  const row = (it: InboxItem) => <Row key={it.id} it={it} group={active} today={today} actionsOf={actionsOf} onGo={onGo} onQuickCheck={onQuickCheck} onChanged={onChanged} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button key={g.key} type="button" onClick={() => { setPick(g.key); setShowStale(false); }}
            className={`h-7 rounded-full px-3 text-xs font-medium ${g.key === active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {g.label} {data[g.key].length}
          </button>
        ))}
      </div>
      {recent.length > 0 && <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{recent.map(row)}</div>}
      {stale.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowStale((v) => !v)} className="text-xs text-slate-500 hover:underline">
            {showStale ? "ซ่อน" : "แสดง"}งานค้างเกิน 30 วัน ({stale.length})
          </button>
          {showStale && <div className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{stale.map(row)}</div>}
        </div>
      )}
      <button type="button" onClick={() => onGo(active === "review" ? "/tasks/review" : "/tasks")} className="text-xs text-blue-700 hover:underline">ดูทั้งหมดในหน้าจัดการงาน →</button>
    </div>
  );
}

/** แผงตรวจเร็วของงานจากแท็บ Task (+ ดูรูป / เปิด Parent เต็มหน้า) — วางนอกการ์ดลอย */
export function TaskInboxQuickCheck({ item, mode, onClose, onDone }: {
  item: InboxItem; mode?: "revise"; onClose: () => void; onDone: () => void;
}) {
  const actionsOf = useInboxActions();
  const pushToast = usePushToast();
  const [imagesOpen, setImagesOpen] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const { approveTo, reviseTo } = actionsOf(item);
  return (
    <>
      <TaskQuickCheck task={{ id: item.id, status: item.status as CreativeTask["status"], task_no: item.task_no, title: item.title }}
        approveTo={approveTo} reviseTo={reviseTo} pushToast={pushToast} initialMode={mode}
        onClose={onClose} onDone={onDone} onViewImages={() => setImagesOpen(true)} onOpenParent={setParentId} />
      {imagesOpen && <TaskImagesViewer taskId={item.id} title={item.title} onClose={() => setImagesOpen(false)} />}
      {parentId && <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={parentId} onClose={() => setParentId(null)} />}
    </>
  );
}
