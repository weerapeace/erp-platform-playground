// ============================================================
// task-actions — ตรรกะเปลี่ยนสถานะงาน (workflow) ใช้ร่วมหน้า /tasks + canvas
// ============================================================
import { transitionBetween, statusMeta } from "./use-statuses";
import { approveTask, transitionTask, type CreativeTask } from "./data";

type ToastFn = (type: "success" | "error" | "info", m: string) => void;

/** ทำการเปลี่ยนสถานะ (approve/reject/revise/block/move) — คืน true ถ้าสำเร็จ (ผู้เรียก reload เอง) */
export async function applyTaskTransition(task: CreativeTask, toKey: string, opts: { pushToast: ToastFn; force?: boolean }): Promise<boolean> {
  const { pushToast, force } = opts;
  try {
    if (force) { await transitionTask(task.id, toKey, undefined, true); pushToast("success", `→ ${statusMeta(toKey).label}`); return true; }
    const tr = transitionBetween(task.status, toKey);
    if (!tr) { pushToast("error", `เปลี่ยน "${statusMeta(task.status).label}" → "${statusMeta(toKey).label}" ไม่ได้`); return false; }
    if (tr.kind === "approve") await approveTask(task.id, "approve", undefined, toKey);
    else if (tr.kind === "reject" || tr.kind === "revise") { const c = (typeof window !== "undefined" && window.prompt(tr.kind === "reject" ? "เหตุผลที่ไม่ผ่าน:" : "สิ่งที่ต้องแก้:")) || ""; await approveTask(task.id, tr.kind as "reject" | "revise", c, toKey); }
    else if (tr.kind === "block") { const reason = (typeof window !== "undefined" && window.prompt("ติดปัญหาเรื่องอะไร?")) || ""; await transitionTask(task.id, toKey, reason); }
    else await transitionTask(task.id, toKey);
    pushToast("success", `→ ${statusMeta(toKey).label}`);
    return true;
  } catch (e) { pushToast("error", (e as Error).message); return false; }
}
