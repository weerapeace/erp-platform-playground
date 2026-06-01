/**
 * จัดการ link ของ many2many (junction table src_id/tgt_id)
 * GET    ?junction=&src_id=         → [{ tgt_id }]
 * POST   { junction, src_id, tgt_id } → เพิ่ม link
 * DELETE { junction, src_id, tgt_id } → ลบ link
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JT_RE = /^[a-z][a-z0-9_]+_m2m$/;   // junction ต้องลงท้าย _m2m

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const junction = searchParams.get("junction") ?? "";
  const srcId = searchParams.get("src_id") ?? "";
  if (!JT_RE.test(junction) || !srcId) return NextResponse.json({ links: [], error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from(junction).select("tgt_id").eq("src_id", srcId);
  if (error) return NextResponse.json({ links: [], error: error.message }, { status: 500 });
  return NextResponse.json({ links: (data ?? []).map((r) => (r as { tgt_id: string }).tgt_id), error: null });
}

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  if (!JT_RE.test(b.junction ?? "") || !b.src_id || !b.tgt_id) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { error } = await supabaseAdmin().from(b.junction).upsert({ src_id: b.src_id, tgt_id: b.tgt_id }, { onConflict: "src_id,tgt_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  if (!JT_RE.test(b.junction ?? "") || !b.src_id || !b.tgt_id) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { error } = await supabaseAdmin().from(b.junction).delete().eq("src_id", b.src_id).eq("tgt_id", b.tgt_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
