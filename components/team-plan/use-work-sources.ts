"use client";
/**
 * 🧩 โหลดงานค้างจากระบบอื่นมาวางบน Canvas ผังระบบ (งาน Task + ใบงานออกแบบ) — ใช้ API เดิมของแต่ละระบบ (สิทธิ์ตามระบบนั้น)
 *   งาน Task  = /api/creative-tasks (tasks.view) · สถานะ/ป้าย/เส้นทาง = useCreativeStatuses (ของกลาง Task Manager)
 *   ใบงาน     = /api/design-sheets?limit=500 (products.view) · สถานะปิด = is_terminal จาก /api/design-sheets/statuses
 *   ไม่มีสิทธิ์ระบบไหน = ไม่โหลดระบบนั้น (แท็บนั้นในถาดซ่อน) · แปลงรูปเป็น WorkItem ที่ lib/work-canvas
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { listTasks, type CreativeTask } from "@/app/tasks/data";
import { isTerminal, statusLabel as taskStatusLabel, useCreativeStatuses } from "@/app/tasks/use-statuses";
import { SHEET_CLOSED_FALLBACK, sheetToWork, taskToWork, type SheetRow, type WorkItem } from "@/lib/work-canvas";

type SheetStatusRow = { state_key: string; label: string; is_terminal: boolean };

export type WorkSources = {
  canTasks: boolean;
  canSheets: boolean;
  tasks: WorkItem[];
  sheets: WorkItem[];
  /** แถวงาน Task ตัวเต็ม (ใช้เปลี่ยนสถานะผ่านกฎเดิม applyTaskTransition) */
  taskRows: Map<string, CreativeTask>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useWorkSources(enabled: boolean): WorkSources {
  const canTasks = usePermission("tasks.view");
  const canSheets = usePermission("products.view");
  useCreativeStatuses();   // โหลดสถานะ/เส้นทางของงาน Task เข้าทะเบียนกลาง (ป้ายสถานะ + เปลี่ยนสถานะใช้ต่อ)
  const [taskRaw, setTaskRaw] = useState<CreativeTask[]>([]);
  const [sheetRaw, setSheetRaw] = useState<SheetRow[]>([]);
  const [sheetStatuses, setSheetStatuses] = useState<SheetStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError(null);
    const errs: string[] = [];
    await Promise.all([
      canTasks ? listTasks().then(setTaskRaw).catch((e) => { errs.push(`งาน Task: ${e instanceof Error ? e.message : "โหลดไม่ได้"}`); }) : Promise.resolve(),
      canSheets ? Promise.all([
        apiFetch("/api/design-sheets?limit=500").then((r) => r.json()),
        apiFetch("/api/design-sheets/statuses").then((r) => r.json()).catch(() => ({ data: [] })),
      ]).then(([s, st]) => {
        if (s?.error) throw new Error(String(s.error));
        setSheetRaw(Array.isArray(s?.data) ? (s.data as SheetRow[]) : []);
        if (Array.isArray(st?.data)) setSheetStatuses(st.data as SheetStatusRow[]);
      }).catch((e) => { errs.push(`ใบงาน: ${e instanceof Error ? e.message : "โหลดไม่ได้"}`); }) : Promise.resolve(),
    ]);
    setError(errs.length ? errs.join(" · ") : null);
    setLoading(false);
  }, [enabled, canTasks, canSheets]);

  useEffect(() => { void reload(); }, [reload]);

  const tasks = useMemo(() => taskRaw
    .filter((r) => r.is_active !== false && !isTerminal(r.status))
    .map((r) => taskToWork(r, taskStatusLabel))
    .filter((w): w is WorkItem => !!w), [taskRaw]);
  const taskRows = useMemo(() => new Map(taskRaw.map((r) => [r.id, r])), [taskRaw]);

  const sheets = useMemo(() => {
    const closed = sheetStatuses.length ? new Set(sheetStatuses.filter((s) => s.is_terminal).map((s) => s.state_key)) : SHEET_CLOSED_FALLBACK;
    const label = new Map(sheetStatuses.map((s) => [s.state_key, s.label]));
    return sheetRaw.map((r) => sheetToWork(r, (s) => label.get(s) ?? s, closed)).filter((w): w is WorkItem => !!w);
  }, [sheetRaw, sheetStatuses]);

  return { canTasks, canSheets, tasks, sheets, taskRows, loading, error, reload };
}
