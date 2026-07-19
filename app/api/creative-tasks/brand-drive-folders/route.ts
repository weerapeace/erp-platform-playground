/**
 * โฟลเดอร์ Google Drive "แม่" ต่อแบรนด์ — งานเรียงพิมพ์/สร้างโฟลเดอร์จะไปลงใต้โฟลเดอร์นี้ตามแบรนด์ของงาน
 * เก็บใน china_app_settings.skey='brand_drive_folders' sval={ "<brand_id>": { folder_id, name, url } }
 *
 * GET  → { brands: [{ id, name, color, folder_id, folder_name, folder_url }], drive_configured }
 * POST { brand_id, input }       → แปลงลิงก์/ID → ตรวจว่าเข้าถึงได้ (เป็นโฟลเดอร์) → บันทึกของแบรนด์นั้น
 * POST { brand_id, clear: true } → ล้างของแบรนด์นั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { driveConfigured, driveGetFolder } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SKEY = "brand_drive_folders";
type Admin = ReturnType<typeof supabaseAdmin>;
type FolderCfg = { folder_id: string; name?: string; url?: string };
type Map = Record<string, FolderCfg>;

async function readMap(admin: Admin): Promise<{ id?: string; map: Map }> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", SKEY).maybeSingle();
  return { id: (row as { id?: string } | null)?.id, map: ((row as { sval?: Map } | null)?.sval ?? {}) as Map };
}

/** ดึง folder id จากลิงก์ Drive (.../folders/<id> หรือ ?id=<id>) หรือรับ id ดิบ */
function extractFolderId(input: string): string {
  const s = (input || "").trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{16,}$/.test(s)) return s;   // id ดิบ
  return "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { map } = await readMap(admin);
  const { data: brands } = await admin.from("brands").select("id, name, color").order("name");
  const list = ((brands ?? []) as { id: string; name: string; color: string | null }[]).map((b) => {
    const c = map[b.id];
    return { id: b.id, name: b.name, color: b.color, folder_id: c?.folder_id ?? "", folder_name: c?.name ?? "", folder_url: c?.url ?? "" };
  });
  return NextResponse.json({ brands: list, drive_configured: driveConfigured(), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const admin = supabaseAdmin();
  let body: { brand_id?: string; input?: string; clear?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = String(body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "ไม่ได้ระบุแบรนด์" }, { status: 400 });

  const { id, map } = await readMap(admin);
  const save = async (next: Map) => {
    if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id);
    else await admin.from("china_app_settings").insert({ skey: SKEY, sval: next });
  };

  if (body.clear) {
    const next = { ...map }; delete next[brandId];
    await save(next);
    return NextResponse.json({ ok: true, cleared: true, error: null });
  }

  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive (service account)" }, { status: 400 });
  const fid = extractFolderId(body.input ?? "");
  if (!fid) return NextResponse.json({ error: "วางลิงก์โฟลเดอร์ Drive หรือ ID ให้ถูกต้อง (เช่น https://drive.google.com/drive/folders/XXXX)" }, { status: 400 });

  let folder: { id: string; name: string; webViewLink: string } | null = null;
  try { folder = await driveGetFolder(fid); }
  catch (e) { return NextResponse.json({ error: `ตรวจโฟลเดอร์ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 }); }
  if (!folder) return NextResponse.json({ error: "เข้าถึงโฟลเดอร์นี้ไม่ได้ — แชร์ให้ service account (สิทธิ์ Editor) แล้วหรือยัง? หรือไม่ใช่โฟลเดอร์" }, { status: 400 });

  const next: Map = { ...map, [brandId]: { folder_id: folder.id, name: folder.name, url: folder.webViewLink } };
  await save(next);
  return NextResponse.json({ ok: true, brand_id: brandId, folder_id: folder.id, folder_name: folder.name, folder_url: folder.webViewLink, error: null });
}
