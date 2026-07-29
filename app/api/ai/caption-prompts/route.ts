/**
 * /api/ai/caption-prompts — คำสั่ง (prompt) ให้ AI เขียนแคปชั่น · ตั้งได้ 4 ระดับ
 *   GET                                   → ทุกระดับที่ตั้งไว้ + prompt สำรองในโค้ด
 *   POST   { brand_id, platform, prompt }  → ตั้ง/แก้ระดับนั้น (brand_id/platform = null คือ "ทุก…")
 *   DELETE ?brand_id=&platform=            → ลบระดับนั้น (กลับไปใช้ระดับที่กว้างกว่า)
 *
 * สิทธิ์: อ่าน = ai.caption (คนที่ใช้ AI ได้ ควรเห็นว่า prompt เป็นอะไร)
 *        แก้  = tasks.approve (หัวหน้า/ผู้ดูแล — เพราะเป็นค่ากลางกระทบทุกคน)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CaptionPrompt = { id: string; brand_id: string | null; platform: string | null; prompt: string; updated_at: string };

const nz = (v: string | null | undefined) => { const s = (v ?? "").trim(); return s && s !== "null" ? s : null; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")) && !(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ data: [], error: "ไม่มีสิทธิ์ดู prompt (ai.caption)" }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("erp_caption_prompts")
    .select("id, brand_id, platform, prompt, updated_at").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as CaptionPrompt[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ต้องเป็นหัวหน้า/ผู้ดูแลจึงแก้ prompt ได้ (tasks.approve)" }, { status: 401 });
  let b: { brand_id?: string | null; platform?: string | null; prompt?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const prompt = (b.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "กรุณาใส่คำสั่ง (prompt)" }, { status: 400 });
  const brandId = nz(b.brand_id ?? null), platform = nz(b.platform ?? null);

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  // unique index เป็น expression (coalesce) → หาแถวเดิมเองแล้ว update/insert (onConflict ใช้ไม่ได้)
  let q = admin.from("erp_caption_prompts").select("id");
  q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
  q = platform ? q.eq("platform", platform) : q.is("platform", null);
  const { data: found } = await q.maybeSingle();

  const row = { brand_id: brandId, platform, prompt, updated_at: new Date().toISOString(), updated_by: user?.id ?? null };
  const { error } = found
    ? await admin.from("erp_caption_prompts").update(row).eq("id", (found as { id: string }).id)
    : await admin.from("erp_caption_prompts").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: found ? "update" : "create", entityType: "caption_prompt", entityId: (found as { id?: string } | null)?.id ?? null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, platform } });
  return NextResponse.json({ success: true, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ต้องเป็นหัวหน้า/ผู้ดูแลจึงลบ prompt ได้ (tasks.approve)" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const brandId = nz(sp.get("brand_id")), platform = nz(sp.get("platform"));
  if (!brandId && !platform) return NextResponse.json({ error: "ลบ prompt กลาง (ทุกแบรนด์/ทุกแพลตฟอร์ม) ไม่ได้ — แก้ข้อความแทน" }, { status: 400 });

  const admin = supabaseAdmin();
  let q = admin.from("erp_caption_prompts").delete();
  q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
  q = platform ? q.eq("platform", platform) : q.is("platform", null);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "delete", entityType: "caption_prompt", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, platform } });
  return NextResponse.json({ success: true, error: null });
}
