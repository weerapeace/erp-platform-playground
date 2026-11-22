"use client";

// ============================================================
// เช็กเงื่อนไขก่อนเข้าสถานะ (ตั้งที่ /tasks/settings?tab=status · lib/task-status-gates) — เรียกจากของกลาง applyTaskTransition
//  • เช็กเฉพาะการย้าย "ไปข้างหน้า" (ชนิด ปกติ/อนุมัติ) — ส่งกลับแก้/ไม่ผ่าน/ติดปัญหา ไม่เช็ก · แอดมินบังคับตั้งสถานะ = ข้าม
//  • โหลดข้อมูลเฉพาะตอนสถานะปลายทางมีเงื่อนไข (ไม่มี = ไม่ยิงอะไรเลย)
// ============================================================
import { apiFetch } from "@/lib/api";
import { askConfirm } from "@/components/modal/ask-dialog";
import { tr } from "@/lib/lang";
import { cleanStatusGates, evaluateGate, gateOf, hasGate, STATUS_GATES_KEY, type GateFinding, type StatusGates } from "@/lib/task-status-gates";
import { readinessKeysFor, taskReadiness, type ReadinessParent } from "@/lib/task-readiness";
import { CONTENT_DONE, contentStatusLabel, getTaskQuickCheck, listContent, type CreativeTask } from "./data";
import { loadReadinessRules } from "./task-readiness-bar";
import { statusMeta } from "./use-statuses";
import type { PushToast } from "@/components/toast";

let gatesCache: Promise<StatusGates> | null = null;
export function loadStatusGates(force = false): Promise<StatusGates> {
  if (!gatesCache || force) {
    gatesCache = apiFetch(`/api/ui-config?key=${STATUS_GATES_KEY}`).then((r) => r.json())
      .then((j) => cleanStatusGates(j?.value)).catch(() => cleanStatusGates(null));
  }
  return gatesCache;
}
export function clearStatusGatesCache() { gatesCache = null; }

async function readinessMissing(task: CreativeTask): Promise<string[] | null> {
  try {
    const [ps, rules] = await Promise.all([getTaskQuickCheck(task.id), loadReadinessRules()]);
    if (!ps.length) return null;   // ยังไม่ผูกสินค้า = ไม่เช็กข้อนี้
    const keys = readinessKeysFor(rules, task.task_type ?? null).filter((k) => k !== "platform");
    return taskReadiness(ps as ReadinessParent[], keys, {}).filter((i) => !i.pending && !i.ok)
      .map((i) => `${tr(i.label, i.label_en)}${i.issues[0] ? ` — ${i.issues[0]}` : ""}`);
  } catch { return null; }
}
async function contentOpen(task: CreativeTask): Promise<string[] | null> {
  try {
    return (await listContent({ task_id: task.id })).filter((c) => c.status !== "cancelled" && !CONTENT_DONE.has(c.status))
      .map((c) => `${c.title} — ${contentStatusLabel(c.status)}`);
  } catch { return null; }
}

const head = (f: GateFinding) => f.kind === "readiness" ? tr("ความพร้อมสินค้ายังขาด", "Product readiness missing") : tr("คอนเทนต์ยังไม่พร้อม", "Content not ready");
const listText = (fs: GateFinding[]) => fs.map((f) => `${head(f)}: ${f.lines.slice(0, 4).join(" · ")}${f.lines.length > 4 ? ` …+${f.lines.length - 4}` : ""}`).join("\n");

/** คืน true = ย้ายต่อได้ */
export async function checkStatusGate(task: CreativeTask, toKey: string, pushToast: PushToast): Promise<boolean> {
  const g = gateOf(await loadStatusGates(), toKey);
  if (!hasGate(g)) return true;
  const [rm, co] = await Promise.all([g.readiness !== "off" ? readinessMissing(task) : null, g.content !== "off" ? contentOpen(task) : null]);
  const { block, warn } = evaluateGate(g, { readinessMissing: rm, contentOpen: co });
  const to = statusMeta(toKey).label;
  if (block.length) {
    pushToast("error", `${tr(`ย้ายไป "${to}" ไม่ได้`, `Can't move to "${to}"`)} — ${listText(block)}`);
    return false;
  }
  if (!warn.length) return true;
  return askConfirm({
    title: tr(`ยังไม่ครบก่อนย้ายไป "${to}" — ทำต่อเลยไหม?`, `Not complete before moving to "${to}" — continue?`),
    message: (
      <div className="space-y-2 text-sm">
        {warn.map((f) => (
          <div key={f.kind}><p className="font-medium text-slate-700">{head(f)} ({f.lines.length})</p>
            <ul className="list-disc pl-5 text-slate-600 space-y-0.5">{f.lines.slice(0, 8).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        ))}
      </div>
    ),
    confirmText: tr("ทำต่อเลย", "Continue anyway"), cancelText: tr("กลับไปแก้", "Go back"),
  });
}
