/**
 * 🗂️ สูตรแยกไฟล์ (ตัวแยกไฟล์ ERP) — /api/file-sort/config
 *
 * GET  → { data: สูตร, brands:[{id,name,folder}], artwork_types:[{name,folder}], drive_configured }
 *        ทุกอย่างที่โปรแกรมบนเครื่องต้องใช้ในคำขอเดียว (สิทธิ์ assets.view)
 *        folder ของแบรนด์/ชนิด = ชื่อโฟลเดอร์เดียวกับบน Drive (ตั้งที่ ⚙️ โฟลเดอร์มาตรฐาน) → ใช้ต่อ path บน Z: ด้วย
 * PUT  { config } → บันทึก (สิทธิ์ assets.manage) + ประวัติว่าเปลี่ยนอะไร
 * เก็บใน ui_config key = FILE_SORT_CONFIG_KEY (lib/file-sort) · คู่มือ docs/file-sorter.md
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditFor } from "@/lib/audit";
import { driveConfigured } from "@/lib/google-drive";
import { FILE_SORT_CONFIG_KEY, cleanFileSortConfig, type FileSortRule } from "@/lib/file-sort";
import { loadFileSortConfig } from "@/lib/file-sort-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [config, brandsRes, foldersRes, typesRes, subsRes] = await Promise.all([
    loadFileSortConfig(admin),
    admin.from("brands").select("id, name, hide_in_artwork").eq("is_active", true).order("name"),
    admin.from("erp_brand_drive_folders").select("brand_id, folder_label"),
    admin.from("erp_lookups").select("name, sort_order").eq("lookup_type", "artwork_type").eq("is_active", true).order("sort_order"),
    admin.from("erp_artwork_drive_folders").select("artwork_type, subfolder_name"),
  ]);
  const folderOf = new Map(((foldersRes.data ?? []) as { brand_id: string; folder_label: string | null }[]).map((r) => [r.brand_id, (r.folder_label ?? "").trim()]));
  const subOf = new Map(((subsRes.data ?? []) as { artwork_type: string; subfolder_name: string | null }[]).map((r) => [r.artwork_type, (r.subfolder_name ?? "").trim()]));
  const brands = ((brandsRes.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean | null }[])
    .filter((b) => !b.hide_in_artwork)
    .map((b) => ({ id: b.id, name: b.name, folder: folderOf.get(b.id) || null }));
  const artwork_types = ((typesRes.data ?? []) as { name: string }[])
    .filter((t) => t.name?.trim())
    .map((t) => ({ name: t.name, folder: subOf.get(t.name) || t.name }));
  return NextResponse.json(
    { data: config, brands, artwork_types, drive_configured: driveConfigured(), error: null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const ruleText = (x: FileSortRule) => [x.library && "คลัง", x.drive && "Drive", x.nas && "Z:"].filter(Boolean).join("+") || "ไม่ส่ง";

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  let b: { config?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const next = cleanFileSortConfig(b.config);
  const admin = supabaseAdmin();
  const prev = await loadFileSortConfig(admin);
  const { error } = await admin.from("ui_config")
    .upsert({ key: FILE_SORT_CONFIG_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "บันทึกสูตรไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  // ประวัติ: บอกเป็นภาษาคนว่าสูตรไหนเปลี่ยนอะไร (ราก Z: · นามสกุลที่เพิ่ม/ลบ/เปลี่ยนปลายทาง · นามสกุลอื่น)
  const changes = next.profiles.map((p) => {
    const old = prev.profiles.find((x) => x.key === p.key);
    const oldRules = new Map((old?.rules ?? []).map((x) => [x.ext, x]));
    const newRules = new Map(p.rules.map((x) => [x.ext, x]));
    return {
      profile: p.key,
      nas_pattern: old?.nasPattern === p.nasPattern ? undefined : { old: old?.nasPattern ?? null, new: p.nasPattern },
      nas_by_type: JSON.stringify(old?.nasByType ?? {}) === JSON.stringify(p.nasByType) ? undefined : { old: old?.nasByType ?? {}, new: p.nasByType },
      added: p.rules.filter((x) => !oldRules.has(x.ext)).map((x) => `${x.ext}=${ruleText(x)}`),
      removed: (old?.rules ?? []).filter((x) => !newRules.has(x.ext)).map((x) => x.ext),
      changed: p.rules.filter((x) => oldRules.has(x.ext) && ruleText(oldRules.get(x.ext)!) !== ruleText(x))
        .map((x) => ({ ext: x.ext, old: ruleText(oldRules.get(x.ext)!), new: ruleText(x) })),
      reordered: old ? old.rules.map((x) => x.ext).filter((e) => newRules.has(e)).join() !== p.rules.map((x) => x.ext).filter((e) => oldRules.has(e)).join() : false,
      other: JSON.stringify(old?.other) === JSON.stringify(p.other) ? undefined : { old: old?.other ?? null, new: p.other },
    };
  });
  // สูตรงานสินค้า: ชื่อโฟลเดอร์หน้าที่ · ที่เก็บบน Z: · โหมดรูปเดิม
  const pp = prev.product, np = next.product;
  const diff = <T,>(a: T, b: T) => (JSON.stringify(a) === JSON.stringify(b) ? undefined : { old: a, new: b });
  const product = { nas_patterns: diff(pp.nasPatterns, np.nasPatterns), desc_folders: diff(pp.roleFolders.desc, np.roleFolders.desc), archive_folders: diff(pp.roleFolders.archive, np.roleFolders.archive), mode: diff(pp.mode, np.mode),
    moves: diff(pp.moves, np.moves), move_folders: diff(pp.moveFolders, np.moveFolders), collection: diff(pp.collection, np.collection) };
  // สูตร Content: ที่เก็บบน Z: · ชื่อโฟลเดอร์ไฟล์ดิบ · นามสกุลที่ลงอัลบั้ม
  const pc = prev.content, nc = next.content;
  const content = { nas_pattern: diff(pc.nasPattern, nc.nasPattern), raw_folders: diff(pc.rawFolders, nc.rawFolders), album_exts: diff(pc.albumExts, nc.albumExts) };
  await writeAuditFor(request, admin, { action: "file_sort_config.update", entityType: "ui_config", metadata: { key: FILE_SORT_CONFIG_KEY, changes, product, content } });
  return NextResponse.json({ ok: true, data: next, error: null });
}
