/**
 * 🖼 ชุดรูปกลาง — ส่วนอ่าน DB (ฝั่งเซิร์ฟเวอร์) · กฎ/ตัวแทนรูปอยู่ lib/website-image-sets.ts
 * ใช้ที่: API สาธารณะ site/page (แทนค่า imgset/ ก่อนส่งให้เว็บร้าน) · /api/r2-image (ค่าที่หลุดมา) · /api/website/image-sets (ERP)
 */
import { effectiveVersion, imgSetIdOf, resolveImageSets, rowToImageSet, type FocusMap, type ImageSet } from "@/lib/website-image-sets";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export const IMAGE_SET_SELECT = "id, name, link, alt, cur, draft, queue, history, updated_at, updated_by_name";

/** ชุดรูปทั้งหมดของร้าน (เรียงตามชื่อ) */
export async function readImageSets(sb: Admin, shopId: string): Promise<ImageSet[]> {
  const { data } = await sb.from("store_image_sets").select(IMAGE_SET_SELECT).eq("shop_id", shopId).order("name");
  return ((data ?? []) as Record<string, unknown>[]).map(rowToImageSet);
}

/** มีค่า imgset/ อยู่ในก้อนข้อมูลไหม (ไม่มี = ไม่ต้องอ่าน DB) */
export function hasImageSetRef(data: unknown): boolean {
  return /"imgset\/[0-9a-f-]{36}"/i.test(JSON.stringify(data ?? null));
}

/**
 * แทน imgset/ ในหลายก้อน (โครงหน้า · ธีม) ด้วยรูปปัจจุบันของชุด — อ่าน DB ครั้งเดียว · ไม่มีการผูกเลย = คืนของเดิม
 * focus = จุดสำคัญของรูปที่มาจากชุด (เว็บร้าน LoadImg ใส่ object-position) · draft = พรีวิว (เห็นร่างของชุดก่อนขึ้นเว็บ)
 */
export async function resolveForStorefront<T extends Record<string, unknown>>(sb: Admin, shopId: string, parts: T, opts: { draft?: boolean; now?: number } = {}): Promise<{ parts: T; focus: FocusMap }> {
  if (!hasImageSetRef(parts)) return { parts, focus: {} };
  const sets = new Map((await readImageSets(sb, shopId)).map((s) => [s.id, s]));
  const r = resolveImageSets(parts, sets, opts.now ?? Date.now(), { draft: opts.draft });
  return { parts: r.data, focus: r.focus };
}

/** /api/r2-image ได้ค่า imgset/<id> (หลุดมาจากที่ที่ไม่ได้แทนค่า เช่น พรีวิวสด) → r2 key ของรูปคอมตอนนี้ · ไม่มี = null */
export async function imageSetKeyNow(sb: Admin, ref: string, mobile = false): Promise<string | null> {
  const id = imgSetIdOf(ref);
  if (!id) return null;
  const { data } = await sb.from("store_image_sets").select(IMAGE_SET_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const v = effectiveVersion(rowToImageSet(data as Record<string, unknown>));
  return mobile ? v.mob ?? v.desk : v.desk ?? v.mob;
}
