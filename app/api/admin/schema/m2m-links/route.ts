/**
 * จัดการ link ของ many2many (junction table src_id/tgt_id)
 * GET    ?junction=&src_id=         → [{ tgt_id }]
 * POST   { junction, src_id, tgt_id } → เพิ่ม link
 * DELETE { junction, src_id, tgt_id } → ลบ link
 * 2026-11-15: เพิ่ม/ลบ link ลง audit log ทุกครั้ง (1 แถวต่อคำขอ · bulk จดจำนวน + แท็ก + ตัวอย่างไม่เกิน 50 รายการ)
 *   ใช้ที่: Tags Manager (ใส่/ลบแท็กหลายตัว) · SkuTagBrowser · ตาราง/ลิ้นชักกลาง master-crud (ติ๊กทีละตัว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JT_RE = /^[a-z][a-z0-9_]+_m2m$/;   // junction ต้องลงท้าย _m2m

type Pair = { src_id: string; tgt_id: string };
/** ตารางต้นทางของ junction ที่รู้จัก — ให้หน้าประวัติรู้ว่าเป็นรายการอะไร (รหัสสินค้า) */
const SRC_TABLE: Record<string, string> = {
  skus_v2_product_family_m2m: "skus_v2",
  parent_skus_v2_product_family_m2m: "parent_skus_v2",
};
const SAMPLE = 50;

/** จด audit 1 แถวต่อคำขอ (ไม่ทำให้งานหลักล้ม) — แท็กสินค้า = tag/untag · อื่น ๆ = link/unlink · หลายคู่ = bulk_ */
async function auditLinks(request: NextRequest, junction: string, op: "add" | "remove", pairs: Pair[], extra: Record<string, unknown> = {}) {
  if (!pairs.length) return;
  try {
    const admin = supabaseAdmin();
    const actor = await requestActor(supabaseFromRequest(request));
    const isTag = junction.endsWith("_product_family_m2m") || junction.endsWith("_tags_m2m");
    const bulk = pairs.length > 1 || extra.bulk === true;
    const verb = isTag ? (op === "add" ? "tag" : "untag") : (op === "add" ? "link" : "unlink");
    const tgtIds = [...new Set(pairs.map((p) => p.tgt_id))];
    const srcIds = [...new Set(pairs.map((p) => p.src_id))];
    const srcTable = SRC_TABLE[junction];
    const [tags, codes] = await Promise.all([
      junction.endsWith("_product_family_m2m") && tgtIds.length <= SAMPLE
        ? admin.from("product_families").select("name").in("id", tgtIds).then((r) => ((r.data ?? []) as { name: string }[]).map((x) => x.name))
        : Promise.resolve(undefined),
      srcTable ? admin.from(srcTable).select("code").in("id", srcIds.slice(0, SAMPLE)).then((r) => ((r.data ?? []) as { code: string }[]).map((x) => x.code)) : Promise.resolve(undefined),
    ]);
    await writeAudit(admin, {
      action: `${bulk ? "bulk_" : ""}${verb}`, entityType: srcTable ?? junction, entityId: srcIds.length === 1 ? srcIds[0] : null,
      actorId: actor.id, actorName: actor.name,
      metadata: {
        from: "m2m-links", junction, count: pairs.length, ...extra,
        tag_ids: tgtIds.slice(0, SAMPLE), ...(tags ? { tag_names: tags } : {}),
        src_ids: srcIds.slice(0, SAMPLE), ...(codes ? { codes } : {}),
        ...(tags?.length === 1 && codes?.length === 1 ? { name: tags[0], code: codes[0] } : {}),
      },
    });
  } catch { /* จด audit ไม่ได้ ไม่ทำให้การใส่แท็กล้ม */ }
}

/**
 * สิทธิ์ตามตาราง (เจ้าของเลือก 2026-11-15): แท็กสินค้า SKU/Parent = ดู products.view · ใส่/ลบ products.edit
 * (staff ทุกตำแหน่งมีสิทธิ์แก้สินค้าอยู่แล้ว — เดิมใช้สิทธิ์โครงสร้างระบบ มีแต่ admin → staff ใส่แท็กไม่ได้ และเห็นการ์ด "ยังไม่มีแท็ก")
 * ตารางเชื่อมอื่น (แผนกพนักงาน · แท็กโปรโมชั่น · ที่สร้างใหม่) = สิทธิ์โครงสร้างระบบเหมือนเดิม
 */
const PRODUCT_TAG_JUNCTIONS = new Set(["skus_v2_product_family_m2m", "parent_skus_v2_product_family_m2m"]);
function permFor(junction: string, op: "view" | "add" | "remove"): string {
  if (PRODUCT_TAG_JUNCTIONS.has(junction)) return op === "view" ? "products.view" : "products.edit";
  return op === "view" ? "admin.schema.view" : op === "add" ? "admin.schema.add_field" : "admin.schema.delete_field";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const junction = searchParams.get("junction") ?? "";
  const denied = await guardApi(request, permFor(junction, "view")); if (denied) return denied;
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
  const denied = await guardApi(request, permFor(String(b.junction ?? ""), "add")); if (denied) return denied;
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
      if (error) {
        await auditLinks(request, b.junction, "add", rows.slice(0, count) as Pair[], { bulk: true, partial: true });
        return NextResponse.json({ error: error.message, count }, { status: 500 });
      }
      count += chunk.length;
    }
    await auditLinks(request, b.junction, "add", rows as Pair[], { bulk: true });
    return NextResponse.json({ ok: true, count });
  }

  if (!b.src_id || !b.tgt_id) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { error } = await supabaseAdmin().from(b.junction).upsert({ src_id: b.src_id, tgt_id: b.tgt_id }, { onConflict: "src_id,tgt_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLinks(request, b.junction, "add", [{ src_id: b.src_id, tgt_id: b.tgt_id }]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const denied = await guardApi(request, permFor(String(b.junction ?? ""), "remove")); if (denied) return denied;
  if (!JT_RE.test(b.junction ?? "")) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });

  // โหมด bulk: { junction, links:[{src_id,tgt_id}] } → group ตาม tgt_id แล้ว .in(src_id) (เร็วกว่ายิงทีละคู่)
  if (Array.isArray(b.links)) {
    const byTgt = new Map<string, string[]>();
    for (const l of b.links as { src_id?: string; tgt_id?: string }[]) {
      if (l?.src_id && l?.tgt_id) { const a = byTgt.get(l.tgt_id) ?? []; a.push(l.src_id); byTgt.set(l.tgt_id, a); }
    }
    let count = 0;
    const done: Pair[] = [];
    for (const [tgt, srcs] of byTgt) {
      for (let i = 0; i < srcs.length; i += 500) {
        const chunk = srcs.slice(i, i + 500);
        const { error } = await supabaseAdmin().from(b.junction).delete().eq("tgt_id", tgt).in("src_id", chunk);
        if (error) {
          await auditLinks(request, b.junction, "remove", done, { bulk: true, partial: true });
          return NextResponse.json({ error: error.message, count }, { status: 500 });
        }
        count += chunk.length;
        done.push(...chunk.map((src_id) => ({ src_id, tgt_id: tgt })));
      }
    }
    await auditLinks(request, b.junction, "remove", done, { bulk: true });
    return NextResponse.json({ ok: true, count });
  }

  if (!b.src_id || !b.tgt_id) return NextResponse.json({ error: "param ไม่ถูกต้อง" }, { status: 400 });
  const { error } = await supabaseAdmin().from(b.junction).delete().eq("src_id", b.src_id).eq("tgt_id", b.tgt_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLinks(request, b.junction, "remove", [{ src_id: b.src_id, tgt_id: b.tgt_id }]);
  return NextResponse.json({ ok: true });
}
