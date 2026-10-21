// ============================================================
// การจัดเรียง/จัดกลุ่ม "งานย่อยของฉัน" (ของกลาง) — admin ตั้งค่ากลาง (ui_config) ใช้กับทุกคน
// จัดกลุ่ม: ไม่จัด / ตามสถานะ · เรียงหลายชั้น เช่น 1.ความสำคัญ 2.กำหนดส่ง
// ============================================================
import { apiFetch } from "@/lib/api";
import { PRIORITY_RANK, type MySubtask } from "./data";
import { normalizeSubStatus, subStatusLabel, subStatusRank } from "./subtask-status";


export type MySubSort = "priority" | "deadline" | "status" | "none";
export type MySubGroupBy = "none" | "status";
export type MySubView = { groupBy: MySubGroupBy; sort1: MySubSort; sort2: MySubSort };
export const DEFAULT_MYSUB_VIEW: MySubView = { groupBy: "status", sort1: "priority", sort2: "deadline" };
export const MYSUB_VIEW_KEY = "tasks_my_subtasks_view";

export function mergeMySubView(v: unknown): MySubView {
  const o = (v ?? {}) as Partial<MySubView>;
  return { groupBy: o.groupBy ?? DEFAULT_MYSUB_VIEW.groupBy, sort1: o.sort1 ?? DEFAULT_MYSUB_VIEW.sort1, sort2: o.sort2 ?? DEFAULT_MYSUB_VIEW.sort2 };
}

// ลำดับ/ป้ายสถานะงานย่อย — ของกลาง ./subtask-status (กำลังทำบนสุด → ยังไม่เริ่ม → รออนุมัติ → ขอแก้ → อนุมัติ → ยกเลิก)

// ค่าจัดเรียงต่อ 1 field (น้อย = มาก่อน)
function sortVal(s: MySubtask, key: MySubSort): number | string {
  if (key === "priority") return -(PRIORITY_RANK[(s.priority ?? "normal") as keyof typeof PRIORITY_RANK] ?? 0); // สูงก่อน
  if (key === "deadline") return s.due_date || "9999-12-31"; // ใกล้ก่อน (ว่าง = ท้ายสุด)
  if (key === "status") return subStatusRank(s.status);
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
    const k = normalizeSubStatus(s.status);
    const g = groups.get(k) ?? { key: k, label: subStatusLabel(k), items: [] };
    g.items.push(s); groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => subStatusRank(a.key) - subStatusRank(b.key));
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
