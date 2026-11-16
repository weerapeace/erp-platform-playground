/**
 * 📁 ไฟล์แนบสินค้า (Parent SKU / SKU ลูก) ใน Google Drive — ไฟล์ใหญ่ได้ถึง 5GB (เดิมเก็บ Supabase ได้ 50MB)
 *   โฟลเดอร์ของสินค้า: <โฟลเดอร์แบรนด์>/Parent SKU/<รหัส ชื่อ>  ·  SKU ลูก: <โฟลเดอร์แบรนด์>/SKU/<รหัส ชื่อ>
 *   โฟลเดอร์กลาง (โลโก้ ป้าย แพ็กเกจ ฯลฯ): <โฟลเดอร์แบรนด์>/ไฟล์กลาง — เลือกไฟล์มาแนบ = สร้าง "ทางลัด" ในโฟลเดอร์สินค้า
 *     (ไฟล์จริงมีที่เดียว แก้โลโก้ทีเดียวทุกสินค้าเห็นตัวใหม่)
 *   โฟลเดอร์แบรนด์ = ตัวเดียวกับใบงานออกแบบ (brandBaseFolder) · แบรนด์ที่ยังไม่ตั้ง = โฟลเดอร์ "งาน ERP"
 * ใช้ที่: /api/product-drive/[entity]/[id]/* · /api/drive/browse · doc: docs/product-drive-files.md
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveEnsureFolder, driveFindFolder, driveGetEntry, driveGetFolder } from "@/lib/google-drive";
import { brandBaseFolder } from "@/lib/design-sheet-drive-server";
import { safeDriveName } from "@/lib/content-drive";

type Admin = ReturnType<typeof supabaseAdmin>;

export const PRODUCT_DRIVE_ENTITIES = ["parent_skus_v2", "skus_v2"] as const;
export type ProductDriveEntity = (typeof PRODUCT_DRIVE_ENTITIES)[number];
export const isProductDriveEntity = (s: string): s is ProductDriveEntity => (PRODUCT_DRIVE_ENTITIES as readonly string[]).includes(s);

/** ชื่อโฟลเดอร์ย่อยใต้โฟลเดอร์แบรนด์ */
export const PRODUCT_DRIVE_PARENT: Record<ProductDriveEntity, string> = { parent_skus_v2: "Parent SKU", skus_v2: "SKU" };
/** โฟลเดอร์กลางของแบรนด์ (โลโก้ ฯลฯ) */
export const CENTRAL_FILES_FOLDER = "ไฟล์กลาง";

export type ProductDriveRow = { entity: ProductDriveEntity; id: string; code: string | null; name: string | null; brand_id: string | null };

export const productFolderName = (r: Pick<ProductDriveRow, "id" | "code" | "name">) => safeDriveName(`${r.code ?? ""} ${r.name ?? ""}`) || r.id;
const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/** อ่านรหัส/ชื่อ/แบรนด์ของสินค้า (SKU ลูกใช้แบรนด์ของ Parent) · ไม่เจอ = null */
export async function loadProductDriveRow(admin: Admin, entity: ProductDriveEntity, id: string): Promise<ProductDriveRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (entity === "parent_skus_v2") {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, name_en, brand_id").eq("id", id).maybeSingle();
    const r = data as { id: string; code: string | null; name_th: string | null; name_en: string | null; brand_id: string | null } | null;
    return r ? { entity, id: r.id, code: r.code, name: r.name_th || r.name_en, brand_id: r.brand_id } : null;
  }
  const { data } = await admin.from("skus_v2").select("id, code, name_th, name_en, parent_sku_id").eq("id", id).maybeSingle();
  const r = data as { id: string; code: string | null; name_th: string | null; name_en: string | null; parent_sku_id: string | null } | null;
  if (!r) return null;
  let brand_id: string | null = null;
  if (r.parent_sku_id) {
    const { data: p } = await admin.from("parent_skus_v2").select("brand_id").eq("id", r.parent_sku_id).maybeSingle();
    brand_id = (p as { brand_id?: string | null } | null)?.brand_id ?? null;
  }
  return { entity, id: r.id, code: r.code, name: r.name_th || r.name_en, brand_id };
}

/** หาโฟลเดอร์ของสินค้า (ดูอย่างเดียว ไม่สร้าง) → null = ยังไม่มี (สร้างตอนแนบไฟล์แรก) */
export async function findProductFolder(admin: Admin, r: ProductDriveRow): Promise<{ id: string; url: string } | null> {
  if (!driveConfigured()) return null;
  const parent = await driveFindFolder(PRODUCT_DRIVE_PARENT[r.entity], await brandBaseFolder(admin, r.brand_id));
  if (!parent) return null;
  const id = await driveFindFolder(productFolderName(r), parent);
  return id ? { id, url: folderUrl(id) } : null;
}

/** หา/สร้างโฟลเดอร์ของสินค้า */
export async function ensureProductFolder(admin: Admin, r: ProductDriveRow): Promise<{ id: string; url: string }> {
  if (!driveConfigured()) throw new Error("ยังไม่ได้เชื่อม Google Drive (แจ้งผู้ดูแลระบบ)");
  const parent = await driveEnsureFolder(PRODUCT_DRIVE_PARENT[r.entity], await brandBaseFolder(admin, r.brand_id));
  const id = await driveEnsureFolder(productFolderName(r), parent);
  return { id, url: folderUrl(id) };
}

/** โฟลเดอร์กลางของแบรนด์ (สร้างให้ถ้ายังไม่มี) */
export async function ensureCentralFolder(admin: Admin, brandId: string | null): Promise<{ id: string; name: string }> {
  if (!driveConfigured()) throw new Error("ยังไม่ได้เชื่อม Google Drive (แจ้งผู้ดูแลระบบ)");
  const base = await brandBaseFolder(admin, brandId);
  const id = await driveEnsureFolder(CENTRAL_FILES_FOLDER, base);
  const f = await driveGetFolder(id).catch(() => null);
  return { id, name: f?.name || CENTRAL_FILES_FOLDER };
}

/**
 * ไล่จาก folderId ขึ้นไปหา rootId (กันส่ง id โฟลเดอร์อื่นในไดรฟ์มาเปิดดู) → breadcrumb จาก root ถึงโฟลเดอร์นั้น
 * ไม่อยู่ใต้ root (ลึกไม่เกิน 12 ชั้น) = null
 */
export async function pathUnderRoot(folderId: string, rootId: string, rootName: string): Promise<{ id: string; name: string }[] | null> {
  if (folderId === rootId) return [{ id: rootId, name: rootName }];
  const chain: { id: string; name: string }[] = [];
  let cur = folderId;
  for (let i = 0; i < 12; i++) {
    const e = await driveGetEntry(cur);
    if (!e || !e.isFolder) return null;
    chain.unshift({ id: e.id, name: e.name });
    const up = e.parents[0];
    if (!up) return null;
    if (up === rootId) return [{ id: rootId, name: rootName }, ...chain];
    cur = up;
  }
  return null;
}

/** ไฟล์ fileId อยู่ในโฟลเดอร์ folderId จริงไหม (กันลบไฟล์นอกโฟลเดอร์สินค้า) */
export async function fileIsInFolder(fileId: string, folderId: string): Promise<boolean> {
  const e = await driveGetEntry(fileId);
  return !!e && !e.isFolder && e.parents.includes(folderId);
}

/** ป้ายบอกที่มาไฟล์ในกล่อง: ทางลัดจากโฟลเดอร์กลาง / อัปเอง */
export type ProductDriveSource = "shortcut" | "upload";
