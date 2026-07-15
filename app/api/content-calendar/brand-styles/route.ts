/**
 * Brand calendar styles — แต่งหน้าแท็บแบรนด์ในปฏิทินคอนเทนต์ (ต่อแบรนด์)
 *
 * GET /api/content-calendar/brand-styles          → [{ brand_id, accent_color, bg_image_key }]
 * PUT /api/content-calendar/brand-styles          → upsert 1 แบรนด์ { brand_id, accent_color?, bg_image_key? }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("content_calendar_brand_style").select("brand_id, accent_color, bg_image_key");
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  let body: { brand_id?: string; accent_color?: string | null; bg_image_key?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "ต้องระบุแบรนด์" }, { status: 400 });
  const admin = supabaseAdmin();
  const row = {
    brand_id: brandId,
    accent_color: body.accent_color?.trim() || null,
    bg_image_key: body.bg_image_key?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("content_calendar_brand_style").upsert(row, { onConflict: "brand_id" });
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  return NextResponse.json({ data: row, error: null });
}
