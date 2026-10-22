/**
 * GET /api/entry-modes/stats?module=<moduleKey>
 * 📝 ทั้งระบบเหลือกี่ตัวที่ยังลงไม่ครบแต่ละโหมด (+ ขาดช่องไหนกี่ตัว) — ของกลาง lib/entry-modes-server
 * โชว์ในหน้าจอโหมดของป๊อป + ปุ่ม "📝 ความครบตามโหมด" หน้าตาราง
 * นับเฉพาะรายการที่เปิดใช้อยู่ · เฉพาะโหมดที่ role ผู้ดูเห็น · guardApi products.view (เหมือนรายการ master-v2)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserRole } from "@/lib/field-permissions";
import { modeVisibleTo } from "@/lib/entry-modes";
import { entryModeStats, loadEntryModeContext, type EntryModeStat } from "@/lib/entry-modes-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type EntryModeStatsResponse = { module: string; modes: EntryModeStat[]; error: string | null };

export async function GET(request: NextRequest): Promise<NextResponse<EntryModeStatsResponse>> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied as NextResponse<EntryModeStatsResponse>;
  const moduleKey = (new URL(request.url).searchParams.get("module") ?? "").trim();
  if (!moduleKey) return NextResponse.json({ module: "", modes: [], error: "ต้องระบุ module" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const ctx = await loadEntryModeContext(admin, { moduleKey });
    if (!ctx) return NextResponse.json({ module: moduleKey, modes: [], error: "ไม่พบโมดูล" }, { status: 404 });
    const role = await getUserRole(request);
    const modes = ctx.modes.filter((m) => modeVisibleTo(m, role));
    const { stats } = await entryModeStats(admin, ctx, modes);
    return NextResponse.json({ module: moduleKey, modes: stats, error: null }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    return NextResponse.json({ module: moduleKey, modes: [], error: e instanceof Error ? e.message : "นับไม่สำเร็จ" }, { status: 500 });
  }
}
