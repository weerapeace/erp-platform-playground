/**
 * 📇 สมุดอีเมลที่บันทึกไว้ (ของกลาง · lib/email-contacts)
 * GET                                  → { contacts }
 * POST   { email, name? }              → เพิ่ม / แก้ชื่อ → { contacts, added }
 * DELETE ?email=<อีเมล>                → ลบออกจากสมุด (ไม่กระทบรายงานที่ใส่อีเมลนี้ไว้แล้ว) → { contacts }
 * สิทธิ์ admin.email_reports (คนตั้งรายงานอัตโนมัติ) · audit email_contact add/update/remove
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { loadEmailContacts, removeEmailContact, saveEmailContacts, upsertEmailContact } from "@/lib/email-contacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PERM = "admin.email_reports";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  try { return NextResponse.json({ contacts: await loadEmailContacts(supabaseAdmin()), error: null }); }
  catch (e) { return NextResponse.json({ contacts: [], error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 500 }); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { email?: unknown; name?: unknown } | null;
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const before = await loadEmailContacts(admin);
    const r = upsertEmailContact(before, { email: String(body?.email ?? ""), name: typeof body?.name === "string" ? body.name : null }, actor.name);
    if (r.error) return NextResponse.json({ contacts: before, error: r.error }, { status: 400 });
    await saveEmailContacts(admin, r.list);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const prev = before.find((c) => c.email === email);
    if (r.added || prev?.name !== r.list.find((c) => c.email === email)?.name) {
      await writeAudit(admin, {
        action: r.added ? "create" : "update", entityType: "email_contact", entityId: null, actorId: actor.id, actorName: actor.name,
        metadata: { email, name_before: prev?.name ?? null, name: r.list.find((c) => c.email === email)?.name ?? null },
      });
    }
    return NextResponse.json({ contacts: r.list, added: r.added, error: null });
  } catch (e) { return NextResponse.json({ contacts: [], error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 }); }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const email = (request.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ contacts: [], error: "ไม่ได้ระบุอีเมล" }, { status: 400 });
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const before = await loadEmailContacts(admin);
    const gone = before.find((c) => c.email === email);
    if (!gone) return NextResponse.json({ contacts: before, error: null });
    const list = removeEmailContact(before, email);
    await saveEmailContacts(admin, list);
    await writeAudit(admin, { action: "delete", entityType: "email_contact", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { email, name: gone.name } });
    return NextResponse.json({ contacts: list, error: null });
  } catch (e) { return NextResponse.json({ contacts: [], error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 }); }
}
