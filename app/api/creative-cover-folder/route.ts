/**
 * โฟลเดอร์ Google Drive ปลายทางเก็บ "รูปปก" (งาน cover) — ตั้ง/แก้ได้เอง
 * เก็บใน china_app_settings.skey='cover_drive_folder' sval={ folder_id, name, url }
 *
 * GET  → { folder_id, name, url, configured, drive_configured, default_path }
 * POST { input }        → แปลงลิงก์/ID → ตรวจว่าเข้าถึงได้ (เป็นโฟลเดอร์) → บันทึก
 * POST { clear: true }  → ล้าง (กลับไปใช้ค่าเริ่มต้น [01] Catalogs/02_Contents/02_cover)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { driveConfigured, driveGetFolder } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SKEY = "cover_drive_folder";
const DEFAULT_PATH = "[01] Catalogs / 02_Contents / 02_cover";
type Admin = ReturnType<typeof supabaseAdmin>;
type Cfg = { folder_id?: string; name?: string; url?: string };

async function readCfg(admin: Admin): Promise<{ id?: string; cfg: Cfg }> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", SKEY).maybeSingle();
  return { id: (row as { id?: string } | null)?.id, cfg: ((row as { sval?: Cfg } | null)?.sval ?? {}) as Cfg };
}

/** ดึง folder id จากลิงก์ Drive (.../folders/<id> หรือ ?id=<id>) หรือรับ id ดิบ */
function extractFolderId(input: string): string {
  const s = (input || "").trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{16,}$/.test(s)) return s;   // id ดิบ (Drive id ยาว ~28-44)
  return "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { cfg } = await readCfg(supabaseAdmin());
  return NextResponse.json({
    folder_id: cfg.folder_id ?? "", name: cfg.name ?? "", url: cfg.url ?? "",
    configured: !!cfg.folder_id, drive_configured: driveConfigured(), default_path: DEFAULT_PATH, error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const admin = supabaseAdmin();
  let body: { input?: string; clear?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { id } = await readCfg(admin);

  if (body.clear) {
    if (id) await admin.from("china_app_settings").update({ sval: {} }).eq("id", id);
    return NextResponse.json({ ok: true, cleared: true, error: null });
  }

  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive (service account)" }, { status: 400 });
  const fid = extractFolderId(body.input ?? "");
  if (!fid) return NextResponse.json({ error: "วางลิงก์โฟลเดอร์ Drive หรือ ID ให้ถูกต้อง (เช่น https://drive.google.com/drive/folders/XXXX)" }, { status: 400 });

  let folder: { id: string; name: string; webViewLink: string } | null = null;
  try { folder = await driveGetFolder(fid); }
  catch (e) { return NextResponse.json({ error: `ตรวจโฟลเดอร์ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 }); }
  if (!folder) return NextResponse.json({ error: "เข้าถึงโฟลเดอร์นี้ไม่ได้ — แชร์ให้ service account (สิทธิ์ Editor) แล้วหรือยัง? หรือไม่ใช่โฟลเดอร์" }, { status: 400 });

  const cfg: Cfg = { folder_id: folder.id, name: folder.name, url: folder.webViewLink };
  if (id) await admin.from("china_app_settings").update({ sval: cfg }).eq("id", id);
  else await admin.from("china_app_settings").insert({ skey: SKEY, sval: cfg });
  return NextResponse.json({ ok: true, ...cfg, error: null });
}
