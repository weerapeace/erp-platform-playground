/**
 * อัลบั้ม Contents — ตัวช่วยฝั่งเซิร์ฟเวอร์ (ของกลางของ /api/content-albums/* + สร้างโพสต์จากอัลบั้มใน /api/creative-content)
 *
 * โครง (เจ้าของเลือกแบบ ข 2026-11-03):
 *   asset_collections (ชื่อ/คำอธิบาย/ปก) 1:1 content_albums (แบรนด์/ผู้รับผิดชอบ/วันที่ต้องลง/แพลตฟอร์ม/แคปชั่นร่าง/โฟลเดอร์ Drive)
 *   ไฟล์ในอัลบั้ม = assets (source "content") ผ่าน asset_collection_map เดิม · ตัวจริงอยู่ Drive (assets.drive_file_id)
 *     r2_key = รูปย่อ/ภาพปกวิดีโอใน R2 · ไม่มีภาพปก = "drive:<id>"
 *   โพสต์ที่สร้างจากอัลบั้ม = erp_creative_content.album_id · สถานะอัลบั้มคิดสด (lib/content-album-status)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { albumStatus, type AlbumPostInput, type AlbumStatus } from "@/lib/content-album-status";
import { applyFileOrder } from "@/lib/content-album-order";
import type { CaptionSettings } from "@/lib/content-readiness";
import { resolveBrandContentFolder, safeDriveName, driveFolderUrl } from "@/lib/content-drive";
import { driveConfigured, driveCreateFolder, driveEnsureFolder, driveListChildFolders, driveFileState } from "@/lib/google-drive";
import { userLabelMap } from "@/lib/creative-tasks-server";
import { attachReadiness } from "@/app/api/creative-content/shared";

type Admin = ReturnType<typeof supabaseAdmin>;

/** ไฟล์ 1 ชิ้นในอัลบั้ม */
export type AlbumFile = {
  id: string;
  title: string;
  file_name: string;
  r2_key: string;              // รูปย่อ/ภาพปก (drive:<id> = ไม่มีภาพปก)
  asset_type: string;          // image | video | ...
  content_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  drive_file_id: string | null;
  drive_missing: boolean;
  phash: string | null;        // ลายนิ้วมือหน้าตา (ช่วยคัดรูปคล้าย · lib/content-album-cull)
  picked: boolean;             // "รูปที่เลือกใช้"
  used_in: { content_id: string; label: string | null }[];   // โพสต์ที่ใช้ไฟล์นี้แล้ว (asset_usages)
  added_at: string | null;
};

/** โพสต์ที่ผูกกับอัลบั้ม (ย่อ) */
export type AlbumPost = {
  id: string; content_no: string | null; title: string; status: string; is_active: boolean;
  scheduled_at: string | null; platforms: string[]; post_status: Record<string, string>;
};

export type ContentAlbum = {
  id: string;
  name: string;
  description: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_color: string | null;
  assignee_ids: string[];
  assignees: { id: string; name: string }[];
  due_date: string | null;
  planned_platforms: string[];
  caption_draft: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  picked_asset_ids: string[];
  /** ลำดับไฟล์ที่ลากจัดเอง (ว่าง = เรียงตามเวลาที่เพิ่ม · ไฟล์ที่ไม่อยู่ในรายการต่อท้าย) */
  file_order: string[];
  parent_sku_codes: string[];
  products: { id: string; code: string; name: string; image_key: string | null }[];   // Parent SKU ที่แท็ก (หาจากรหัส)
  cover_asset_id: string | null;
  cover_key: string | null;       // รูปปก (ตั้งเอง → ไม่งั้นไฟล์ล่าสุด)
  preview_keys: string[];         // รูปย่อ ≤4 สำหรับการ์ด
  file_count: number;
  video_count: number;
  closed_at: string | null;
  trashed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status: AlbumStatus;
  posts: AlbumPost[];
};

type AlbumDbRow = {
  id: string; brand_id: string | null; assignee_ids: string[] | null; due_date: string | null; planned_platforms: string[] | null;
  caption_draft: string | null; drive_folder_id: string | null; picked_asset_ids: string[] | null; file_order: string[] | null; parent_sku_codes: unknown;
  closed_at: string | null; trashed_at: string | null; created_by: string | null; created_at: string; updated_at: string;
};
const ALBUM_COLS = "id, brand_id, assignee_ids, due_date, planned_platforms, caption_draft, drive_folder_id, picked_asset_ids, file_order, parent_sku_codes, closed_at, trashed_at, created_by, created_at, updated_at";
const POST_COLS = "id, content_no, title, status, is_active, scheduled_at, platforms, post_status, platform_images, platform_formats, album_id";
const FILE_COLS = "id, title, file_name, r2_key, asset_type, content_type, size_bytes, width, height, duration_sec, drive_file_id, drive_missing_at, phash, status";

/** ตั้งค่าแพลตฟอร์ม (ใช้แคปชั่นไหม) — ตัวเดียวกับปฏิทิน · อ่านไม่ได้ = ถือว่าทุกแพลตฟอร์มต้องมีแคปชั่น */
export async function loadCaptionSettings(admin: Admin): Promise<CaptionSettings> {
  const { data } = await admin.from("ui_config").select("value").eq("key", "creative_platform_settings").maybeSingle();
  return ((data as { value?: CaptionSettings } | null)?.value ?? {}) as CaptionSettings;
}

const codes = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))] : []);

/**
 * โหลดอัลบั้ม (พร้อมสถานะที่คิดจากโพสต์) · ids = เฉพาะอัลบั้มเหล่านี้ · trash = ดูถังขยะ
 * withFiles = แนบไฟล์ทั้งหมด (หน้าในอัลบั้ม) — รายการการ์ดไม่ต้อง
 */
export async function loadContentAlbums(admin: Admin, opts: { ids?: string[]; trash?: boolean; brandId?: string | null } = {}): Promise<ContentAlbum[]> {
  let q = admin.from("content_albums").select(ALBUM_COLS).order("created_at", { ascending: false }).limit(500);
  if (opts.ids) q = q.in("id", opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (!opts.ids) q = opts.trash ? q.not("trashed_at", "is", null) : q.is("trashed_at", null);
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AlbumDbRow[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const brandIds = [...new Set(rows.map((r) => r.brand_id).filter(Boolean))] as string[];

  const skuCodes = [...new Set(rows.flatMap((r) => codes(r.parent_sku_codes)))];
  const [{ data: cols }, { data: maps }, { data: posts }, { data: brands }, settings, people, { data: parents }] = await Promise.all([
    admin.from("asset_collections").select("id, name, description, cover_asset_id").in("id", ids),
    admin.from("asset_collection_map").select("collection_id, added_at, asset:assets!asset_id(id, r2_key, asset_type, status)")
      .in("collection_id", ids).order("added_at", { ascending: false }).limit(20000),
    admin.from("erp_creative_content").select(POST_COLS).in("album_id", ids).order("scheduled_at", { ascending: true, nullsFirst: false }),
    brandIds.length ? admin.from("brands").select("id, name, color").in("id", brandIds) : Promise.resolve({ data: [] as unknown[] }),
    loadCaptionSettings(admin),
    userLabelMap(admin, rows.flatMap((r) => r.assignee_ids ?? [])),
    skuCodes.length ? admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").in("code", skuCodes) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const parentByCode = new Map(((parents ?? []) as { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null }[])
    .map((p) => [p.code, { id: p.id, code: p.code, name: p.name_th ?? "", image_key: p.cover_image_r2_key }]));
  const colMap = new Map(((cols ?? []) as { id: string; name: string; description: string | null; cover_asset_id: string | null }[]).map((c) => [c.id, c]));
  const brandMap = new Map(((brands ?? []) as { id: string; name: string; color: string | null }[]).map((b) => [b.id, b]));

  type MapRow = { collection_id: string; asset: { id: string; r2_key: string; asset_type: string; status: string } | { id: string; r2_key: string; asset_type: string; status: string }[] | null };
  const filesBy = new Map<string, { id: string; r2_key: string; asset_type: string }[]>();
  for (const m of (maps ?? []) as MapRow[]) {
    const a = Array.isArray(m.asset) ? m.asset[0] : m.asset;
    if (!a || a.status !== "active") continue;
    (filesBy.get(m.collection_id) ?? filesBy.set(m.collection_id, []).get(m.collection_id)!).push(a);
  }

  // ความพร้อมของโพสต์ (แคปชั่น/รูป) — ตัวเดียวกับการ์ดปฏิทิน
  const postItems = ((posts ?? []) as Record<string, unknown>[]).map((p) => ({ ...p }));
  await attachReadiness(admin, postItems);
  const postsBy = new Map<string, Record<string, unknown>[]>();
  for (const p of postItems) (postsBy.get(String(p.album_id)) ?? postsBy.set(String(p.album_id), []).get(String(p.album_id))!).push(p);

  return rows.map((r) => {
    const c = colMap.get(r.id);
    // ลำดับที่จัดเอง → ปกสำรอง/รูปย่อบนการ์ดตามลำดับนี้ด้วย
    const files = applyFileOrder(filesBy.get(r.id) ?? [], r.file_order);
    const coverId = c?.cover_asset_id ?? null;
    const cover = (coverId ? files.find((f) => f.id === coverId) : null) ?? files[0] ?? null;
    const ps = postsBy.get(r.id) ?? [];
    const inputs: AlbumPostInput[] = ps.map((p) => ({
      platforms: (p.platforms as string[] | null) ?? [],
      captionPlatforms: (p.caption_platforms as string[] | undefined) ?? [],
      platformImages: (p.platform_images as Record<string, string[]> | null) ?? {},
      imageKeys: (p.image_keys as string[] | undefined) ?? [],
      postStatus: (p.post_status as Record<string, string> | null) ?? {},
      formats: (p.platform_formats as Record<string, string> | null) ?? {},
      status: String(p.status ?? "draft"), isActive: p.is_active !== false,
    }));
    const b = r.brand_id ? brandMap.get(r.brand_id) : null;
    const assigneeIds = (r.assignee_ids ?? []).filter(Boolean);
    return {
      id: r.id, name: c?.name ?? "", description: c?.description ?? null,
      brand_id: r.brand_id, brand_name: b?.name ?? null, brand_color: b?.color ?? null,
      assignee_ids: assigneeIds, assignees: assigneeIds.map((id) => ({ id, name: people.get(id) ?? "" })),
      due_date: r.due_date, planned_platforms: r.planned_platforms ?? [], caption_draft: r.caption_draft,
      drive_folder_id: r.drive_folder_id, drive_folder_url: r.drive_folder_id ? driveFolderUrl(r.drive_folder_id) : null,
      picked_asset_ids: (r.picked_asset_ids ?? []).filter((id) => files.some((f) => f.id === id)),
      file_order: (r.file_order ?? []).filter((id) => files.some((f) => f.id === id)),
      parent_sku_codes: codes(r.parent_sku_codes),
      products: codes(r.parent_sku_codes).map((c) => parentByCode.get(c)).filter((p): p is { id: string; code: string; name: string; image_key: string | null } => !!p),
      cover_asset_id: coverId, cover_key: cover?.r2_key ?? null,
      preview_keys: files.filter((f) => f.id !== cover?.id).slice(0, 3).map((f) => f.r2_key),
      file_count: files.length, video_count: files.filter((f) => f.asset_type === "video").length,
      closed_at: r.closed_at, trashed_at: r.trashed_at, created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at,
      status: albumStatus({ plannedPlatforms: r.planned_platforms ?? [], captionDraft: r.caption_draft, fileCount: files.length, closed: !!r.closed_at, posts: inputs }, settings),
      posts: ps.map((p) => ({
        id: String(p.id), content_no: (p.content_no as string | null) ?? null, title: String(p.title ?? ""), status: String(p.status ?? "draft"),
        is_active: p.is_active !== false, scheduled_at: (p.scheduled_at as string | null) ?? null,
        platforms: (p.platforms as string[] | null) ?? [], post_status: (p.post_status as Record<string, string> | null) ?? {},
      })),
    };
  });
}

/** ไฟล์ทั้งหมดในอัลบั้ม (ตามลำดับที่จัดเอง → ที่เหลือใหม่สุดก่อน) + โพสต์ที่ใช้แต่ละไฟล์ */
export async function loadAlbumFiles(admin: Admin, albumId: string, pickedIds: string[], order: string[] = []): Promise<AlbumFile[]> {
  const { data, error } = await admin.from("asset_collection_map").select(`added_at, asset:assets!asset_id(${FILE_COLS})`)
    .eq("collection_id", albumId).order("added_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  type F = { id: string; title: string; file_name: string; r2_key: string; asset_type: string; content_type: string | null; size_bytes: number | null; width: number | null; height: number | null; duration_sec: number | null; drive_file_id: string | null; drive_missing_at: string | null; phash: string | null; status: string };
  const rows = ((data ?? []) as { added_at: string | null; asset: F | F[] | null }[])
    .map((m) => ({ added_at: m.added_at, a: Array.isArray(m.asset) ? m.asset[0] : m.asset }))
    .filter((m): m is { added_at: string | null; a: F } => !!m.a && m.a.status === "active");
  const ids = rows.map((m) => m.a.id);
  const { data: uses } = ids.length
    ? await admin.from("asset_usages").select("asset_id, record_id, record_label").in("asset_id", ids).eq("module", "creative_content")
    : { data: [] as unknown[] };
  const useMap = new Map<string, { content_id: string; label: string | null }[]>();
  for (const u of (uses ?? []) as { asset_id: string; record_id: string; record_label: string | null }[])
    (useMap.get(u.asset_id) ?? useMap.set(u.asset_id, []).get(u.asset_id)!).push({ content_id: u.record_id, label: u.record_label });
  const picked = new Set(pickedIds);
  return applyFileOrder(rows.map(({ added_at, a }) => ({
    id: a.id, title: a.title || a.file_name, file_name: a.file_name, r2_key: a.r2_key, asset_type: a.asset_type, content_type: a.content_type,
    size_bytes: a.size_bytes, width: a.width, height: a.height, duration_sec: a.duration_sec == null ? null : Number(a.duration_sec),
    drive_file_id: a.drive_file_id, drive_missing: !!a.drive_missing_at, phash: a.phash, picked: picked.has(a.id), used_in: useMap.get(a.id) ?? [], added_at,
  })), order);
}

/** ชื่อโฟลเดอร์ Drive ของอัลบั้ม: "YYYY-MM ชื่ออัลบั้ม" (เรียงตามเดือนในโฟลเดอร์ "อัลบั้ม") */
export const albumFolderName = (name: string, createdAt: string) => safeDriveName(`${createdAt.slice(0, 7)} ${name}`) || "album";

/**
 * โฟลเดอร์ Drive ของอัลบั้ม: <แบรนด์>/Content/อัลบั้ม/<YYYY-MM ชื่อ> · สร้างครั้งแรกตอนอัปไฟล์แรก แล้วจำ drive_folder_id
 * (ย้าย/เปลี่ยนชื่อโฟลเดอร์ใน Drive ทีหลัง ระบบยังเจอ เพราะจำรหัส ไม่ใช่ชื่อ)
 */
export async function resolveAlbumDriveFolder(admin: Admin, albumId: string, create: boolean): Promise<{ ok: true; folderId: string | null; label: string } | { ok: false; reason: string }> {
  if (!driveConfigured()) return { ok: false, reason: "ระบบยังไม่ได้เชื่อม Google Drive" };
  const [{ data: a }, { data: c }] = await Promise.all([
    admin.from("content_albums").select("id, brand_id, drive_folder_id, created_at").eq("id", albumId).maybeSingle(),
    admin.from("asset_collections").select("name").eq("id", albumId).maybeSingle(),
  ]);
  const album = a as { id: string; brand_id: string | null; drive_folder_id: string | null; created_at: string } | null;
  if (!album) return { ok: false, reason: "ไม่พบอัลบั้ม" };
  const folderName = albumFolderName((c as { name?: string } | null)?.name ?? "", album.created_at);
  if (album.drive_folder_id) return { ok: true, folderId: album.drive_folder_id, label: folderName };
  if (!album.brand_id) return { ok: false, reason: "อัลบั้มนี้ยังไม่ได้เลือกแบรนด์ — เลือกแบรนด์ก่อน ระบบถึงรู้ว่าจะเก็บไฟล์ไว้โฟลเดอร์ไหนใน Drive" };
  const base = await resolveBrandContentFolder(admin, album.brand_id, create);
  if (!base.ok) return base;
  const label = `${base.label} › อัลบั้ม › ${folderName}`;
  if (!base.folderId) return { ok: true, folderId: null, label };
  if (!create) return { ok: true, folderId: null, label };
  const albumsRoot = await driveEnsureFolder("อัลบั้ม", base.folderId);
  const kids = await driveListChildFolders(albumsRoot).catch(() => [] as { id: string; name: string }[]);
  const folderId = kids.find((k) => k.name === folderName)?.id ?? (await driveCreateFolder(folderName, albumsRoot)).id;
  await admin.from("content_albums").update({ drive_folder_id: folderId, updated_at: new Date().toISOString() }).eq("id", albumId);
  return { ok: true, folderId, label };
}

/**
 * ตรวจว่าไฟล์ยังอยู่ใน Drive ไหม → assets.drive_missing_at (หาย = ลงเวลา · กลับมา/กู้คืนจากถังขยะ = ล้าง)
 * ตอบไม่ได้ (error) = ไม่แตะ · ใช้ร่วม: cron รายวัน /api/cron/content-drive-check + ปุ่ม "ดึงไฟล์ใหม่จาก Drive" ในอัลบั้ม
 */
export async function checkDriveFiles(admin: Admin, rows: { id: string; drive_file_id: string; drive_missing_at: string | null }[], concurrency = 6): Promise<{ checked: number; missing: number; restored: number; errors: number }> {
  let i = 0, checked = 0, missing = 0, restored = 0, errors = 0;
  const now = new Date().toISOString();
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (i < rows.length) {
      const r = rows[i++];
      const st = await driveFileState(r.drive_file_id);
      checked++;
      if (st === "error") { errors++; continue; }
      if (st === "missing" && !r.drive_missing_at) { await admin.from("assets").update({ drive_missing_at: now }).eq("id", r.id); missing++; }
      else if (st === "ok" && r.drive_missing_at) { await admin.from("assets").update({ drive_missing_at: null }).eq("id", r.id); restored++; }
    }
  }));
  return { checked, missing, restored, errors };
}

/**
 * ส่งไฟล์จากอัลบั้มเข้าโพสต์ (ตอนสร้างโพสต์จากอัลบั้ม) — ไม่ก๊อปไฟล์ ชี้ไฟล์เดิม
 *   รูป = r2_key รูปย่อ + drive_file_id ต้นฉบับ (ตอนโพสต์จริงระบบดึงต้นฉบับจาก Drive) · ไม่มีรูปย่อ = url drive:<id>
 *   วิดีโอ = url drive:<id> (แบบเดียวกับป๊อปโพสต์)
 *   + จด asset_usages ให้ไฟล์ในอัลบั้มขึ้นป้าย "ใช้แล้วใน CN-…"
 */
export async function attachAlbumFilesToContent(admin: Admin, p: { contentId: string; contentNo: string | null; albumId: string; assetIds: string[]; userId: string | null }): Promise<number> {
  if (!p.assetIds.length) return 0;
  const { data: inAlbum } = await admin.from("asset_collection_map").select("asset_id").eq("collection_id", p.albumId).in("asset_id", p.assetIds);
  const allowed = new Set(((inAlbum ?? []) as { asset_id: string }[]).map((m) => m.asset_id));
  const { data: files } = await admin.from("assets").select("id, file_name, r2_key, asset_type, content_type, size_bytes, drive_file_id")
    .in("id", p.assetIds.filter((id) => allowed.has(id))).eq("status", "active");
  type A = { id: string; file_name: string; r2_key: string; asset_type: string; content_type: string | null; size_bytes: number | null; drive_file_id: string | null };
  const byId = new Map(((files ?? []) as A[]).map((f) => [f.id, f]));
  const ordered = p.assetIds.map((id) => byId.get(id)).filter((f): f is A => !!f);
  if (!ordered.length) return 0;
  const rows = ordered.map((f) => {
    const video = f.asset_type === "video";
    const driveKey = f.drive_file_id ? `drive:${f.drive_file_id}` : null;
    const hasPreview = !f.r2_key.startsWith("drive:");
    return {
      content_id: p.contentId, kind: video ? "video" : "image",
      r2_key: !video && hasPreview ? f.r2_key : null,
      url: video || !hasPreview ? (driveKey ?? f.r2_key) : null,
      drive_file_id: f.drive_file_id, label: f.file_name, file_name: f.file_name,
      content_type: f.content_type, size_bytes: f.size_bytes, uploaded_by: p.userId,
    };
  });
  const { error } = await admin.from("erp_creative_attachments").insert(rows);
  if (error) throw new Error(error.message);
  await admin.from("asset_usages").upsert(ordered.map((f, i) => ({
    asset_id: f.id, module: "creative_content", record_id: p.contentId, record_label: p.contentNo, field: "album", sort_order: i,
  })), { onConflict: "asset_id,module,record_id,field", ignoreDuplicates: true });
  return ordered.length;
}
