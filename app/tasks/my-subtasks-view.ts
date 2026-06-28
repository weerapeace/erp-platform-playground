// ============================================================
// การจัดเรียง/จัดกลุ่ม "งานย่อยของฉัน" (ของกลาง) — admin ตั้งค่ากลาง (ui_config) ใช้กับทุกคน
// จัดกลุ่ม: ไม่จัด / ตามสถานะ · เรียงหลายชั้น เช่น 1.ความสำคัญ 2.กำหนดส่ง
// ============================================================
import { apiFetch } from "@/lib/api";
import { PRIORITY_RANK, type MySubtask } from "./data";

export type MySubSort = "priority" | "deadline" | "status" | "none";
export type MySubGroupBy = "none" | "status";
export type MySubView = { groupBy: MySubGroupBy; sort1: MySubSort; sort2: MySubSort };
export const DEFAULT_MYSUB_VIEW: MySubView = { groupBy: "status", sort1: "priority", sort2: "deadline" };
export const MYSUB_VIEW_KEY = "tasks_my_subtasks_view";

export function mergeMySubView(v: unknown): MySubView {
  const o = (v ?? {}) as Partial<MySubView>;
  return { groupBy: o.groupBy ?? DEFAULT_MYSUB_VIEW.groupBy, sort1: o.sort1 ?? DEFAULT_MYSUB_VIEW.sort1, sort2: o.sort2 ?? DEFAULT_MYSUB_VIEW.sort2 };
}

// ลำดับสถานะงานย่อย: กำลังทำบนสุด → ยังไม่เริ่ม → รออนุมัติ → ขอแก้ → อื่น ๆ → ยกเลิก
const STATUS_RANK: Record<string, number> = { in_progress: 0, doing: 0, todo: 1, submitted: 2, revision_requested: 3, approved: 4, done: 4, posted: 4, canceled: 5 };
const STATUS_LABEL: Record<string, string> = { todo: "ยังไม่เริ่ม", in_progress: "กำลังทำ", doing: "กำลังทำ", submitted: "รออนุมัติ", revision_requested: "ขอแก้", approved: "อนุมัติแล้ว", done: "เสร็จ", posted: "เสร็จ", canceled: "ยกเลิก" };
const statusRank = (s: string) => STATUS_RANK[s] ?? 9;
const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

// ค่าจัดเรียงต่อ 1 field (น้อย = มาก่อน)
function sortVal(s: MySubtask, key: MySubSort): number | string {
  if (key === "priority") return -(PRIORITY_RANK[(s.priority ?? "normal") as keyof typeof PRIORITY_RANK] ?? 0); // สูงก่อน
  if (key === "deadline") return s.due_date || "9999-12-31"; // ใกล้ก่อน (ว่าง = ท้ายสุด)
  if (key === "status") return statusRank(s.status);
  return 0;
}
function cmp(a: MySubtask, b: MySubtask, key: MySubSort): number {
  if (key === "none") return 0;
  const va = sortVal(a, key), vb = sortVal(b, key);
  return va < vb ? -1 : va > vb ? 1 : 0;
}

export type MySubGroup = { key: string; label: string; items: MySubtask[] };

/** จัดเรียง + จัดกลุ่ม ตาม config — คืน array ของกลุ่ม (ถ้าไม่จัดกลุ่ม = 1 กลุ่ม label ว่าง) */
export function arrangeMySubtasks(list: MySubtask[], cfg: MySubView): MySubGroup[] {
  const sorted = [...list].sort((a, b) => cmp(a, b, cfg.sort1) || cmp(a, b, cfg.sort2));
  if (cfg.groupBy !== "status") return [{ key: "all", label: "", items: sorted }];
  const groups = new Map<string, MySubGroup>();
  for (const s of sorted) {
    const g = groups.get(s.status) ?? { key: s.status, label: statusLabel(s.status), items: [] };
    g.items.push(s); groups.set(s.status, g);
  }
  return [...groups.values()].sort((a, b) => statusRank(a.key) - statusRank(b.key));
}

// ---- โหลด/บันทึก config กลาง (ui_config) ----
export async function loadMySubView(): Promise<MySubView> {
  try {
    const j = await apiFetch(`/api/ui-config?key=${MYSUB_VIEW_KEY}`).then((r) => r.json());
    return mergeMySubView(j && !j.error ? j.value : null);
  } catch { return DEFAULT_MYSUB_VIEW; }
}
export async function saveMySubView(v: MySubView): Promise<void> {
  await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: MYSUB_VIEW_KEY, value: v }) });
}
