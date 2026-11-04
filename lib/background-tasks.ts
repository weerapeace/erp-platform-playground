/**
 * background-tasks — งานที่วิ่งเบื้องหลัง + กล่องสถานะมุมจอ (ของกลาง)
 *   เรียก runBackgroundTask({ label, total, run }) → งานวิ่งต่อแม้ปิดโมดัล/เปลี่ยนหน้า
 *   <BackgroundTasksHost/> (mount ครั้งเดียวใน layout) จะโชว์ความคืบหน้าเป็นกล่องเล็กมุมขวาล่าง
 *   store แบบ module-level (ไม่ผูก React) → โค้ดที่ไหนก็ import ไปเรียกได้
 */
export type BgTaskStatus = "running" | "success" | "error";
/** ปุ่มบนกล่องตอนงานจบ (เช่น "เปิดอัลบั้ม") */
export type BgAction = { label: string; run: () => void };
export type BgTask = { id: string; label: string; done: number; total: number; status: BgTaskStatus; message?: string; unit?: string; action?: BgAction };

let _tasks: BgTask[] = [];
const _listeners = new Set<() => void>();
let _seq = 0;

const emit = () => { _listeners.forEach((l) => l()); };

export function subscribeBgTasks(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}
export function getBgTasks(): BgTask[] { return _tasks; }
export function dismissBgTask(id: string): void { _tasks = _tasks.filter((t) => t.id !== id); emit(); }

// เริ่มงานเบื้องหลัง — run รับ report(done,total?) ไว้อัปเดตความคืบหน้า · คืน {ok,fail,message} ตอนจบ
export function runBackgroundTask(opts: {
  label: string;
  total?: number;
  /** หน่วยต่อท้ายตัวเลขความคืบหน้า เช่น "MB" (ไม่ใส่ = นับเป็นรายการ) */
  unit?: string;
  /** จบแล้วค้างกล่องไว้จนผู้ใช้กดปิด (ค่าเริ่ม = หายเองใน 6 วิ / ผิดพลาด 15 วิ) — งานยาวที่คนมักสลับไปทำอย่างอื่น */
  keepOnDone?: boolean;
  /** ปุ่มบนกล่องตอนงานจบ */
  action?: BgAction;
  run: (report: (done: number, total?: number) => void) => Promise<{ ok?: number; fail?: number; message?: string } | void>;
}): void {
  const id = `bg-${++_seq}-${Date.now()}`;
  _tasks = [..._tasks, { id, label: opts.label, done: 0, total: opts.total ?? 0, status: "running", unit: opts.unit }];
  emit();

  const patch = (p: Partial<BgTask>) => { _tasks = _tasks.map((t) => (t.id === id ? { ...t, ...p } : t)); emit(); };
  const report = (done: number, total?: number) => patch({ done, ...(total != null ? { total } : {}) });
  const autoDismiss = (ms: number) => { if (!opts.keepOnDone) setTimeout(() => dismissBgTask(id), ms); };

  Promise.resolve()
    .then(() => opts.run(report))
    .then((res) => {
      const r = res || {};
      const fail = r.fail ?? 0;
      const doneCount = r.ok ?? _tasks.find((t) => t.id === id)?.total ?? 0;
      patch({
        status: fail ? "error" : "success",
        done: doneCount, total: doneCount + fail || doneCount,
        message: r.message ?? (fail ? `สำเร็จ ${r.ok ?? 0} · ล้มเหลว ${fail}` : `เสร็จแล้ว${r.ok != null ? ` ${r.ok} รายการ` : ""}`),
        action: opts.action,
      });
      autoDismiss(fail ? 15000 : 6000);
    })
    .catch((e) => {
      patch({ status: "error", message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด", action: opts.action });
      autoDismiss(15000);
    });
}
