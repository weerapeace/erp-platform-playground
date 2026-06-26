import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

// ค้นหา Parent SKU (parent_skus_v2) สำหรับ ParentSkuPicker
type Row = { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));
  const tokens = search ? search.split(/[\s\-_#/.,()]+/).map((t) => t.replace(/[%_()*,]/g, "")).filter(Boolean).slice(0, 6) : [];
  const searching = tokens.length > 0;

  let query = supabaseFromRequest(request)
    .from("parent_skus_v2")
    .select("id, code, name_th, cover_image_r2_key")
    .eq("is_active", true);
  if (searching) for (const t of tokens) query = query.or(`code.ilike.%${t}%,name_th.ilike.%${t}%`);

  const { data, error } = searching ? await query.limit(80) : await query.order("code", { ascending: true }).limit(limit);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  let rows = ((data ?? []) as Row[]).map((r) => ({
    id: r.id, code: r.code ?? "", name: r.name_th ?? r.code ?? "", image_key: r.cover_image_r2_key ?? null,
  }));
  // ค้นหา → จัดอันดับ "ตัวที่เหมือนที่สุด" ขึ้นก่อน (เป๊ะ-first) แล้วตัดเหลือ limit
  if (searching) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]/gi, "");
    const S = norm(search); const nTokens = tokens.map(norm).filter(Boolean);
    const scoreOf = (r: { code: string; name: string }) => {
      const code = norm(r.code), name = norm(r.name);
      if (S && code === S) return 1_000_000;
      if (S && code.startsWith(S)) return 900_000 - code.length;
      if (S && code.includes(S)) return 800_000 - code.length;
      let s = 0; nTokens.forEach((t, i) => { if (code.startsWith(t)) s += 200 - i * 5; else if (code.includes(t)) s += 120 - i * 5; else if (name.includes(t)) s += 40; });
      return s;
    };
    rows = rows.map((r) => ({ r, s: scoreOf(r) })).sort((a, b) => b.s - a.s || a.r.code.localeCompare(b.r.code, "th")).slice(0, limit).map((x) => x.r);
  }
  return NextResponse.json({ data: rows, error: null });
}

// สร้าง Parent SKU ใหม่ขั้นต่ำ (จากปุ่ม "สร้างใหม่" ใน picker) — code + ชื่อ · ที่เหลือไปเติมในหน้าสินค้า
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.create");
  if (denied) return denied;
  let body: { code?: string; name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "ต้องระบุรหัส Parent SKU" }, { status: 400 });
  const name = (body.name ?? "").trim() || code;
  const admin = supabaseAdmin();
  // มีรหัสนี้อยู่แล้ว → คืนตัวเดิม (กันสร้างซ้ำ)
  const { data: exist } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").eq("code", code).maybeSingle();
  const found = exist as Row | null;
  if (found?.id) return NextResponse.json({ data: { id: found.id, code: found.code ?? "", name: found.name_th ?? found.code ?? "", image_key: found.cover_image_r2_key ?? null }, created: false, error: null });
  const { data, error } = await admin.from("parent_skus_v2")
    .insert({ code, name_th: name, product_family: "general", is_active: true })
    .select("id, code, name_th, cover_image_r2_key").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "สร้าง Parent SKU ไม่สำเร็จ" }, { status: 400 });
  const r = data as Row;
  return NextResponse.json({ data: { id: r.id, code: r.code ?? "", name: r.name_th ?? r.code ?? "", image_key: r.cover_image_r2_key ?? null }, created: true, error: null });
}
