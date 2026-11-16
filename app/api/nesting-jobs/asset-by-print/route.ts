/**
 * GET /api/nesting-jobs/asset-by-print?shas=a,b,c — การ์ดลายในคลัง Artwork ที่ผูกไฟล์พิมพ์นี้ไว้แล้ว (assets.nest_print_file.sha)
 *   → { data: { [sha]: AssetRow } } เฉพาะไฟล์ที่มีการ์ด (การ์ดที่ยังไม่อยู่ถังขยะ · หลายใบ = ใบที่สร้างก่อน) — nesting.view
 * ใช้ตอนลากไฟล์ PNG ในหน้าจัดเรียง: ไฟล์เดิมเคยเข้าคลังแล้ว = ผูกการ์ดเดิม ไม่สร้างการ์ดซ้ำ
 * กันซ้ำด้วยรหัสเนื้อไฟล์ (sha256) เท่านั้น — ห้ามดูชื่อไฟล์ (docs/duplicate-upload.md)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRINT_SHA } from "@/lib/print-store";
import { buildRow, loadTags, type AssetDbRow, type AssetRow } from "@/app/api/assets/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  const shas = [...new Set((request.nextUrl.searchParams.get("shas") ?? "").split(",").map((s) => s.trim()).filter((s) => PRINT_SHA.test(s)))].slice(0, 100);
  if (!shas.length) return NextResponse.json({ data: {}, error: null });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("assets").select("*")
    .in("nest_print_file->>sha", shas).eq("status", "active").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: {}, error: error.message }, { status: 500 });
  const rows = (data ?? []) as (AssetDbRow & { nest_print_file?: { sha?: string } | null })[];
  const tags = await loadTags(admin, rows.map((r) => r.id));
  const out: Record<string, AssetRow> = {};
  for (const r of rows) {
    const sha = r.nest_print_file?.sha;
    if (sha && !out[sha]) out[sha] = buildRow(r, tags.get(r.id) ?? [], 0);
  }
  return NextResponse.json({ data: out, error: null });
}
