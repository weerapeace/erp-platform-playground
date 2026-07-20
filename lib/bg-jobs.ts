// ของกลาง: งานเบื้องหลัง (background jobs)
// เริ่มงานยาว ๆ (เช่น สร้างโฟลเดอร์ Drive + อัปไฟล์) แล้วโชว์ "ชิปงาน" ลอยมุมจอ
// บอกสถานะ กำลังทำ / เสร็จ / ผิดพลาด — ผู้ใช้ปิด popup แล้วทำอย่างอื่นต่อได้ระหว่างรอ
// ใช้คู่กับ <BgJobsDock/> (components/bg-jobs-dock.tsx) ที่ mount ไว้ระดับหน้า
//
// การใช้งาน:
//   runBgJob("TTM119", () => syncTaskDrive(id, opts), {
//     hint: "กำลังอัปไฟล์ขึ้น Drive…",
//     onDone: (r) => ({ detail: `อัป ${r.uploaded} รูป`, href: r.url ?? undefined }),
//     onError: (e) => pushToast("error", e.message),
//   });

export type BgJobStatus = "running" | "done" | "error";

export type BgJob = {
  id: string;
  label: string;         // ชื่อสั้น ๆ ของงาน (เช่น ชื่อโฟลเดอร์)
  hint?: string;         // คำอธิบายสั้น ๆ ระหว่างทำ
  detail?: string;       // ผลลัพธ์/ข้อความตอนเสร็จหรือ error
  href?: string;         // ลิงก์เปิดผลลัพธ์ (เช่น โฟลเดอร์ Drive)
  status: BgJobStatus;
  startedAt: number;
  endedAt?: number;
};

type Listener = (jobs: BgJob[]) => void;

let jobs: BgJob[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit(): void {
  const snapshot = jobs.slice();
  listeners.forEach((l) => l(snapshot));
}

/** subscribe รายการงาน (คืน unsubscribe) — เรียก listener ทันทีด้วยสถานะปัจจุบัน */
export function subscribeBgJobs(l: Listener): () => void {
  listeners.add(l);
  l(jobs.slice());
  return () => { listeners.delete(l); };
}

export function getBgJobs(): BgJob[] { return jobs.slice(); }

export function dismissBgJob(id: string): void {
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

function patch(id: string, p: Partial<BgJob>): void {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
  emit();
}

/**
 * เริ่มงานเบื้องหลัง: โชว์ชิป "กำลังทำ" ทันที, พอ promise เสร็จ → "เสร็จ"/"ผิดพลาด"
 * สำคัญ: run() เป็น fetch ปกติ จะทำงานต่อแม้ component ที่กดจะ unmount ไปแล้ว
 * (สถานะเก็บใน store ระดับโมดูล ไม่ผูกกับ component)
 * คืน promise ที่ resolve เป็นผล (หรือ null ถ้า error — จับไว้แล้ว ไม่ throw)
 */
export function runBgJob<T>(
  label: string,
  run: () => Promise<T>,
  opts?: {
    hint?: string;
    onDone?: (r: T) => { detail?: string; href?: string } | void;
    onError?: (e: Error) => void;
    autoDismissMs?: number;   // ลบชิป "เสร็จ" เองหลัง N ms (default 60000 · 0 = ไม่ลบเอง)
  },
): Promise<T | null> {
  const id = `bg_${++seq}_${Date.now()}`;
  jobs = [...jobs, { id, label, hint: opts?.hint, status: "running", startedAt: Date.now() }];
  emit();
  return run().then(
    (r) => {
      const meta = opts?.onDone?.(r) || {};
      patch(id, { status: "done", endedAt: Date.now(), detail: meta.detail, href: meta.href });
      const ms = opts?.autoDismissMs ?? 60000;
      if (ms > 0) setTimeout(() => dismissBgJob(id), ms);
      return r;
    },
    (e: unknown) => {
      const err = e instanceof Error ? e : new Error(String(e));
      opts?.onError?.(err);
      patch(id, { status: "error", endedAt: Date.now(), detail: err.message });
      return null;
    },
  );
}
