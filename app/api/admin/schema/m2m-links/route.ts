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
  if (!JT_RE.test(junction)) return NextResponse.json({ links: [], error: "param ไม่ถูกต้อง" }, { status: 400 });

  // โหมด bulk: ?src_ids=a,b,c → คืน { map: { src_id: [tgt_id...] } } (ไว้โชว์แท็กของหลายรายการทีเดียว)
  const srcIds = (searchParams.get("src_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (srcIds.length > 0) {
    const map: Record<string, string[]> = {};
    // ดึงเป็น batch ละ 200 id
    for (let i = 0; i < srcIds.length; i += 200) {
      const chunk = srcIds.slice(i, i + 200);
      const { data, error } = await supabaseAdmin().from(junction).select("src_id,tgt_id").in("src_id", chunk);
      if (error) return NextResponse.json({ map: {}, error: error.message }, { status: 500 });
      for (const r of (data ?? []) as { src_id: string; tgt_id: string }[]) {
        (map[r.src_id] ??= []).push(r.tgt_id);
      }
    }
    return NextResponse.json({ map, error: null });
  }

  const srcId = searchParams.get("src_id") ?? "";
  if (!srcId) return NextResponse.json({ links: [], error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from(junction).select("tgt_id").eq("src_id", srcId);
  if (error) return NextResponse.json({ links: [], error: error.message }, { status: 500 });
  return NextResponse.json({ links: (data ?? []).map((r) => (r as { tgt_id: string }).tgt_id), error: null });
}

export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  if (!JT_RE.test(b.junction ?? "")) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });

  // โหมด bulk: { junction, links: [{src_id, tgt_id}, ...] } → upsert ทีละ chunk (เร็วกว่ายิงทีละคู่มาก)
  if (Array.isArray(b.links)) {
    const rows = (b.links as { src_id?: string; tgt_id?: string }[])
      .filter((l) => l && l.src_id && l.tgt_id)
      .map((l) => ({ src_id: l.src_id, tgt_id: l.tgt_id }));
    let count = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin().from(b.junction).upsert(chunk, { onConflict: "src_id,tgt_id", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message, count }, { status: 500 });
      count += chunk.length;
    }
    return NextResponse.json({ ok: true, count });
  }

  if (!b.src_id || !b.tgt_id) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { error } = await supabaseAdmin().from(b.junction).upsert({ src_id: b.src_id, tgt_id: b.tgt_id }, { onConflict: "src_id,tgt_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  if (!JT_RE.test(b.junction ?? "")) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });

  // โหมด bulk: { junction, links:[{src_id,tgt_id}] } → group ตาม tgt_id แล้ว .in(src_id) (เร็วกว่ายิงทีละคู่)
  if (Array.isArray(b.links)) {
    const byTgt = new Map<string, string[]>();
    for (const l of b.links as { src_id?: string; tgt_id?: string }[]) {
      if (l?.src_id && l?.tgt_id) { const a = byTgt.get(l.tgt_id) ?? []; a.push(l.src_id); byTgt.set(l.tgt_id, a); }
    }
    let count = 0;
    for (const [tgt, srcs] of byTgt) {
      for (let i = 0; i < srcs.length; i += 500) {
        const chunk = srcs.slice(i, i + 500);
        const { error } = await supabaseAdmin().from(b.junction).delete().eq("tgt_id", tgt).in("src_id", chunk);
        if (error) return NextResponse.json({ error: error.message, count }, { status: 500 });
        count += chunk.length;
      }
    }
    return NextResponse.json({ ok: true, count });
  }

  if (!b.src_id || !b.tgt_id) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { error } = await supabaseAdmin().from(b.junction).delete().eq("src_id", b.src_id).eq("tgt_id", b.tgt_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
