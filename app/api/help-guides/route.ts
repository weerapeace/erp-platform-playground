/**
 * /api/help-guides — คู่มือ "วิธีใช้งาน" (แต่ละเรื่อง + ขั้นตอน) ตั้ง/แก้เองในเว็บได้
 *   GET            → รายการคู่มือ + ขั้นตอน (ทุกคนที่ล็อกอินอ่านได้)
 *   GET ?key=xxx   → คู่มือเดียว (ใช้เปิดจากปุ่ม "❓ วิธีใช้งาน")
 *   POST           → สร้างคู่มือใหม่ (ต้องมีสิทธิ์ assets.manage)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type HelpStep = { id: string; step_no: number; title: string; body: string | null; image_r2_key: string | null; link_url: string | null; sort_order: number };
export type HelpGuide = { id: string; guide_key: string | null; title: string; icon: string | null; description: string | null; category: string | null; sort_order: number; steps: HelpStep[] };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim();
  const admin = supabaseAdmin();

  let gq = admin.from("erp_help_guides").select("id, guide_key, title, icon, description, category, sort_order").eq("is_active", true);
  if (key) gq = gq.eq("guide_key", key);
  const { data: guides, error } = await gq.order("sort_order", { ascending: true }).order("title", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const ids = (guides ?? []).map((g) => g.id as string);
  const stepsByGuide = new Map<string, HelpStep[]>();
  if (ids.length) {
    const { data: steps } = await admin.from("erp_help_guide_steps")
      .select("id, guide_id, step_no, title, body, image_r2_key, link_url, sort_order")
      .in("guide_id", ids).order("sort_order", { ascending: true }).order("step_no", { ascending: true });
    for (const s of (steps ?? []) as (HelpStep & { guide_id: string })[]) {
      const arr = stepsByGuide.get(s.guide_id) ?? []; arr.push(s); stepsByGuide.set(s.guide_id, arr);
    }
  }
  const data: HelpGuide[] = (guides ?? []).map((g) => ({ ...(g as Omit<HelpGuide, "steps">), steps: stepsByGuide.get(g.id as string) ?? [] }));
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  let b: { title?: string; icon?: string; description?: string; category?: string; guide_key?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = String(b.title ?? "").trim(); if (!title) return NextResponse.json({ error: "ต้องใส่ชื่อคู่มือ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: mx } = await admin.from("erp_help_guides").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("erp_help_guides").insert({
    title, icon: String(b.icon ?? "").trim() || null, description: String(b.description ?? "").trim() || null,
    category: String(b.category ?? "").trim() || null, guide_key: String(b.guide_key ?? "").trim() || null,
    sort_order: ((mx?.sort_order as number | undefined) ?? 0) + 1,
  }).select("id, guide_key, title, icon, description, category, sort_order").single();
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "guide_key ซ้ำ" : error.message }, { status: 400 });
  return NextResponse.json({ data: { ...data, steps: [] }, error: null });
}
