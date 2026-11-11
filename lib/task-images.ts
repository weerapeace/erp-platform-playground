/**
 * task-images — รวม "รูปทั้งหมดของงาน" แบ่งกลุ่มไว้ให้ปุ่ม "ดูรูป" ในลิ้นชักงาน (pure · ไม่ยิง DB · ทดสอบได้)
 *
 * กลุ่ม: Parent SKU → SKU ลูก (แยกตามรหัส/สี) → Description → คอนเทนต์ของงาน
 * ลำดับ + ตัดรูปซ้ำของสินค้า ใช้ของกลางเดิม lib/parent-sku-images (assembleParentImages) ตัวเดียวกับตัวเลือกรูป
 *   → รูปเดียวกัน (r2 key ซ้ำ) โชว์ครั้งเดียว ที่กลุ่มแรกที่เจอ · SKU ที่ไม่มีรูปยังอยู่ในรายการ (หน้าเว็บขึ้นเตือน "ยังไม่มีรูป")
 * เก็บแค่ r2 key — หน้าเว็บทำ URL เองด้วย r2ImageUrl (ย่อรูปได้)
 *
 * ใช้ที่: app/api/creative-tasks/[id]/images (ประกอบผล) · app/tasks/task-images-viewer.tsx (แสดง)
 */
import { assembleParentImages, pendingAssetRow, type GalleryAtt, type UsageImg } from "@/lib/parent-sku-images";

export type TaskImage = { key: string; cover?: boolean };
export type TaskImageSku = { id: string; code: string; color: string | null; images: TaskImage[] };
export type TaskImageParent = { id: string; code: string; name: string; images: TaskImage[]; description: TaskImage[]; skus: TaskImageSku[] };
export type TaskImageContent = { id: string; title: string; status: string | null; images: TaskImage[] };
export type TaskImagesPayload = { parents: TaskImageParent[]; contents: TaskImageContent[] };

/** แถวแกลเลอรีสินค้า + ธงรูปหลัก (ใช้ทำป้าย "ปก") */
export type TaskGalleryAtt = GalleryAtt & { is_primary?: boolean | null };
/** การผูกรูปในคลัง (asset_usages) ที่ join ไฟล์แล้ว */
export type TaskUsageRow = { module: string; record_id: string; asset: { id: string; r2_key: string; file_name: string | null; content_type: string | null; size_bytes: number | null; created_at: string } };
export type TaskContentAtt = { content_id: string; r2_key: string | null; content_type: string | null };

const isImage = (ct: string | null | undefined) => !ct || ct.startsWith("image/");

/** Parent ของงานเรียงตามความสำคัญ: Parent หลักของงาน → Parent ที่ผูกเพิ่ม → Parent ของ SKU ที่ผูกงาน (ไม่ซ้ำ) */
export function orderTaskParentIds(mainId: string | null | undefined, linkedIds: (string | null | undefined)[], skuParentIds: (string | null | undefined)[], limit = 10): string[] {
  const out: string[] = [];
  for (const id of [mainId, ...linkedIds, ...skuParentIds]) if (id && !out.includes(id)) out.push(id);
  return out.slice(0, limit);
}

export function buildTaskImages(args: {
  parentIds: string[];
  parents: { id: string; code: string | null; name_th: string | null }[];
  skus: { id: string; code: string | null; parent_sku_id: string; color_th?: string | null; color?: string | null }[];
  atts: TaskGalleryAtt[];          // เรียงมาแล้ว: รูปหลักก่อน → sort_order → created_at
  usages: TaskUsageRow[];          // เรียงมาแล้ว: sort_order → created_at
  contents: { id: string; title: string | null; status: string | null }[];
  contentAtts: TaskContentAtt[];   // เรียงตามเวลาที่แนบ
}): TaskImagesPayload {
  const { parentIds, parents, skus, atts, usages, contents, contentAtts } = args;
  const byId = new Map(parents.map((p) => [p.id, p]));
  const covers = new Set(atts.filter((a) => a.is_primary).map((a) => a.file_path));
  // รูปในคลัง → แถวชั่วคราวรูปแบบเดียวกับตัวเลือกรูป (ใช้แค่ r2 key + ชนิดไฟล์)
  const usageImgs: UsageImg[] = usages.map((u) => ({
    module: u.module, record_id: u.record_id,
    asset: pendingAssetRow({ id: u.asset.id, entity_type: "", entity_id: "", file_name: u.asset.file_name, file_path: u.asset.r2_key, public_url: null, content_type: u.asset.content_type, size_bytes: u.asset.size_bytes, created_at: u.asset.created_at }, ""),
  }));
  const img = (key: string): TaskImage => (covers.has(key) ? { key, cover: true } : { key });

  const outParents: TaskImageParent[] = [];
  for (const pid of parentIds) {
    const p = byId.get(pid);
    if (!p) continue;   // Parent ถูกลบ/หาไม่เจอ → ข้าม
    const code = p.code ?? "";
    const mySkus = skus.filter((s) => s.parent_sku_id === pid).map((s) => ({ id: s.id, code: s.code ?? "" }));
    const items = assembleParentImages({ parent: { id: pid, code }, skus: mySkus, atts, usages: usageImgs, assetByKey: new Map(), type: "image" });
    const skuImgs = new Map<string, TaskImage[]>();
    const parentImgs: TaskImage[] = [], descImgs: TaskImage[] = [];
    for (const it of items) {
      const k = it.asset.r2_key;
      if (it.group === "parent") parentImgs.push(img(k));
      else if (it.group === "description") descImgs.push({ key: k });
      else { const arr = skuImgs.get(it.owner) ?? []; arr.push(img(k)); skuImgs.set(it.owner, arr); }
    }
    outParents.push({
      id: pid, code, name: p.name_th ?? "", images: parentImgs, description: descImgs,
      skus: skus.filter((s) => s.parent_sku_id === pid).map((s) => ({ id: s.id, code: s.code ?? "", color: s.color_th || s.color || null, images: skuImgs.get(s.code ?? "") ?? [] })),
    });
  }

  const outContents: TaskImageContent[] = contents.map((c) => {
    const seen = new Set<string>();
    const images: TaskImage[] = [];
    for (const a of contentAtts) {
      if (a.content_id !== c.id || !a.r2_key || !isImage(a.content_type) || seen.has(a.r2_key)) continue;
      seen.add(a.r2_key);
      images.push({ key: a.r2_key });
    }
    return { id: c.id, title: c.title ?? "", status: c.status, images };
  });

  return { parents: outParents, contents: outContents };
}

/** นับรูปทั้งหมด (ไว้โชว์บนปุ่ม/หัวป๊อป) */
export function countTaskImages(p: TaskImagesPayload): number {
  let n = 0;
  for (const x of p.parents) n += x.images.length + x.description.length + x.skus.reduce((s, k) => s + k.images.length, 0);
  for (const c of p.contents) n += c.images.length;
  return n;
}
