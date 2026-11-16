/**
 * /api/app-changes/deploy-marks — ป้าย "รอขึ้นเว็บ / ขึ้นเว็บแล้ว" ของงานแก้ (report.manage)
 *
 * GET → { marks: { "CH-ab12cd": "waiting" | "live" } }
 *   เทียบรหัส [CH-xxxxxx] ในบรรทัดแรกของ commit: ที่รอขึ้นเว็บ (getDeployStatus().waiting) / 100 ตัวล่าสุดบน prod
 *   งานแก้ที่เจอบนเว็บจริงแล้วแต่ยัง open/in_progress → ปรับเป็น resolved ให้เอง (จด audit by=deploy)
 * ถาม GitHub ผ่านแคชกลาง (lib/deploy-status) — ไม่เพิ่มโควต้าตามจำนวนคนเปิด
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { getDeployStatus, getLiveCommitMessages } from "@/lib/deploy-status";
import { deployMarks, changeCode } from "@/lib/app-change";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "report.manage");
  if (guard) return guard;

  const [status, live] = await Promise.all([
    getDeployStatus().catch(() => null),
    getLiveCommitMessages(),
  ]);
  const marks = deployMarks((status?.waiting ?? []).map((c) => c.message), live);

  const liveCodes = new Set(Object.entries(marks).filter(([, m]) => m === "live").map(([c]) => c));
  if (liveCodes.size) {
    const db = supabaseAdmin();
    const { data } = await db.from("issue_reports").select("id, status").in("status", ["open", "in_progress"]).not("page_path", "is", null).limit(500);
    const now = new Date().toISOString();
    for (const r of (data ?? []) as { id: string; status: string }[]) {
      if (!liveCodes.has(changeCode(r.id))) continue;
      const { error } = await db.from("issue_reports").update({ status: "resolved", resolved_at: now, updated_at: now }).eq("id", r.id).in("status", ["open", "in_progress"]);
      if (!error) await writeAudit(db, { action: "update", entityType: "issue_reports", entityId: r.id, actorId: null, actorName: "ระบบขึ้นเว็บ",
        metadata: { by: "deploy", code: changeCode(r.id), changes: { status: { old: r.status, new: "resolved" } } } });
    }
  }
  return NextResponse.json({ marks, stale: !status || !!status.stale });
}
