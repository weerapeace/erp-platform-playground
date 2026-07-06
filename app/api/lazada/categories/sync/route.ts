/**
 * ดึงต้นไม้หมวดหมู่จาก Lazada มาเก็บ (cache) — /api/lazada/categories/sync
 * POST { brand_id } → ดึง /category/tree/get → แบนเป็นแถว (มี path) → แทนที่ทั้งตาราง lazada_categories
 * (Lazada ไม่มี API ค้นหาหมวด → ต้อง cache ทั้งต้นไว้ค้นเองในระบบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lazGetCategoryTree, type LazCategoryNode } from "@/lib/lazada";
import { getPlatformId, ensureLazToken } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Row = { id: string; name: string; parent_id: string | null; is_leaf: boolean; path: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "ต้องมี brand_id (แบรนด์ที่เชื่อม Lazada)" }, { status: 400 });

  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม lazada" }, { status: 400 });
  const tok = await ensureLazToken(admin, brandId, lazId, user?.id ?? null);
  if (!tok) return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้เชื่อมต่อ Lazada" }, { status: 400 });

  let tree: LazCategoryNode[];
  try { tree = await lazGetCategoryTree(tok.gateway, tok.accessToken); }
  catch (e) { return NextResponse.json({ error: `ดึงหมวดหมู่ไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  const rows: Row[] = [];
  const walk = (nodes: LazCategoryNode[], parentId: string | null, parentPath: string) => {
    for (const n of nodes) {
      const id = String(n.category_id);
      const path = parentPath ? `${parentPath} > ${n.name}` : n.name;
      rows.push({ id, name: n.name, parent_id: parentId, is_leaf: !!n.leaf, path });
      if (n.children?.length) walk(n.children, id, path);
    }
  };
  walk(tree, null, "");
  if (rows.length === 0) return NextResponse.json({ error: "ไม่พบหมวดหมู่จาก Lazada" }, { status: 400 });

  // แทนที่ทั้งตาราง (หมวดใหม่/หายไปให้ตรงกับ Lazada) แล้ว insert เป็นชุด
  await admin.from("lazada_categories").delete().neq("id", "___none___");
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from("lazada_categories").insert(rows.slice(i, i + 1000).map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const leaves = rows.filter((r) => r.is_leaf).length;
  return NextResponse.json({ ok: true, total: rows.length, leaves, error: null });
}
