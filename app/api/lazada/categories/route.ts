/**
 * ค้นหมวดหมู่ Lazada (จาก cache) — /api/lazada/categories?search=...
 * GET → { categories: [{id,name,path}], cached }  · คืนเฉพาะหมวดปลายทาง (leaf) ที่ลงสินค้าได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const q = (new URL(request.url).searchParams.get("search") ?? "").trim().replace(/[,()]/g, " ").trim();
  const admin = supabaseAdmin();
  const { count: cached } = await admin.from("lazada_categories").select("id", { count: "exact", head: true });
  let query = admin.from("lazada_categories").select("id, name, path").eq("is_leaf", true).order("path").limit(60);
  if (q) query = query.or(`name.ilike.%${q}%,path.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ categories: data ?? [], cached: cached ?? 0, error: null });
}
