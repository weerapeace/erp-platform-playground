/**
 * /api/color-tones — 🎨 โทนสี (ของกลาง ใช้ทุกร้าน) สำหรับตัวกรอง "กรองตามสี" บนเว็บร้าน · ตาราง erp_color_tones
 *   GET  → { tones, used: ชื่อสีของ SKU บนเว็บ (นับ SKU + ร้าน), swatches: จุดสีจากทะเบียนสี }
 *   POST { action: "create", name, hex }                      → เพิ่มโทน
 *        { action: "update", id, name?, hex?, keywords? }       → แก้ชื่อ/สี/คำขึ้นต้นที่จับอัตโนมัติ
 *        { action: "assign", color, toneId }                    → ย้ายชื่อสีเข้าโทนนี้ (ออกจากโทนอื่นอัตโนมัติ — 1 สี 1 โทน)
 *        { action: "unassign", color, toneId }                  → เอาออกจากโทน (ย้ายเข้าเอง = ลบ · จับอัตโนมัติ = ใส่ข้อยกเว้น)
 *        { action: "delete", id } · { action: "reorder", ids }
 * ตรรกะว่าสีไหนอยู่โทนไหน = lib/color-tone.ts (ตัวเดียวกับที่ API สินค้าสาธารณะใช้)
 * สิทธิ์เหมือนทะเบียนสี: อ่าน = products.view · แก้ = products.edit · ทุกการแก้เขียน audit + สั่งเว็บร้านทุกร้านล้างแคช
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { rowToSwatchEntry, SWATCH_SELECT, normColorName } from "@/lib/color-swatch";
import { rowToTone, TONE_SELECT } from "@/lib/color-tone";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ToneRow = Parameters<typeof rowToTone>[0];
const HEX = /^#[0-9a-f]{6}$/i;
const cleanList = (v: unknown, max = 40) =>
  Array.isArray(v) ? [...new Set(v.map((x) => normColorName(String(x ?? ""))).filter(Boolean))].slice(0, max) : [];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const [{ data: tones, error }, { data: dict }, { data: listings }, { data: shops }] = await Promise.all([
    sb.from("erp_color_tones").select(TONE_SELECT).eq("is_active", true).order("sort_order"),
    sb.from("erp_color_dictionary").select(SWATCH_SELECT).eq("is_active", true),
    sb.from("store_listings").select("parent_sku_id, shop_id").eq("is_published", true),
    sb.from("shops").select("id, name"),
  ]);
  if (error) return NextResponse.json({ error: "โหลดโทนสีไม่สำเร็จ" }, { status: 500 });

  // ชื่อสีที่ SKU บนเว็บใช้อยู่จริง (ทุกร้านที่เผยแพร่) — ไว้จัดเข้าโทน
  const shopName = new Map(((shops ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const shopsByParent = new Map<string, Set<string>>();
  for (const l of (listings ?? []) as { parent_sku_id: string; shop_id: string }[]) {
    const set = shopsByParent.get(l.parent_sku_id) ?? new Set<string>();
    set.add(shopName.get(l.shop_id) ?? "");
    shopsByParent.set(l.parent_sku_id, set);
  }
  const parentIds = [...shopsByParent.keys()];
  const used = new Map<string, { name: string; skus: number; products: Set<string>; shops: Set<string> }>();
  for (let i = 0; i < parentIds.length; i += 200) {
    const { data: kids } = await sb.from("skus_v2").select("parent_sku_id, color").in("parent_sku_id", parentIds.slice(i, i + 200)).eq("is_active", true);
    for (const k of (kids ?? []) as { parent_sku_id: string; color: string | null }[]) {
      const name = (k.color ?? "").trim();
      if (!name) continue;
      const key = normColorName(name);
      const u = used.get(key) ?? { name, skus: 0, products: new Set<string>(), shops: new Set<string>() };
      u.skus += 1;
      u.products.add(k.parent_sku_id);
      for (const s of shopsByParent.get(k.parent_sku_id) ?? []) if (s) u.shops.add(s);
      used.set(key, u);
    }
  }

  return NextResponse.json({
    tones: ((tones ?? []) as ToneRow[]).map(rowToTone),
    used: [...used.values()].map((u) => ({ name: u.name, skus: u.skus, products: u.products.size, shops: [...u.shops].sort() })),
    swatches: ((dict ?? []) as Parameters<typeof rowToSwatchEntry>[0][]).map(rowToSwatchEntry),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit) จึงจัดโทนสีได้" }, { status: 401 });
  let b: { action?: string; id?: string; ids?: unknown; name?: string; hex?: string; keywords?: unknown; color?: string; toneId?: string };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const now = new Date().toISOString();
  const audit = (metadata: Record<string, unknown>, entityId?: string) =>
    writeAudit(sb, { action: "update", entityType: "color_tone", entityId: entityId ?? null, ...actor, metadata });
  const done = async (extra: Record<string, unknown> = {}) => {
    // โทนเปลี่ยน = ตัวกรองบนเว็บเปลี่ยน → สั่งทุกร้านล้างแคช (ล้มเหลว = เว็บอัปเดตเองใน ≤60 วิ)
    const { data: active } = await sb.from("shops").select("id").eq("status", "active");
    await Promise.all(((active ?? []) as { id: string }[]).map((s) => purgeStorefrontCache(sb, s.id)));
    return NextResponse.json({ ok: true, ...extra });
  };
  const loadAll = async () => {
    const { data } = await sb.from("erp_color_tones").select(TONE_SELECT).eq("is_active", true);
    return ((data ?? []) as ToneRow[]).map(rowToTone);
  };

  switch (b.action) {
    case "create": {
      const name = String(b.name ?? "").trim().slice(0, 40);
      if (!name) return NextResponse.json({ error: "ใส่ชื่อโทนก่อน" }, { status: 400 });
      const hex = HEX.test(String(b.hex ?? "")) ? String(b.hex) : "#888888";
      const { data: last } = await sb.from("erp_color_tones").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const key = `t${Date.now().toString(36)}`;
      const { data, error } = await sb
        .from("erp_color_tones")
        .insert({ key, name, hex, sort_order: (Number((last as { sort_order?: number } | null)?.sort_order) || 0) + 1, updated_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: "เพิ่มโทนไม่สำเร็จ" }, { status: 500 });
      await writeAudit(sb, { action: "create", entityType: "color_tone", entityId: (data as { id: string }).id, ...actor, metadata: { name, hex } });
      return done({ id: (data as { id: string }).id });
    }
    case "update": {
      if (!b.id) return NextResponse.json({ error: "ต้องระบุโทน" }, { status: 400 });
      const row: Record<string, unknown> = { updated_at: now, updated_by: user?.id ?? null };
      if (b.name !== undefined) {
        const name = String(b.name).trim().slice(0, 40);
        if (!name) return NextResponse.json({ error: "ชื่อโทนว่างไม่ได้" }, { status: 400 });
        row.name = name;
      }
      if (b.hex !== undefined) {
        if (!HEX.test(String(b.hex))) return NextResponse.json({ error: "สีไม่ถูกต้อง (#RRGGBB)" }, { status: 400 });
        row.hex = String(b.hex);
      }
      if (b.keywords !== undefined) row.keywords = cleanList(b.keywords, 20);
      const { error } = await sb.from("erp_color_tones").update(row).eq("id", b.id);
      if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
      await audit({ kind: "update", ...row }, b.id);
      return done();
    }
    case "assign":
    case "unassign": {
      const color = normColorName(String(b.color ?? ""));
      if (!color || !b.toneId) return NextResponse.json({ error: "ต้องระบุสี + โทน" }, { status: 400 });
      const all = await loadAll();
      const target = all.find((t) => t.id === b.toneId);
      if (!target) return NextResponse.json({ error: "ไม่พบโทนนี้" }, { status: 404 });
      const changes: { id: string; members: string[]; excludes: string[] }[] = [];
      if (b.action === "assign") {
        // 1 สี 1 โทน: เอาออกจากโทนอื่นที่ย้ายเข้าเองไว้ แล้วใส่โทนนี้ (+ ล้างข้อยกเว้นของโทนนี้)
        for (const t of all)
          if (t.id !== target.id && t.members.includes(color)) changes.push({ id: t.id, members: t.members.filter((m) => m !== color), excludes: t.excludes });
        changes.push({ id: target.id, members: [...new Set([...target.members, color])], excludes: target.excludes.filter((x) => x !== color) });
      } else if (target.members.includes(color)) {
        changes.push({ id: target.id, members: target.members.filter((m) => m !== color), excludes: target.excludes });
      } else {
        // จับอัตโนมัติด้วยคำขึ้นต้น → ใส่ข้อยกเว้น (สีนี้ไม่เข้าโทนนี้แล้ว)
        changes.push({ id: target.id, members: target.members, excludes: [...new Set([...target.excludes, color])] });
      }
      for (const c of changes) {
        const { error } = await sb.from("erp_color_tones").update({ members: c.members, excludes: c.excludes, updated_at: now, updated_by: user?.id ?? null }).eq("id", c.id);
        if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
      }
      await audit({ kind: b.action, color, tone: target.name }, target.id);
      return done();
    }
    case "delete": {
      if (!b.id) return NextResponse.json({ error: "ต้องระบุโทน" }, { status: 400 });
      // ปิดใช้งาน (ไม่ลบจริง — กู้คืนได้จากฐานข้อมูล) · สีในโทนนี้กลับไปจับตามคำขึ้นต้นของโทนอื่น
      const { error } = await sb.from("erp_color_tones").update({ is_active: false, updated_at: now, updated_by: user?.id ?? null }).eq("id", b.id);
      if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
      await writeAudit(sb, { action: "delete", entityType: "color_tone", entityId: b.id, ...actor, metadata: {} });
      return done();
    }
    case "reorder": {
      const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
      if (!ids.length) return NextResponse.json({ error: "ต้องระบุลำดับ" }, { status: 400 });
      const res = await Promise.all(ids.map((id, i) => sb.from("erp_color_tones").update({ sort_order: i + 1, updated_at: now }).eq("id", id)));
      if (res.some((r) => r.error)) return NextResponse.json({ error: "เรียงไม่สำเร็จ" }, { status: 500 });
      await audit({ kind: "reorder", ids });
      return done();
    }
    default:
      return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
  }
}
