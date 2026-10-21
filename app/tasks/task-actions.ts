// ============================================================
// task-actions — ตรรกะเปลี่ยนสถานะงาน (workflow) ใช้ร่วมหน้า /tasks + canvas + แคมเปญ + ปฏิทิน + drawer
// ============================================================
import { transitionBetween, statusMeta } from "./use-statuses";
import { approveTask, transitionTask, type ApiError, type CreativeTask } from "./data";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { tr as lang } from "@/lib/lang";
import { type PushToast } from "@/components/toast";

type ToastFn = PushToast;   // ชนิดกลาง (components/toast)

/**
 * ส่งคำสั่งเปลี่ยนสถานะ — ถ้า server ตอบว่า "ปิดงานไม่ได้ ยังมีงานย่อยค้าง" (409 open_subtasks)
 * → ถามผู้ใช้ก่อน แล้วส่งซ้ำพร้อมยืนยันให้ยกเลิกงานย่อยที่ค้าง · คืน false ถ้าผู้ใช้เลือกกลับไปก่อน
 */
async function withOpenSubtaskCheck(run: (closeOpen: boolean) => Promise<unknown>): Promise<boolean> {
  try { await run(false); return true; }
  catch (e) {
    const err = e as ApiError;
    if (err.code !== "open_subtasks") throw e;
    const open = Number(err.data?.open ?? 0), submitted = Number(err.data?.submitted ?? 0);
    const ok = await askConfirm({
      title: lang("ยังมีงานย่อยที่ยังไม่จบ", "Some subtasks are still open"),
      message: lang(
        `งานย่อยค้าง ${open} ชิ้น${submitted ? ` (รอตรวจ ${submitted} ชิ้น)` : ""} — ถ้าปิดงานตอนนี้ งานย่อยเหล่านี้จะถูกยกเลิก และรูป/ข้อความที่ส่งมาจะไม่เข้าหน้าสินค้า`,
        `${open} subtask(s) still open${submitted ? ` (${submitted} awaiting review)` : ""}. Closing now cancels them, and submitted images/text won't reach the product.`,
      ),
      variant: "danger",
      confirmText: lang("ยกเลิกงานย่อยที่ค้าง แล้วปิดงาน", "Cancel them and close"),
      cancelText: lang("กลับไปตรวจก่อน", "Go back"),
    });
    if (!ok) return false;
    await run(true);
    return true;
  }
}

/** ทำการเปลี่ยนสถานะ (approve/reject/revise/block/move) — คืน true ถ้าสำเร็จ (ผู้เรียก reload เอง) */
export async function applyTaskTransition(task: CreativeTask, toKey: string, opts: { pushToast: ToastFn; force?: boolean }): Promise<boolean> {
  const { pushToast, force } = opts;
  try {
    let done: boolean;
    if (force) done = await withOpenSubtaskCheck((c) => transitionTask(task.id, toKey, undefined, true, c));
    else {
      const t = transitionBetween(task.status, toKey);
      if (!t) { pushToast("error", `เปลี่ยน "${statusMeta(task.status).label}" → "${statusMeta(toKey).label}" ไม่ได้`); return false; }
      if (t.kind === "approve") done = await withOpenSubtaskCheck((c) => approveTask(task.id, "approve", undefined, toKey, c));
      else if (t.kind === "reject" || t.kind === "revise") {
        // กด "ยกเลิก" = ไม่ทำอะไรเลย (เดิมใช้ window.prompt แล้วค่าว่าง → ระบบยังตีกลับงานโดยไม่มีเหตุผล)
        const reject = t.kind === "reject";
        const comment = await askText({
          title: reject ? lang("เหตุผลที่ไม่ผ่าน", "Reason for rejecting") : lang("สิ่งที่ต้องแก้", "What needs fixing"),
          message: `${task.task_no ? task.task_no + " " : ""}${task.title}`,
          placeholder: reject ? lang("เช่น รูปไม่ตรงบรีฟ", "e.g. images don't match the brief") : lang("เช่น ขอรูปพื้นหลังขาว 3 รูป", "e.g. need 3 images on white background"),
          required: true, variant: reject ? "danger" : "default",
          confirmText: reject ? lang("ไม่ผ่าน", "Reject") : lang("ส่งกลับให้แก้", "Send back"),
        });
        if (comment === null) return false;
        done = await withOpenSubtaskCheck((c) => approveTask(task.id, t.kind as "reject" | "revise", comment, toKey, c));
      } else if (t.kind === "block") {
        const reason = await askText({ title: lang("ติดปัญหาเรื่องอะไร?", "What's blocking this?"), message: task.title, required: true, confirmText: lang("บันทึก", "Save") });
        if (reason === null) return false;
        done = await withOpenSubtaskCheck((c) => transitionTask(task.id, toKey, reason, false, c));
      } else done = await withOpenSubtaskCheck((c) => transitionTask(task.id, toKey, undefined, false, c));
    }
    if (!done) return false;
    pushToast("success", `→ ${statusMeta(toKey).label}`);
    return true;
  } catch (e) { pushToast("error", (e as Error).message); return false; }
}
