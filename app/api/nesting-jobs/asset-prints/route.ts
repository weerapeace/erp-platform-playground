/**
 * GET /api/nesting-jobs/asset-prints?ids=a,b,c — ไฟล์ PNG สำหรับพิมพ์ที่จำไว้กับลายในคลัง (assets.nest_print_file)
 *   → { data: { [asset_id]: { sha, name, size } } } เฉพาะลายที่มีไฟล์ — nesting.view
 * ใช้ตอนเลือกลายจากคลัง: มีไฟล์ = ใส่ให้เอง (ตัวช่วยโหลดจาก R2 ถ้าเครื่องนี้ยังไม่มี)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cleanUuid } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").map(cleanUuid).filter((x): x is string => !!x))].slice(0, 300);
  if (!ids.length) return NextResponse.json({ data: {}, error: null });
  const { data, error } = await supabaseAdmin().from("assets").select("id, nest_print_file").in("id", ids).not("nest_print_file", "is", null);
  if (error) return NextResponse.json({ data: {}, error: error.message }, { status: 500 });
  const out: Record<string, { sha: string; name: string; size: number | null }> = {};
  for (const r of data ?? []) {
    const p = (r.nest_print_file ?? {}) as Record<string, unknown>;
    if (typeof p.sha === "string" && /^[0-9a-f]{16}$/.test(p.sha))
      out[r.id as string] = { sha: p.sha, name: String(p.name ?? `${p.sha}.png`), size: Number.isFinite(Number(p.size)) ? Number(p.size) : null };
  }
  return NextResponse.json({ data: out, error: null });
}
