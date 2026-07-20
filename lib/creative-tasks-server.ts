// ============================================================
// Creative Task Manager — helper ฝั่ง server (ใช้ supabaseAdmin)
// เลขรันงาน, แจ้งเตือน (erp_notifications), แปลง id ผู้ใช้ → ชื่อ
// หมายเหตุ: ผู้รับผิดชอบงาน creative = user จริง (user_profiles) ไม่ใช่ employees แล้ว
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";
import { defaultLineTemplate, renderLineTemplate } from "@/lib/creative-line-templates";
import { driveConfigured, driveCreateFolder, driveGetFolder, driveUploadFile, driveEnsureFolder, driveFindFolder, driveListImages, driveListChildFolders, driveMoveFile, driveTrashFile, DRIVE_ROOT_FOLDER_ID } from "@/lib/google-drive";
import { r2GetObject } from "@/lib/r2";

type Admin = ReturnType<typeof supabaseAdmin>;

// ===== Google Drive: โฟลเดอร์/ไฟล์ต่องาน =====
/** โฟลเดอร์ Drive ของงาน — สร้างถ้ายังไม่มี → {id,url} · null ถ้ายังไม่ตั้งค่า Drive */
export async function ensureDriveFolderForTask(admin: Admin, taskId: string): Promise<{ id: string; url: string } | null> {
  if (!driveConfigured()) return null;
  const { data } = await admin.from("erp_creative_tasks").select("task_no, title, drive_folder_id, drive_folder_url").eq("id", taskId).maybeSingle();
  const t = data as { task_no?: string | null; title?: string | null; drive_folder_id?: string | null; drive_folder_url?: string | null } | null;
  if (!t) return null;
  // มีโฟลเดอร์เดิม → เช็กว่ายังอยู่จริง (ไม่ถูกลบ/trashed) ก่อนใช้ · ถ้าถูกลบไปแล้ว → สร้างใหม่ (self-heal)
  if (t.drive_folder_id && t.drive_folder_url) {
    try { if (await driveGetFolder(t.drive_folder_id)) return { id: t.drive_folder_id, url: t.drive_folder_url }; } catch { /* เช็กไม่ได้ → ถือว่ายังอยู่ กันสร้างซ้ำโดยไม่ตั้งใจ */ return { id: t.drive_folder_id, url: t.drive_folder_url }; }
  }
  const name = `${t.task_no ?? ""} ${t.title ?? ""}`.trim() || "งาน";
  const f = await driveCreateFolder(name, DRIVE_ROOT_FOLDER_ID);
  await admin.from("erp_creative_tasks").update({ drive_folder_url: f.webViewLink, drive_folder_id: f.id }).eq("id", taskId);
  return { id: f.id, url: f.webViewLink };
}

type DriveAtt = { id: string; r2_key?: string | null; file_name?: string | null; content_type?: string | null; drive_file_id?: string | null };
/** อัปไฟล์แนบ 1 ชิ้นขึ้นโฟลเดอร์ Drive (ข้ามถ้าเคยอัปแล้ว/ไม่มี r2_key) — คืน true ถ้าอัปสำเร็จ */
export async function uploadAttachmentToDrive(admin: Admin, folderId: string, att: DriveAtt): Promise<boolean> {
  if (!att.r2_key || att.drive_file_id) return false;
  const obj = await r2GetObject(att.r2_key);
  if (!obj) return false;
  const bytes = new Uint8Array(await new Response(obj.body as ReadableStream).arrayBuffer());
  const name = att.file_name || att.r2_key.split("/").pop() || "file";
  const mime = att.content_type || obj.httpMetadata?.contentType || "application/octet-stream";
  const f = await driveUploadFile(name, mime, bytes, folderId);
  await admin.from("erp_creative_attachments").update({ drive_file_id: f.id }).eq("id", att.id);
  return true;
}

/** สร้างโฟลเดอร์ (ถ้ายังไม่มี) + อัปไฟล์แนบทั้งหมดที่ยังไม่ขึ้น Drive — best-effort ต่อไฟล์ (แบบเดิม/แบน) */
async function syncTaskFilesFlat(admin: Admin, taskId: string): Promise<{ url: string | null; uploaded: number; archived: number; configured: boolean }> {
  const folder = await ensureDriveFolderForTask(admin, taskId);
  if (!folder) return { url: null, uploaded: 0, archived: 0, configured: true };
  const { data: atts } = await admin.from("erp_creative_attachments").select("id, r2_key, file_name, content_type, drive_file_id").eq("task_id", taskId);
  let uploaded = 0;
  for (const a of (atts ?? []) as DriveAtt[]) {
    try { if (await uploadAttachmentToDrive(admin, folder.id, a)) uploaded++; } catch { /* ข้ามไฟล์ที่พลาด */ }
  }
  return { url: folder.url, uploaded, archived: 0, configured: true };
}

/**
 * สร้างโฟลเดอร์ (ถ้ายังไม่มี) + อัปไฟล์ขึ้น Drive
 * - แบรนด์ของงาน "มี" โฟลเดอร์แม่ (ตั้งใน /tasks/settings) → โครงต่อ Parent SKU/child SKU + routing (เฟส 2)
 * - ไม่มี → แบบเดิม (1 โฟลเดอร์แบน)
 */
export type DriveSyncOpts = { destinationName?: string; folderName?: string };
export async function syncTaskFilesToDrive(admin: Admin, taskId: string, opts?: DriveSyncOpts): Promise<{ url: string | null; uploaded: number; archived: number; configured: boolean }> {
  if (!driveConfigured()) return { url: null, uploaded: 0, archived: 0, configured: false };
  const { data: t } = await admin.from("erp_creative_tasks")
    .select("id, task_no, title, brand_id, parent_sku_id").eq("id", taskId).maybeSingle();
  if (!t) return { url: null, uploaded: 0, archived: 0, configured: true };
  const task = t as { id: string; task_no?: string | null; title?: string | null; brand_id?: string | null; parent_sku_id?: string | null };
  const brandParentId = await getBrandParentFolderId(admin, task.brand_id);
  if (brandParentId) return { ...(await syncTaskStructured(admin, task, brandParentId, opts)), configured: true };
  return await syncTaskFilesFlat(admin, taskId);
}

// ===== เฟส 2: โครงโฟลเดอร์ต่อแบรนด์/SKU =====
/** โฟลเดอร์แม่ Drive ของแบรนด์ (ตั้งใน /tasks/settings แท็บ "โฟลเดอร์ต่อแบรนด์") — null ถ้ายังไม่ตั้ง */
async function getBrandParentFolderId(admin: Admin, brandId: string | null | undefined): Promise<string | null> {
  return (await getBrandParentFolder(admin, brandId))?.folder_id || null;
}
async function getBrandParentFolder(admin: Admin, brandId: string | null | undefined): Promise<{ folder_id: string; name: string } | null> {
  if (!brandId) return null;
  const { data } = await admin.from("china_app_settings").select("sval").eq("skey", "brand_drive_folders").maybeSingle();
  const map = ((data as { sval?: Record<string, { folder_id?: string; name?: string }> } | null)?.sval ?? {}) as Record<string, { folder_id?: string; name?: string }>;
  const c = map[brandId];
  return c?.folder_id ? { folder_id: c.folder_id, name: c.name ?? "" } : null;
}

// รหัส Parent SKU (ชื่อโฟลเดอร์บนสุดที่แนะนำ) ของงาน — จาก child code
async function taskParentCode(admin: Admin, task: { task_no?: string | null; title?: string | null; parent_sku_id?: string | null }): Promise<string> {
  const { data: kids } = task.parent_sku_id ? await admin.from("skus_v2").select("code").eq("parent_sku_id", task.parent_sku_id) : { data: [] as { code: string | null }[] };
  const codes = ((kids ?? []) as { code: string | null }[]).map((k) => k.code).filter((c): c is string => !!c);
  return deriveParentCode(codes, task.task_no || task.title || "งาน");
}

/** ข้อมูลสำหรับ popup ยืนยันสร้างโฟลเดอร์ (เฉพาะแบรนด์ที่ตั้งโฟลเดอร์แม่ = โหมดโครงสร้าง) */
export async function driveFolderCreateInfo(admin: Admin, taskId: string): Promise<{
  configured: boolean; structured: boolean; parent_name?: string; suggested_name?: string; suggested_destination?: string; destinations?: { id: string; name: string }[];
}> {
  if (!driveConfigured()) return { configured: false, structured: false };
  const { data: t } = await admin.from("erp_creative_tasks").select("brand_id, parent_sku_id, task_no, title").eq("id", taskId).maybeSingle();
  if (!t) return { configured: false, structured: false };
  const task = t as { brand_id?: string | null; parent_sku_id?: string | null; task_no?: string | null; title?: string | null };
  const bp = await getBrandParentFolder(admin, task.brand_id);
  if (!bp) return { configured: true, structured: false };   // ไม่มีโฟลเดอร์แบรนด์ → โหมดแบน (popup ยืนยันเฉย ๆ)
  const suggested = await taskParentCode(admin, task);
  let destinations: { id: string; name: string }[] = [];
  try { destinations = await driveListChildFolders(bp.folder_id); } catch { destinations = []; }
  // โฟลเดอร์ปลายทางที่แนะนำ = โฟลเดอร์ย่อยที่ชื่อเป็น "คำนำหน้า" ของรหัส (เช่น "TTM" ของ "TTM119") · เอาที่ยาวสุด
  const suggested_destination = destinations.map((d) => d.name).filter((n) => n && suggested.startsWith(n) && n !== suggested).sort((a, b) => b.length - a.length)[0] || "";
  return { configured: true, structured: true, parent_name: bp.name, suggested_name: suggested, suggested_destination, destinations };
}

/** เช็กว่ามีโฟลเดอร์ชื่อ folderName อยู่แล้วในปลายทาง (destinationName ใต้โฟลเดอร์แบรนด์) หรือยัง */
export async function driveFolderExists(admin: Admin, taskId: string, destinationName: string, folderName: string): Promise<boolean> {
  const name = (folderName || "").trim(); if (!name) return false;
  const { data: t } = await admin.from("erp_creative_tasks").select("brand_id").eq("id", taskId).maybeSingle();
  const bp = await getBrandParentFolder(admin, (t as { brand_id?: string | null } | null)?.brand_id);
  if (!bp) return false;
  let parent = bp.folder_id;
  const dest = (destinationName || "").trim();
  if (dest) { const f = await driveFindFolder(dest, bp.folder_id); if (!f) return false; parent = f; }
  return !!(await driveFindFolder(name, parent));
}

/** ชื่อโฟลเดอร์บนสุด = "โค้ด Parent SKU" — เดาจาก child code (ตัดท้าย -0X) ตัวที่พบบ่อยสุด · ไม่มี child → fallback */
function deriveParentCode(childCodes: string[], fallback: string): string {
  const prefixes = childCodes.map((c) => (c || "").replace(/-\d+$/, "").trim()).filter(Boolean);
  if (prefixes.length) {
    const counts = new Map<string, number>();
    for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return (fallback || "งาน").trim();
}

type GalleryImg = { file_path: string; file_name: string | null; content_type: string | null };
async function galleryImages(admin: Admin, entityType: "parent_skus_v2" | "skus_v2", entityId: string): Promise<GalleryImg[]> {
  const { data } = await admin.from("erp_playground_attachments").select("file_path, file_name, content_type").eq("entity_type", entityType).eq("entity_id", entityId).order("sort_order");
  return ((data ?? []) as GalleryImg[]).filter((g) => g.file_path);
}
// นามสกุลไฟล์ (จากชื่อ หรือ content-type) — ใช้ตั้งชื่อรูปเป็นเลขลำดับ (1.jpg, 2.png…)
function extOf(fileName: string | null, contentType: string | null): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(fileName ?? "");
  if (m) return m[1].toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}
type UploadFile = { r2Key: string; name: string; mime: string };
// ตั้งชื่อรูปเป็นเลขลำดับ เริ่มที่ start (Parent=0 [รูป0=ปก] · Description=1 · child SKU=1) ตามลำดับรูป
function numbered(imgs: GalleryImg[], start: number): UploadFile[] {
  return imgs.map((g, i) => ({ r2Key: g.file_path, name: `${start + i}.${extOf(g.file_name, g.content_type)}`, mime: g.content_type || "image/jpeg" }));
}

// รูป "Description" ของ Parent SKU — จาก asset_usages (module=parent_sku_description) → assets (r2_key) เรียงตาม sort_order
async function descriptionImages(admin: Admin, parentId: string): Promise<GalleryImg[]> {
  const { data: u } = await admin.from("asset_usages").select("asset_id, sort_order, created_at")
    .eq("module", "parent_sku_description").eq("record_id", parentId)
    .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
  const ids = ((u ?? []) as { asset_id: string }[]).map((x) => x.asset_id);
  if (ids.length === 0) return [];
  const { data: assets } = await admin.from("assets").select("id, r2_key, file_name, content_type").in("id", [...new Set(ids)]);
  const byId = new Map(((assets ?? []) as { id: string; r2_key: string | null; file_name: string | null; content_type: string | null }[]).map((a) => [a.id, a]));
  return ids.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a && !!a.r2_key)
    .map((a) => ({ file_path: a.r2_key as string, file_name: a.file_name, content_type: a.content_type }));
}

/**
 * วางรูปในโฟลเดอร์แบบ "กดซ้ำ = เก็บเวอร์ชัน" (ตามที่เจ้าของเลือก · เพราะชื่อไฟล์เป็นเลขลำดับ เทียบด้วยชื่อไม่ได้):
 * - มีรูปเดิมอยู่ → ย้ายทั้งหมดเข้า subfolder `Ver.N` (N เพิ่มเรื่อย ๆ) ก่อน · แล้ววางรูปชุดใหม่ (ชื่อตามที่ตั้งมา) · อัปขนาน
 * คืน { uploaded, archived }
 */
async function replaceFolderImages(folderId: string, files: UploadFile[]): Promise<{ uploaded: number; archived: number }> {
  let existing: { id: string; name: string }[] = [];
  try { existing = await driveListImages(folderId); } catch { existing = []; }
  let archived = 0;
  if (existing.length) {
    let verFolders: { id: string; name: string }[] = [];
    try { verFolders = await driveListChildFolders(folderId); } catch { verFolders = []; }
    const maxN = verFolders.reduce((m, f) => { const x = /^Ver\.(\d+)$/.exec(f.name); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    const verId = await driveEnsureFolder(`Ver.${maxN + 1}`, folderId);
    for (const e of existing) { try { if (await driveMoveFile(e.id, verId, folderId)) archived++; } catch { /* ข้าม */ } }
  }
  const results = await Promise.all(files.map(async (f) => {
    try {
      const obj = await r2GetObject(f.r2Key); if (!obj) return 0;
      const bytes = new Uint8Array(await new Response(obj.body as ReadableStream).arrayBuffer());
      await driveUploadFile(f.name, f.mime || obj.httpMetadata?.contentType || "image/jpeg", bytes, folderId);
      return 1;
    } catch { return 0; }
  }));
  return { uploaded: results.reduce((a: number, b: number) => a + b, 0), archived };
}

// เทียบว่ารายการ r2 key เหมือนเดิมไหม (รวมลำดับ เพราะลำดับมีผลกับเลขรูป 0,1,2)
function sameKeys(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// วางไฟล์แบบ "ทับไปเลย" (ไม่ทำ Ver) — มีไฟล์ชื่อเดิมอยู่ → ทิ้งลงถังขยะก่อน แล้วอัปใหม่
// ใช้กับรูปปกหลวมข้าง top (ตามที่เจ้าของสั่ง: รูปข้างนอกไม่ต้องทำ Ver.1 ทับไปเลย)
async function overwriteFiles(folderId: string, files: UploadFile[]): Promise<{ uploaded: number }> {
  let existing: { id: string; name: string }[] = [];
  try { existing = await driveListImages(folderId); } catch { existing = []; }
  const byName = new Map(existing.map((e) => [e.name, e.id]));
  const results = await Promise.all(files.map(async (f) => {
    try {
      const oldId = byName.get(f.name);
      if (oldId) { try { await driveTrashFile(oldId); } catch { /* ข้าม */ } }
      const obj = await r2GetObject(f.r2Key); if (!obj) return 0;
      const bytes = new Uint8Array(await new Response(obj.body as ReadableStream).arrayBuffer());
      await driveUploadFile(f.name, f.mime || obj.httpMetadata?.contentType || "image/jpeg", bytes, folderId);
      return 1;
    } catch { return 0; }
  }));
  return { uploaded: results.reduce((a: number, b: number) => a + b, 0) };
}

async function syncTaskStructured(
  admin: Admin,
  task: { id: string; task_no?: string | null; title?: string | null; parent_sku_id?: string | null },
  brandParentId: string,
  opts?: DriveSyncOpts,
): Promise<{ url: string; uploaded: number; archived: number }> {
  // child SKU (id+code) ของ Parent SKU
  const { data: kids } = task.parent_sku_id
    ? await admin.from("skus_v2").select("id, code").eq("parent_sku_id", task.parent_sku_id).order("code")
    : { data: [] as { id: string; code: string }[] };
  const children = ((kids ?? []) as { id: string; code: string | null }[]).filter((c): c is { id: string; code: string } => !!c.code);
  const parentCode = deriveParentCode(children.map((c) => c.code), task.task_no || task.title || "งาน");

  // popup: เลือกโฟลเดอร์ปลายทาง (เช่น TTM) ใต้โฟลเดอร์แบรนด์ + ตั้งชื่อโฟลเดอร์บนสุดเองได้
  const parentFolder = opts?.destinationName?.trim() ? await driveEnsureFolder(opts.destinationName.trim(), brandParentId) : brandParentId;
  const topName = opts?.folderName?.trim() || parentCode;
  // โครงแบน: <topName>/ { [01] Description, <parentCode> (รูป Parent), <childCode>… (child ตรง ๆ ไม่มี "SKU" ครอบ) }
  const topId = await driveEnsureFolder(topName, parentFolder);
  const descF = await driveEnsureFolder("[01] Description", topId);
  const parentF = await driveEnsureFolder(parentCode, topId);   // โฟลเดอร์รูป Parent = รหัส (เปลี่ยนจาก "Parent SKU")
  const topUrl = `https://drive.google.com/drive/folders/${topId}`;

  // manifest ครั้งก่อน (จำ r2 key ต่อโฟลเดอร์) — เชื่อได้เฉพาะถ้าโฟลเดอร์บนสุดยังเป็นตัวเดิม
  // (ถ้าของเก่าถูกลบ driveEnsureFolder จะสร้างใหม่ = id เปลี่ยน → ถือว่าเริ่มใหม่ อัปครบ)
  const { data: mrow } = await admin.from("erp_creative_tasks").select("drive_folder_id, drive_sync_manifest").eq("id", task.id).maybeSingle();
  const prevTopId = (mrow?.drive_folder_id as string | null) ?? null;
  const prevManifest: Record<string, string[]> = (prevTopId === topId ? ((mrow?.drive_sync_manifest as Record<string, string[]> | null) ?? {}) : {});
  const nextManifest: Record<string, string[]> = { ...prevManifest };
  await admin.from("erp_creative_tasks").update({ drive_folder_id: topId, drive_folder_url: topUrl }).eq("id", task.id);

  let uploaded = 0, archived = 0;
  // ซิงค์โฟลเดอร์แบบ "เทียบก่อน แก้เฉพาะที่เปลี่ยน": รายการรูป (r2 key + ลำดับ) เหมือนเดิม → ข้าม · เปลี่ยน → เก็บ Ver เก่า + วางใหม่
  const syncFolder = async (key: string, folderId: string, imgs: GalleryImg[], start: number) => {
    const keys = imgs.map((g) => g.file_path);
    if (sameKeys(prevManifest[key], keys)) return;   // ไม่เปลี่ยน → ไม่ทำอะไร (ไม่มี Ver ซ้ำซ้อน)
    const r = await replaceFolderImages(folderId, numbered(imgs, start));
    uploaded += r.uploaded; archived += r.archived;
    nextManifest[key] = keys;
  };

  // Description → 1,2,3 · Parent gallery → 0,1,2,3 (รูป 0 = ปกของ Parent)
  if (task.parent_sku_id) {
    await syncFolder("desc", descF, await descriptionImages(admin, task.parent_sku_id), 1);
    await syncFolder("parent", parentF, await galleryImages(admin, "parent_skus_v2", task.parent_sku_id), 0);
  }
  // child แต่ละตัว → 1,2,3 (ไม่มี 0 · ปก = ไฟล์หลวมข้างนอก) · เก็บรูปสำเนา (รูปแรก) ไว้วางข้าง top
  const covers: UploadFile[] = [];
  const coverKeys: string[] = [];
  for (const c of children) {
    const cf = await driveEnsureFolder(c.code, topId);
    const imgs = await galleryImages(admin, "skus_v2", c.id);
    await syncFolder(`child:${c.code}`, cf, imgs, 1);
    if (imgs.length) {
      covers.push({ r2Key: imgs[0].file_path, name: `${c.code}.${extOf(imgs[0].file_name, imgs[0].content_type)}`, mime: imgs[0].content_type || "image/jpeg" });
      coverKeys.push(`${c.code}=${imgs[0].file_path}`);
    }
  }
  // รูปปกหลวมข้าง top — "ทับไปเลย" ไม่ทำ Ver · ข้ามถ้าปกไม่เปลี่ยน
  if (!sameKeys(prevManifest["covers"], coverKeys)) {
    const r = await overwriteFiles(topId, covers);
    uploaded += r.uploaded;
    nextManifest["covers"] = coverKeys;
  }

  await admin.from("erp_creative_tasks").update({ drive_sync_manifest: nextManifest }).eq("id", task.id);
  return { url: topUrl, uploaded, archived };
}

/**
 * แจ้งเตือนเข้ากลุ่ม LINE ของทีม Creative (reuse line_config ของ china-pay)
 * ส่งกลุ่ม "creative" ถ้าตั้งไว้ ไม่งั้นใช้กลุ่มหลัก (group_id) · เงียบถ้ายังไม่ตั้งค่า/ล้มเหลว (ไม่กระทบการบันทึก)
 */
export async function pushTasksLine(admin: Admin, text: string): Promise<void> {
  try {
    const { data: row } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
    const cfg = (row?.sval ?? {}) as { token?: string; group_id?: string; groups?: Record<string, string> };
    const target = cfg.groups?.creative || cfg.group_id || "";
    if (!cfg.token || !target) return;
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: target, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
  } catch { /* เงียบ — LINE ล้มไม่กระทบการบันทึก */ }
}

/**
 * แจ้งเตือนเข้ากลุ่ม LINE ตาม "แม่แบบข้อความต่อเหตุการณ์" (line_config.templates[eventKey])
 * ไม่มีแม่แบบที่ตั้งเอง → ใช้ค่าเริ่มต้น · แทนตัวแปร {…} ด้วย vars · เงียบถ้าไม่มี config/ล้ม
 */
export async function pushTasksLineTpl(admin: Admin, eventKey: string, vars: Record<string, unknown>): Promise<void> {
  try {
    const { data: row } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
    const cfg = (row?.sval ?? {}) as { token?: string; group_id?: string; groups?: Record<string, string>; templates?: Record<string, string> };
    const target = cfg.groups?.creative || cfg.group_id || "";
    if (!cfg.token || !target) return;
    const tplRaw = (cfg.templates?.[eventKey] && cfg.templates[eventKey].trim()) || defaultLineTemplate(eventKey);
    let text = renderLineTemplate(tplRaw, vars);
    const link = typeof vars.link === "string" ? vars.link.trim() : "";
    // มีลิงก์ → ตัด URL ยาวออกจากข้อความ แล้วแนบ "ปุ่มเปิดดู" (Flex) แทน (กัน URL เป็นกำแพงตัวอักษรใน LINE)
    if (link) {
      text = text.split(link).join("");
      text = text.split("\n").filter((ln) => { const s = ln.trim(); return s && !/^(เปิดงาน|เปิดดู|เปิด|ลิงก์|link)\s*[:：]?$/i.test(s); }).join("\n").trim();
    }
    // helper ส่งเข้า LINE — คืน true ถ้าสำเร็จ (LINE ตอบ 200) · false ถ้าถูกตีกลับ/ล้ม
    const doPush = async (msgs: Record<string, unknown>[]): Promise<boolean> => {
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
          body: JSON.stringify({ to: target, messages: msgs }),
        });
        return res.ok;
      } catch { return false; }
    };
    // ⚠️ ประหยัดโควตา LINE: LINE นับโควตา "ต่อ message object" — [ข้อความ + ปุ่ม] = 2 โควตา
    // จึงรวมทุกอย่างไว้ใน Flex bubble เดียว (ข้อความ + ปุ่มเปิดดู) = 1 ข้อความ = 1 โควตา · ถ้ามีลิงก์
    const body = (text || "").slice(0, 4900);
    if (link) {
      const flexMsg = {
        type: "flex", altText: (body.slice(0, 395) || "มีงานใหม่"),
        contents: { type: "bubble", body: { type: "box", layout: "vertical", spacing: "md", contents: [
          { type: "text", text: body || "มีงานใหม่", wrap: true, size: "sm", color: "#333333" },
          { type: "button", style: "primary", color: "#7C3AED", height: "sm", action: { type: "uri", label: "เปิดดูงาน", uri: link } },
        ] } },
      };
      const ok = await doPush([flexMsg]);   // 1 ข้อความ (มีปุ่มในตัว)
      // ถ้า Flex ส่งไม่ผ่าน → ถอยไปข้อความล้วน (ใส่ลิงก์ต่อท้ายให้กดเปิดได้) · ยังเป็น 1 ข้อความเท่ากัน
      if (!ok) await doPush([{ type: "text", text: `${body}\n${link}`.slice(0, 4900) }]);
    } else if (body) {
      await doPush([{ type: "text", text: body }]);
    }
  } catch { /* เงียบ — LINE ล้มไม่กระทบการบันทึก */ }
}

/** โดเมนแอปหลัก (ตัด / ท้าย) — จาก env, fallback prod บน Vercel · ใช้ทำลิงก์ในแจ้งเตือน/LINE */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
}

/** ลิงก์เปิดหน้ารายละเอียดงาน (deep link /tasks?task=<id>) — ใช้เป็นตัวแปร {link} ในแม่แบบ LINE */
export function taskLink(taskId: string | null | undefined): string {
  const base = appBaseUrl();
  return taskId ? `${base}/tasks?task=${taskId}` : `${base}/tasks`;
}

/** เลขที่งาน CT-YYYYMM-#### (นับตามเดือน) */
export async function nextTaskNo(admin: Admin): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CT-${ym}-`;
  const { data } = await admin.from("erp_creative_tasks").select("task_no").like("task_no", `${prefix}%`).order("task_no", { ascending: false }).limit(1);
  const last = (data?.[0]?.task_no as string | undefined) ?? null;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}

/** เลขที่คอนเทนต์ CN-YYYYMM-#### (นับตามเดือน) */
export async function nextContentNo(admin: Admin): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CN-${ym}-`;
  const { data } = await admin.from("erp_creative_content").select("content_no").like("content_no", `${prefix}%`).order("content_no", { ascending: false }).limit(1);
  const last = (data?.[0]?.content_no as string | undefined) ?? null;
  const seq = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}

/**
 * B2 (Hybrid): งานย่อยชนิด "content" → สร้าง erp_creative_content ผูกกับงาน + เก็บ content_id ใน subtask.config
 * (ใช้ storage คอนเทนต์เดิม → คอนเทนต์โผล่ในแท็บ 📱 คอนเทนต์ของงาน แก้แคปชั่น/เวลาโพสต์ที่นั่นได้ทันที)
 * best-effort: ถ้าสร้างไม่ได้ ไม่ทำให้การสร้างงานย่อยพัง
 */
export async function materializeContentSubtasks(
  admin: Admin, taskId: string, brandId: string | null,
  subs: { id: string; subtask_type?: string | null; config?: Record<string, unknown> | null; title?: string | null }[],
  createdBy: string | null,
): Promise<void> {
  for (const s of subs) {
    if (s.subtask_type !== "content") continue;
    const cfg = (s.config ?? {}) as Record<string, unknown>;
    if (cfg.content_id) continue;   // ผูกไว้แล้ว
    try {
      // ถ้าเลือกแม่แบบคอนเทนต์ → ก๊อป ประเภท/แพลตฟอร์ม/แคปชั่น จากแม่แบบ (mini-form ทับ post_type ได้)
      const tplId = cfg.content_template_id ? String(cfg.content_template_id) : null;
      let post_type = (cfg.post_type as string) || null;
      let platforms = Array.isArray(cfg.platforms) ? (cfg.platforms as string[]) : [];
      let title = s.title || "คอนเทนต์";
      let tplCaps: Record<string, unknown>[] = [];
      if (tplId) {
        const { data: tpl } = await admin.from("erp_creative_content").select("title, post_type, platforms").eq("id", tplId).maybeSingle();
        if (tpl) {
          const tr2 = tpl as { title?: string | null; post_type?: string | null; platforms?: string[] | null };
          post_type = post_type || (tr2.post_type ?? null);
          if (!platforms.length) platforms = tr2.platforms ?? [];
          if (tr2.title) title = tr2.title;   // สร้างจากแม่แบบ → ใช้ชื่อแม่แบบเป็นชื่อคอนเทนต์
          const { data: caps } = await admin.from("erp_creative_content_captions").select("platform, caption, hashtags, caption_type, sort_order").eq("content_id", tplId).order("sort_order", { ascending: true });
          tplCaps = (caps ?? []) as Record<string, unknown>[];
        }
      }
      let cno = await nextContentNo(admin);
      const crow = { content_no: cno, title, task_id: taskId, brand_id: brandId || null, post_type, platforms, status: "draft", created_by: createdBy };
      let ins = await admin.from("erp_creative_content").insert(crow).select("id").single();
      if (ins.error && /duplicate|unique/i.test(ins.error.message)) { cno = await nextContentNo(admin); ins = await admin.from("erp_creative_content").insert({ ...crow, content_no: cno }).select("id").single(); }
      if (ins.error || !ins.data) continue;
      const newId = (ins.data as { id: string }).id;
      if (tplCaps.length) await admin.from("erp_creative_content_captions").insert(tplCaps.map((c, i) => ({ content_id: newId, platform: c.platform, caption: c.caption ?? null, hashtags: c.hashtags ?? null, caption_type: c.caption_type ?? "short", sort_order: (c.sort_order as number) ?? i })));
      await admin.from("erp_creative_subtasks").update({ config: { ...cfg, content_id: newId } }).eq("id", s.id);
    } catch { /* best-effort */ }
  }
}

/** สร้างการแจ้งเตือนในระบบ (ไม่ throw) — userId = user_profiles.id (auth uid) */
export async function notify(
  admin: Admin,
  n: { userId: string; eventType: string; title: string; body?: string | null; linkUrl?: string | null; entityId?: string | null; priority?: "low" | "normal" | "high" },
): Promise<void> {
  if (!n.userId) return;
  try {
    await admin.from("erp_notifications").insert({
      user_id: n.userId, event_type: n.eventType, title: n.title, body: n.body ?? null,
      link_url: n.linkUrl ?? "/tasks", entity_type: "creative_task", entity_id: n.entityId ?? null, priority: n.priority ?? "normal",
    });
  } catch { /* เงียบ */ }
}

/** ตั้งผู้รับผิดชอบ subtask (m2m) แบบแทนที่ทั้งชุด — เก็บ user_id */
export async function setSubtaskAssignees(admin: Admin, subtaskId: string, userIds: (string | null | undefined)[]): Promise<void> {
  await admin.from("erp_creative_subtask_assignees").delete().eq("subtask_id", subtaskId);
  const clean = [...new Set(userIds.filter(Boolean).map(String))];
  if (clean.length) await admin.from("erp_creative_subtask_assignees").insert(clean.map((user_id) => ({ subtask_id: subtaskId, user_id })));
}

/** ผู้รับผิดชอบของหลาย subtask → Map<subtask_id, {id,label,color,avatar_url}[]> */
export async function subtaskAssigneesMap(admin: Admin, subtaskIds: string[]): Promise<Map<string, { id: string; label: string; color: string | null; avatar_url: string | null }[]>> {
  const map = new Map<string, { id: string; label: string; color: string | null; avatar_url: string | null }[]>();
  if (subtaskIds.length === 0) return map;
  const { data } = await admin.from("erp_creative_subtask_assignees").select("subtask_id, user_id").in("subtask_id", subtaskIds);
  const rows = (data ?? []) as { subtask_id: string; user_id: string }[];
  const userIds = rows.map((r) => r.user_id);
  const labels = await userLabelMap(admin, userIds);
  // ธีมพนักงาน (user_profiles.color) + รูป (avatar_url) — ใช้ระบาย/แสดง avatar
  const colorMap = new Map<string, string | null>();
  const avatarMap = new Map<string, string | null>();
  if (userIds.length) {
    const { data: cs } = await admin.from("user_profiles").select("id, color, avatar_url").in("id", [...new Set(userIds.map(String))]);
    for (const c of (cs ?? []) as { id: string; color: string | null; avatar_url: string | null }[]) { colorMap.set(String(c.id), c.color); avatarMap.set(String(c.id), c.avatar_url); }
  }
  for (const r of rows) {
    const arr = map.get(r.subtask_id) ?? [];
    arr.push({ id: r.user_id, label: labels.get(String(r.user_id)) ?? "", color: colorMap.get(String(r.user_id)) ?? null, avatar_url: avatarMap.get(String(r.user_id)) ?? null });
    map.set(r.subtask_id, arr);
  }
  return map;
}

// ============================================================
// ผู้รับผิดชอบ "งานหลัก" (m2m) — ของกลางในโมดูล
// junction = erp_creative_task_assignees(task_id, user_id) เก็บเฉพาะ "ตั้งเอง (explicit)"
// "ผู้รับผิดชอบที่แสดง" = ตั้งเอง ∪ คนที่กดเริ่มงานย่อย (คำนวณตอนอ่าน — ไม่ denormalize)
// ============================================================
export type AssigneeInfo = { id: string; label: string; color: string | null; avatar_url: string | null };

// ข้อมูลผู้ใช้หลายคน (ชื่อ/สี/รูป) → Map<id, info> · ใช้ภายใน
async function usersInfo(admin: Admin, ids: (string | null | undefined)[]): Promise<Map<string, AssigneeInfo>> {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  const map = new Map<string, AssigneeInfo>();
  if (!uniq.length) return map;
  const labels = await userLabelMap(admin, uniq);
  const { data } = await admin.from("user_profiles").select("id, color, avatar_url").in("id", uniq);
  const cm = new Map<string, { color: string | null; avatar_url: string | null }>();
  for (const c of (data ?? []) as { id: string; color: string | null; avatar_url: string | null }[]) cm.set(String(c.id), { color: c.color, avatar_url: c.avatar_url });
  for (const id of uniq) map.set(id, { id, label: labels.get(id) ?? "", color: cm.get(id)?.color ?? null, avatar_url: cm.get(id)?.avatar_url ?? null });
  return map;
}

/** ตั้งผู้รับผิดชอบงานหลัก (explicit) แบบแทนที่ทั้งชุด */
export async function setTaskAssignees(admin: Admin, taskId: string, userIds: (string | null | undefined)[]): Promise<void> {
  await admin.from("erp_creative_task_assignees").delete().eq("task_id", taskId);
  const clean = [...new Set(userIds.filter(Boolean).map(String))];
  if (clean.length) await admin.from("erp_creative_task_assignees").insert(clean.map((user_id) => ({ task_id: taskId, user_id })));
}

/** ผู้รับผิดชอบงานหลัก = ตั้งเอง (explicit) ∪ คนที่กดเริ่มงานย่อย → Map<task_id, AssigneeInfo[]> */
export async function taskAssigneesMap(admin: Admin, taskIds: string[]): Promise<Map<string, AssigneeInfo[]>> {
  const map = new Map<string, AssigneeInfo[]>();
  if (!taskIds.length) return map;
  const ids = [...new Set(taskIds.map(String))];
  const byTask = new Map<string, Set<string>>();
  const add = (tid: string, uid: string) => { if (!tid || !uid) return; const s = byTask.get(tid) ?? new Set<string>(); s.add(uid); byTask.set(tid, s); };
  // ตั้งเอง (explicit)
  const { data: ex } = await admin.from("erp_creative_task_assignees").select("task_id, user_id").in("task_id", ids);
  for (const r of (ex ?? []) as { task_id: string; user_id: string }[]) add(String(r.task_id), String(r.user_id));
  // คนเริ่มงานย่อย (subtask assignees ของงานนั้น)
  const { data: subs } = await admin.from("erp_creative_subtasks").select("id, task_id").in("task_id", ids);
  const subToTask = new Map<string, string>();
  for (const s of (subs ?? []) as { id: string; task_id: string }[]) subToTask.set(String(s.id), String(s.task_id));
  const subIds = [...subToTask.keys()];
  if (subIds.length) {
    const { data: sa } = await admin.from("erp_creative_subtask_assignees").select("subtask_id, user_id").in("subtask_id", subIds);
    for (const r of (sa ?? []) as { subtask_id: string; user_id: string }[]) { const tid = subToTask.get(String(r.subtask_id)); if (tid) add(tid, String(r.user_id)); }
  }
  const allIds = [...new Set([...byTask.values()].flatMap((s) => [...s]))];
  const info = await usersInfo(admin, allIds);
  for (const [tid, set] of byTask) map.set(tid, [...set].map((uid) => info.get(uid) ?? { id: uid, label: "", color: null, avatar_url: null }));
  return map;
}

/** ตั้งผู้ตรวจ/อนุมัติงานหลัก (หลายคน) แบบแทนที่ทั้งชุด — junction erp_creative_task_reviewers */
export async function setTaskReviewers(admin: Admin, taskId: string, userIds: (string | null | undefined)[]): Promise<void> {
  await admin.from("erp_creative_task_reviewers").delete().eq("task_id", taskId);
  const clean = [...new Set(userIds.filter(Boolean).map(String))];
  if (clean.length) await admin.from("erp_creative_task_reviewers").insert(clean.map((user_id) => ({ task_id: taskId, user_id })));
}

/** ผู้ตรวจของแต่ละงาน → Map<task_id, AssigneeInfo[]> */
export async function taskReviewersMap(admin: Admin, taskIds: string[]): Promise<Map<string, AssigneeInfo[]>> {
  const map = new Map<string, AssigneeInfo[]>();
  if (!taskIds.length) return map;
  const ids = [...new Set(taskIds.map(String))];
  const { data } = await admin.from("erp_creative_task_reviewers").select("task_id, user_id").in("task_id", ids);
  const byTask = new Map<string, string[]>();
  for (const r of (data ?? []) as { task_id: string; user_id: string }[]) { const tid = String(r.task_id); const arr = byTask.get(tid) ?? []; arr.push(String(r.user_id)); byTask.set(tid, arr); }
  const info = await usersInfo(admin, [...new Set([...byTask.values()].flat())]);
  for (const [tid, arr] of byTask) map.set(tid, arr.map((uid) => info.get(uid) ?? { id: uid, label: "", color: null, avatar_url: null }));
  return map;
}

/** user เป็นผู้ตรวจของงานนี้ไหม (ในรายชื่อ reviewers) */
export async function userIdsReviewers(admin: Admin, taskId: string): Promise<Set<string>> {
  const { data } = await admin.from("erp_creative_task_reviewers").select("user_id").eq("task_id", taskId);
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => String(r.user_id)));
}

/**
 * เลื่อนสถานะ "งานหลัก" อัตโนมัติตามสถานะ "งานย่อย" — ใช้กับงานที่มีงานย่อยเท่านั้น
 * แมปคีย์เส้นทางหลักจาก workflow เอง (ทนต่อการเปลี่ยน label/คีย์):
 *   เริ่มต้น(is_default) → กำลังทำ → รอตรวจ(จุดก่อน approve) → อนุมัติ(ปลายทาง approve)
 * เงื่อนไขจากงานย่อย (ไม่นับที่ยกเลิก): อนุมัติครบ→อนุมัติ · ส่งครบ→รอตรวจ · มีคนเริ่ม→กำลังทำ · ไม่มี→เริ่มต้น
 * ความปลอดภัย: แตะเฉพาะตอนงานหลัก "ยังอยู่บนเส้นทางหลัก" (ไม่ยุ่งงานที่เผยแพร่/ปิด/ยกเลิก/บล็อก/แอดมินตั้งเอง)
 */
export async function recomputeTaskStatusFromSubtasks(admin: Admin, taskId: string): Promise<void> {
  const { data: subs } = await admin.from("erp_creative_subtasks").select("status").eq("task_id", taskId);
  const list = ((subs ?? []) as { status: string }[]).map((s) => s.status).filter((s) => s !== "canceled");
  const N = list.length;
  if (N === 0) return;   // ไม่มีงานย่อย (ที่ใช้งาน) → ไม่ยุ่งสถานะงานหลัก

  const [{ data: statuses }, { data: trans }, { data: task }] = await Promise.all([
    admin.from("erp_creative_statuses").select("key, progress_percent, is_default, is_terminal").eq("is_active", true),
    admin.from("erp_creative_status_transitions").select("from_key, to_key, kind"),
    admin.from("erp_creative_tasks").select("status").eq("id", taskId).maybeSingle(),
  ]);
  const sts = (statuses ?? []) as { key: string; progress_percent: number; is_default: boolean; is_terminal: boolean }[];
  const trs = (trans ?? []) as { from_key: string; to_key: string; kind: string }[];
  const approveTr = trs.find((t) => t.kind === "approve");
  if (!approveTr) return;   // workflow ไม่มีจุดอนุมัติ → ไม่เดา
  const approvedKey = approveTr.to_key;
  const reviewKey = approveTr.from_key;
  const inProgressKey = trs.find((t) => t.to_key === reviewKey && t.kind === "normal")?.from_key;
  const defaultKey = sts.find((s) => s.is_default)?.key;
  const mainKeys = [defaultKey, inProgressKey, reviewKey, approvedKey].filter(Boolean) as string[];

  // เป้าหมายตามงานย่อย → คีย์เส้นทางหลัก
  const approved = list.filter((s) => s === "approved").length;
  const sent = list.filter((s) => s === "submitted" || s === "approved").length;
  const started = list.filter((s) => ["in_progress", "submitted", "approved", "revision_requested"].includes(s)).length;
  const target = approved === N ? approvedKey : sent === N ? reviewKey : started > 0 ? inProgressKey : defaultKey;

  const cur = (task as { status?: string } | null)?.status;
  if (!target || !cur || cur === target || !mainKeys.includes(target)) return;

  // สถานะที่ "ห้ามแตะ" = ปลายทาง(terminal เช่น เสร็จ/ยกเลิก) ∪ ปลายทางบล็อก ∪ หลังอนุมัติ(เผยแพร่/ตั้งเวลา ฯลฯ)
  const protectedSet = new Set<string>();
  for (const s of sts) if (s.is_terminal) protectedSet.add(s.key);
  for (const tr of trs) if (tr.kind === "block") protectedSet.add(tr.to_key);
  let frontier = trs.filter((t) => t.from_key === approvedKey).map((t) => t.to_key).filter((k) => !mainKeys.includes(k));
  while (frontier.length) {
    const nf: string[] = [];
    for (const k of frontier) { if (protectedSet.has(k)) continue; protectedSet.add(k); for (const tr of trs) if (tr.from_key === k && !mainKeys.includes(tr.to_key) && !protectedSet.has(tr.to_key)) nf.push(tr.to_key); }
    frontier = nf;
  }
  if (protectedSet.has(cur)) return;   // งานเผยแพร่/ปิด/ยกเลิก/บล็อก/แอดมินดันไปไกลแล้ว → ไม่แตะ

  const prog = sts.find((s) => s.key === target)?.progress_percent;
  await admin.from("erp_creative_tasks").update({ status: target, ...(typeof prog === "number" ? { progress_percent: prog } : {}), updated_at: new Date().toISOString() }).eq("id", taskId);
}

/** task ids ที่ user เป็นผู้รับผิดชอบ (ตั้งเอง) หรือเป็นคนเริ่มงานย่อย — ใช้กรอง "งานของฉัน" */
export async function taskIdsForUser(admin: Admin, userId: string): Promise<string[]> {
  const set = new Set<string>();
  const { data: ex } = await admin.from("erp_creative_task_assignees").select("task_id").eq("user_id", userId);
  for (const r of (ex ?? []) as { task_id: string }[]) set.add(String(r.task_id));
  const { data: sa } = await admin.from("erp_creative_subtask_assignees").select("subtask_id").eq("user_id", userId);
  const subIds = [...new Set(((sa ?? []) as { subtask_id: string }[]).map((r) => String(r.subtask_id)))];
  if (subIds.length) {
    const { data: subs } = await admin.from("erp_creative_subtasks").select("task_id").in("id", subIds);
    for (const r of (subs ?? []) as { task_id: string }[]) set.add(String(r.task_id));
  }
  return [...set];
}

type UserRow = { id: string; display_name: string | null; username: string | null; email: string | null };

/** ชื่อแสดงผู้ใช้: display_name > username > email */
export function userLabel(u: Partial<UserRow> | null | undefined): string {
  if (!u) return "";
  return (u.display_name || u.username || u.email || "").trim();
}

/** ดึงชื่อผู้ใช้หลายคนพร้อมกัน → Map<id, label> (จาก user_profiles) */
export async function userLabelMap(admin: Admin, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data } = await admin.from("user_profiles").select("id, display_name, username, email").in("id", uniq);
  for (const u of (data ?? []) as UserRow[]) map.set(String(u.id), userLabel(u));
  return map;
}

// alias เดิม (เลี่ยงแก้ import หลายไฟล์) — ตอนนี้ resolve จาก user_profiles
export { userLabelMap as employeeLabelMap };

/**
 * แปลง assignee → auth user id สำหรับแจ้งเตือน
 * ตอนนี้ assignee_id = user_profiles.id อยู่แล้ว → คืน id ถ้าเป็นผู้ใช้ที่ active
 */
export async function employeeAuthId(admin: Admin, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from("user_profiles").select("id").eq("id", userId).eq("active", true).maybeSingle();
  return (data?.id as string | null) ?? null;
}
