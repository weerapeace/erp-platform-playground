/**
 * 📚 Design Library — เสนอแท็กอะไหล่จากชื่อ SKU แล้วให้คนติ๊กยืนยัน (รอบ 7 · เจ้าของเลือก 2026-11-14)
 *   GET  → SKU ที่ชื่อเหมือนอะไหล่ (lib/design-library-hwtags) จัดตามแท็กย่อยที่เสนอ · กันสินค้าสำเร็จรูปออก (ชื่อ / แท็ก Brands · หมวดหมู่สินค้า)
 *          บอกว่าตัวไหนติดแท็กย่อยนั้นอยู่แล้ว
 *   POST { items: [{ tag, sku_ids[] }] } → สร้างกลุ่มแท็ก "อะไหล่" (ใต้ วัตถุดิบ) + แท็กย่อยถ้ายังไม่มี → ติดแท็กให้ SKU ที่ติ๊ก
 *          trigger roll-up (erp_sku_family_tag_rollup) ติดแท็กพ่อ "อะไหล่" ให้เอง · ไม่ลบแท็กเดิมของใคร · audit 1 แถว
 * สิทธิ์: ดู design_library.view · บันทึก products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { HW_PARENT, HW_PARENT_GROUP, HW_TAG_RULES, HW_WORDS, looksFinished, suggestHwTag } from "@/lib/design-library-hwtags";

export const dynamic = "force-dynamic";
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
type Admin = ReturnType<typeof supabaseAdmin>;
type Fam = { id: string; name: string; group_id: string | null };
type Grp = { id: string; name: string; parent_group_id: string | null };

async function tree(admin: Admin) {
  const [{ data: groups }, { data: fams }] = await Promise.all([
    admin.from("product_family_groups").select("id, name, parent_group_id"),
    admin.from("product_families").select("id, name, group_id"),
  ]);
  return { groups: (groups ?? []) as Grp[], fams: (fams ?? []) as Fam[] };
}
/** กลุ่ม + ลูกหลานทั้งหมด */
function withChildren(groups: Grp[], rootNames: string[]): Set<string> {
  const out = new Set(groups.filter((g) => rootNames.includes(g.name.trim())).map((g) => g.id));
  for (let grew = true; grew;) { grew = false; for (const g of groups) if (g.parent_group_id && out.has(g.parent_group_id) && !out.has(g.id)) { out.add(g.id); grew = true; } }
  return out;
}
async function linksOf(admin: Admin, skuIds: string[]): Promise<{ src_id: string; tgt_id: string }[]> {
  const out: { src_id: string; tgt_id: string }[] = [];
  for (let i = 0; i < skuIds.length; i += 200) {
    const { data } = await admin.from("skus_v2_product_family_m2m").select("src_id, tgt_id").in("src_id", skuIds.slice(i, i + 200));
    out.push(...((data ?? []) as { src_id: string; tgt_id: string }[]));
  }
  return out;
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "design_library.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  try {
    const orq = HW_WORDS.map((w) => `name_th.ilike.%${w}%`).join(",");
    const { data, error } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key").not("is_active", "is", false).or(orq).order("code").limit(2000);
    if (error) return bad("โหลดรายการ SKU ไม่สำเร็จ กรุณาลองใหม่", 500);
    const rows = ((data ?? []) as { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null }[]).filter((r) => !looksFinished(r.name_th));
    const { groups, fams } = await tree(admin);
    const finishedGroups = withChildren(groups, ["หมวดหมู่สินค้า", "Brands", "ฺBrands"]);
    const finishedFams = new Set(fams.filter((f) => f.group_id && finishedGroups.has(f.group_id)).map((f) => f.id));
    const hwGroup = groups.find((g) => g.name.trim() === HW_PARENT);
    const subByName = new Map(fams.filter((f) => hwGroup && f.group_id === hwGroup.id).map((f) => [f.name.trim(), f.id]));
    const links = await linksOf(admin, rows.map((r) => r.id));
    const tagsOf = new Map<string, Set<string>>();
    for (const l of links) (tagsOf.get(l.src_id) ?? tagsOf.set(l.src_id, new Set()).get(l.src_id)!).add(l.tgt_id);
    const byTag = new Map<string, { id: string; code: string; name: string; image_key: string | null; tagged: boolean }[]>();
    let skipped = 0;
    for (const r of rows) {
      const t = tagsOf.get(r.id) ?? new Set<string>();
      if ([...t].some((x) => finishedFams.has(x))) { skipped++; continue; }
      const tag = suggestHwTag(r.name_th); if (!tag) continue;
      const subId = subByName.get(tag);
      (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push({ id: r.id, code: r.code, name: r.name_th ?? r.code, image_key: r.cover_image_r2_key, tagged: !!subId && t.has(subId) });
    }
    const out = HW_TAG_RULES.map((x) => ({ tag: x.tag, words: x.words, exists: subByName.has(x.tag), items: byTag.get(x.tag) ?? [] })).filter((x) => x.items.length);
    return NextResponse.json({ data: { groups: out, skipped_finished: skipped, group_exists: !!hwGroup }, error: null });
  } catch { return bad("โหลดรายการ SKU ไม่สำเร็จ กรุณาลองใหม่", 500); }
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const body = await request.json().catch(() => null) as { items?: { tag?: unknown; sku_ids?: unknown }[] } | null;
  const allowed = new Set(HW_TAG_RULES.map((r) => r.tag));
  const items = (Array.isArray(body?.items) ? body!.items : []).map((x) => ({
    tag: typeof x.tag === "string" ? x.tag.trim() : "",
    ids: [...new Set((Array.isArray(x.sku_ids) ? x.sku_ids : []).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)))].slice(0, 2000),
  })).filter((x) => allowed.has(x.tag) && x.ids.length);
  if (!items.length) return bad("ยังไม่ได้ติ๊ก SKU ที่จะติดแท็ก");
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const { groups, fams } = await tree(admin);
    // กลุ่ม "อะไหล่" ใต้ "วัตถุดิบ" (มีอยู่แล้ว = ใช้ตัวเดิม)
    let hw = groups.find((g) => g.name.trim() === HW_PARENT);
    if (!hw) {
      const parent = groups.find((g) => g.name.trim() === HW_PARENT_GROUP && !g.parent_group_id) ?? null;
      const { data, error } = await admin.from("product_family_groups").insert({ name: HW_PARENT, parent_group_id: parent?.id ?? null, is_active: true, sort_order: 50 }).select("id, name, parent_group_id").single();
      if (error || !data) return bad("สร้างกลุ่มแท็ก “อะไหล่” ไม่สำเร็จ กรุณาลองใหม่", 500);
      hw = data as Grp;
    }
    // แท็กพ่อ "อะไหล่" ต้องมี (roll-up หาแท็กชื่อเดียวกับกลุ่ม) — ปกติมีอยู่แล้วใต้ วัตถุดิบ
    if (!fams.some((f) => f.name.trim() === HW_PARENT)) {
      const parent = groups.find((g) => g.name.trim() === HW_PARENT_GROUP && !g.parent_group_id) ?? null;
      await admin.from("product_families").insert({ name: HW_PARENT, group_id: parent?.id ?? null, is_active: true });
    }
    let linked = 0; const created: string[] = [];
    for (const it of items) {
      let fam = fams.find((f) => f.group_id === hw!.id && f.name.trim() === it.tag);
      if (!fam) {
        const { data, error } = await admin.from("product_families").insert({ name: it.tag, group_id: hw.id, is_active: true }).select("id, name, group_id").single();
        if (error || !data) return bad(`สร้างแท็ก “${it.tag}” ไม่สำเร็จ กรุณาลองใหม่`, 500);
        fam = data as Fam; fams.push(fam); created.push(it.tag);
      }
      for (let i = 0; i < it.ids.length; i += 500) {
        const chunk = it.ids.slice(i, i + 500).map((src_id) => ({ src_id, tgt_id: fam!.id }));
        const { error, count } = await admin.from("skus_v2_product_family_m2m").upsert(chunk, { onConflict: "src_id,tgt_id", ignoreDuplicates: true, count: "exact" });
        if (error) return bad("ติดแท็กไม่สำเร็จบางส่วน กรุณาลองใหม่", 500);
        linked += count ?? chunk.length;
      }
    }
    await writeAudit(admin, { action: "bulk_tag", entityType: "product_family_groups", entityId: hw.id, actorId: actor.id, actorName: actor.name,
      metadata: { from: "design_library_hw_tags", created_tags: created, items: items.map((x) => ({ tag: x.tag, count: x.ids.length })) } });
    return NextResponse.json({ data: { linked, created_tags: created }, error: null });
  } catch { return bad("ติดแท็กไม่สำเร็จ กรุณาลองใหม่", 500); }
}
