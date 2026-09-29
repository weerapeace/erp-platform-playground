/**
 * สมุดรายวัน 1 ใบ
 *   GET    → หัวใบ + บรรทัด
 *   POST   → ผ่านรายการ (ร่าง → ผ่านแล้ว) · หรือ { action: "reverse" } = กลับรายการใบที่ผ่านแล้ว (ออกใบใหม่สลับเดบิต/เครดิต)
 *   PATCH  → แก้ใบร่าง { entry_date?, description?, reference?, lines? }
 *   DELETE → ยกเลิกใบร่าง (สถานะ void · ไม่ลบจริง เพราะเลขที่ใบนับจากจำนวนใบ — ลบแล้วเลขจะชนกัน)
 * ใบที่ผ่านรายการแล้ว ห้ามแก้/ลบ — ต้อง "กลับรายการ" เท่านั้น (ประวัติบัญชีต้องอยู่ครบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

type Row = Record<string, unknown>;
type LineIn = { account_code?: string; description?: string; debit?: number; credit?: number };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const reversalRef = (entryNumber: string) => `กลับรายการ ${entryNumber}`;

async function actorOf(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { actorId: user?.id ?? null, actorName: (user?.user_metadata?.name as string) || user?.email || null };
}

// GET — header + lines
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_journal_get", { p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// POST — post (draft → posted)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let b: { actor?: string; action?: string; reason?: string } = {};
  try { b = await request.json(); } catch { /* optional body */ }
  if (b.action === "reverse") return reverseJournal(request, id, b.actor ?? null, String(b.reason ?? "").trim());
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_journal_post", {
    p_id: id, p_actor: b.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data, error: null });
}

// ↩ กลับรายการใบที่ผ่านแล้ว — ออกใบใหม่ (สลับเดบิต/เครดิต) แล้วผ่านรายการทันที · ใบเดิมอยู่ครบ
async function reverseJournal(request: NextRequest, id: string, actor: string | null, reason: string) {
  const denied = await guardApi(request, "accounting.post"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data: j } = await admin.from("erp_playground_journals").select("id, entry_number, status, description, reference").eq("id", id).maybeSingle();
  if (!j) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const h = j as Row;
  if (h.status !== "posted") return NextResponse.json({ error: h.status === "draft" ? "ใบนี้ยังเป็นร่าง — แก้ไขหรือยกเลิกร่างได้เลย ไม่ต้องกลับรายการ" : "ใบนี้ถูกยกเลิกแล้ว" }, { status: 400 });
  const entryNo = String(h.entry_number ?? "");
  if (String(h.reference ?? "").startsWith("กลับรายการ ")) return NextResponse.json({ error: "ใบนี้เป็นใบกลับรายการอยู่แล้ว — ถ้ากลับผิด ให้บันทึกรายการใหม่" }, { status: 400 });

  const { data: dup } = await admin.from("erp_playground_journals").select("entry_number").eq("reference", reversalRef(entryNo)).neq("status", "void").limit(1);
  if (dup && dup.length) return NextResponse.json({ error: `ใบนี้ถูกกลับรายการไปแล้ว (${String((dup[0] as Row).entry_number ?? "")})` }, { status: 400 });

  const { data: lines } = await admin.from("erp_playground_journal_lines").select("account_code, description, debit, credit, line_no").eq("journal_id", id).order("line_no");
  const swapped = ((lines ?? []) as Row[]).map((l) => ({ account_code: String(l.account_code), description: l.description ? String(l.description) : undefined, debit: num(l.credit), credit: num(l.debit) }));
  if (swapped.length < 2) return NextResponse.json({ error: "ใบเดิมไม่มีบรรทัดให้กลับ" }, { status: 400 });

  // สร้าง + ผ่านรายการ ด้วยสิทธิ์ของผู้ใช้ (ฟังก์ชันใน DB เช็กสิทธิ์ + ออกเลขเอง)
  const sb = supabaseFromRequest(request);
  const { data: created, error: cErr } = await sb.rpc("erp_playground_journal_create", {
    p_entry_date: null,
    p_description: `กลับรายการ ${entryNo}${reason ? ` — ${reason}` : ""}`,
    p_reference: reversalRef(entryNo),
    p_lines: swapped,
    p_actor: actor,
  });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
  const newId = String((created as Row | null)?.id ?? "");
  const newNo = String((created as Row | null)?.entry_number ?? "");
  const { error: pErr } = await sb.rpc("erp_playground_journal_post", { p_id: newId, p_actor: actor });
  if (pErr) return NextResponse.json({ error: `สร้างใบกลับรายการ ${newNo} แล้ว แต่ผ่านรายการไม่สำเร็จ: ${pErr.message} — เปิดใบนั้นแล้วกดผ่านรายการเอง` }, { status: 400 });

  await writeAudit(admin, { action: "reverse", entityType: "erp_playground_journal", entityId: id, ...(await actorOf(request)),
    metadata: { entry_number: entryNo, reversal_entry: newNo, reversal_id: newId, reason: reason || null } });
  return NextResponse.json({ data: { id: newId, entry_number: newNo }, error: null });
}

// ✏️ แก้ใบร่าง
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "accounting.manage"); if (denied) return denied;
  const { id } = await params;
  let b: { entry_date?: string; description?: string; reference?: string; lines?: LineIn[] };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: j } = await admin.from("erp_playground_journals").select("id, entry_number, entry_date, description, reference, status, total_debit").eq("id", id).maybeSingle();
  if (!j) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const h = j as Row;
  if (h.status !== "draft") return NextResponse.json({ error: "แก้ได้เฉพาะใบร่าง — ใบที่ผ่านรายการแล้วให้ “กลับรายการ” แล้วบันทึกใหม่" }, { status: 400 });

  const patch: Row = { updated_at: new Date().toISOString() };
  if (b.entry_date) patch.entry_date = b.entry_date;
  if (b.description !== undefined) patch.description = String(b.description ?? "").trim() || null;
  if (b.reference !== undefined) patch.reference = String(b.reference ?? "").trim() || null;

  let newLines: { account_code: string; account_name: string | null; description: string | null; debit: number; credit: number }[] | null = null;
  if (Array.isArray(b.lines)) {
    const clean = b.lines.filter((l) => l?.account_code && (num(l.debit) || num(l.credit)));
    if (clean.length < 2) return NextResponse.json({ error: "ต้องมีอย่างน้อย 2 บรรทัด (เดบิต+เครดิต)" }, { status: 400 });
    if (clean.some((l) => num(l.debit) < 0 || num(l.credit) < 0)) return NextResponse.json({ error: "จำนวนเงินติดลบไม่ได้" }, { status: 400 });
    const d = clean.reduce((t, l) => t + num(l.debit), 0), c = clean.reduce((t, l) => t + num(l.credit), 0);
    if (Math.round(d * 100) !== Math.round(c * 100)) return NextResponse.json({ error: `เดบิต (${d}) ไม่เท่ากับ เครดิต (${c}) — รายการไม่สมดุล` }, { status: 400 });
    if (d === 0) return NextResponse.json({ error: "ยอดรวมต้องไม่เป็นศูนย์" }, { status: 400 });
    const codes = [...new Set(clean.map((l) => String(l.account_code)))];
    const { data: accs } = await admin.from("erp_playground_accounts").select("code, name").in("code", codes);
    const nameOf = new Map(((accs ?? []) as Row[]).map((a) => [String(a.code), String(a.name ?? "")]));
    const missing = codes.filter((k) => !nameOf.has(k));
    if (missing.length) return NextResponse.json({ error: `ไม่พบบัญชี ${missing.join(", ")} ในผังบัญชี` }, { status: 400 });
    newLines = clean.map((l) => ({ account_code: String(l.account_code), account_name: nameOf.get(String(l.account_code)) ?? null, description: l.description ? String(l.description) : null, debit: num(l.debit), credit: num(l.credit) }));
    patch.total_debit = d; patch.total_credit = c;
  }

  if (newLines) {
    // สลับบรรทัด: เก็บของเก่าไว้ก่อน ถ้าใส่ของใหม่ไม่สำเร็จจะใส่ของเก่าคืน (กันใบเหลือแต่หัว)
    const { data: old } = await admin.from("erp_playground_journal_lines").select("line_no, account_code, account_name, description, debit, credit").eq("journal_id", id).order("line_no");
    const { error: dErr } = await admin.from("erp_playground_journal_lines").delete().eq("journal_id", id);
    if (dErr) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + dErr.message }, { status: 400 });
    const { error: iErr } = await admin.from("erp_playground_journal_lines").insert(newLines.map((l, i) => ({ journal_id: id, line_no: i + 1, ...l })));
    if (iErr) {
      if (old && old.length) await admin.from("erp_playground_journal_lines").insert((old as Row[]).map((l) => ({ journal_id: id, ...l })));
      return NextResponse.json({ error: "บันทึกบรรทัดไม่สำเร็จ (คืนของเดิมแล้ว): " + iErr.message }, { status: 400 });
    }
  }
  const { error } = await admin.from("erp_playground_journals").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 400 });

  await writeAudit(admin, { action: "update", entityType: "erp_playground_journal", entityId: id, ...(await actorOf(request)),
    metadata: { entry_number: h.entry_number, old: { entry_date: h.entry_date, description: h.description, reference: h.reference, total: h.total_debit }, new: patch, lines_replaced: newLines ? newLines.length : 0 } });
  return NextResponse.json({ data: { id }, error: null });
}

// 🗑 ยกเลิกใบร่าง
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "accounting.manage"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: j } = await admin.from("erp_playground_journals").select("id, entry_number, status, description, total_debit").eq("id", id).maybeSingle();
  if (!j) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const h = j as Row;
  if (h.status === "posted") return NextResponse.json({ error: "ใบนี้ผ่านรายการแล้ว ยกเลิกตรง ๆ ไม่ได้ — ใช้ “กลับรายการ”" }, { status: 400 });
  if (h.status === "void") return NextResponse.json({ error: "ใบนี้ถูกยกเลิกไปแล้ว" }, { status: 400 });
  const { error } = await admin.from("erp_playground_journals").update({ status: "void", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "ยกเลิกไม่สำเร็จ: " + error.message }, { status: 400 });
  await writeAudit(admin, { action: "cancel", entityType: "erp_playground_journal", entityId: id, ...(await actorOf(request)),
    metadata: { entry_number: h.entry_number, description: h.description, total: h.total_debit, was: "draft" } });
  return NextResponse.json({ data: { id }, error: null });
}
