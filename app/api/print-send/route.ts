// ============================================================
// /api/print-send — ส่ง PDF จากแถบพิมพ์ไป LINE / อีเมล (ของกลาง · ดู lib/print-send)
//   GET  → ปลายทางที่ส่งได้ { line: [{ key, label }], email: boolean }
//   POST (multipart) pdf, fileName, docType, docId?, message, lineTargets (JSON), emails (JSON)
//        → เก็บ Google Drive (ห้าม R2) → เปิดลิงก์ → LINE ข้อความ+ลิงก์ (lib/line-send) · อีเมลแนบไฟล์ → บันทึกประวัติ
// สิทธิ์: reports.view (คนเปิดหน้าพิมพ์ได้ = บันทึก PDF ได้อยู่แล้ว) · ส่งเมื่อผู้ใช้กดเท่านั้น
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { driveConfigured, driveEnsureFolder, driveShareAnyone, driveUploadFile, DRIVE_ROOT_FOLDER_ID } from "@/lib/google-drive";
import { lineErrorText, lineText, linePush, loadLineConfig } from "@/lib/line-send";
import { LINE_SLOTS, type LineSlotKey } from "@/lib/line-registry";
import { emailConfigured, sendEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";
import { LINE_INTAKE_SLOTS, PRINT_SEND_MAX_BYTES, lineSendText, parseEmails, safePdfName, sendMonthFolder } from "@/lib/print-send";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const ROOT_FOLDER_NAME = "ERP เอกสารที่ส่ง";
const MAIN_KEY = "main";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** กลุ่ม LINE ที่ตั้งไว้แล้ว (ไม่รวมกลุ่มรับเข้า) + กลุ่มหลัก */
async function lineTargets() {
  const admin = supabaseAdmin();
  const cfg = await loadLineConfig(admin);
  const out: { key: string; label: string; to: string; slot: string | null }[] = [];
  if (cfg.group_id) out.push({ key: MAIN_KEY, label: "กลุ่มหลัก", to: String(cfg.group_id), slot: null });
  for (const [slot, gid] of Object.entries(cfg.groups ?? {})) {
    if (!gid || LINE_INTAKE_SLOTS.includes(slot)) continue;
    const def = LINE_SLOTS[slot as LineSlotKey];
    out.push({ key: slot, label: def ? def.label : slot, to: String(gid), slot });
  }
  return { cfg, targets: out };
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "reports.view");
  if (denied) return denied;
  try {
    const { targets } = await lineTargets();
    return NextResponse.json({ line: targets.map(({ key, label }) => ({ key, label })), email: emailConfigured(), drive: driveConfigured(), error: null });
  } catch (e) {
    return NextResponse.json({ line: [], email: emailConfigured(), drive: driveConfigured(), error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" });
  }
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "reports.view");
  if (denied) return denied;
  const form = await request.formData().catch(() => null);
  const pdf = form?.get("pdf");
  if (!form || !(pdf instanceof Blob)) return NextResponse.json({ error: "ไม่มีไฟล์ PDF" }, { status: 400 });
  if (pdf.size > PRINT_SEND_MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป (เกิน 4 MB) — ลองลดจำนวนหน้า" }, { status: 413 });
  const head = new Uint8Array(await pdf.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== "%PDF-") return NextResponse.json({ error: "ไฟล์ไม่ใช่ PDF" }, { status: 400 });

  const fileName = safePdfName(String(form.get("fileName") ?? ""));
  const docType = String(form.get("docType") ?? "doc").slice(0, 40);
  const docId = String(form.get("docId") ?? "").slice(0, 80) || null;
  const message = String(form.get("message") ?? "").slice(0, 2000);
  let lineKeys: string[] = [];
  let emailText = "";
  try { lineKeys = (JSON.parse(String(form.get("lineTargets") ?? "[]")) as unknown[]).map(String).slice(0, 10); } catch { /* ว่าง */ }
  try { emailText = (JSON.parse(String(form.get("emails") ?? "[]")) as unknown[]).map(String).join(","); } catch { /* ว่าง */ }
  const emails = parseEmails(emailText);
  if (emails.bad.length) return NextResponse.json({ error: `อีเมลไม่ถูกต้อง: ${emails.bad.join(", ")}` }, { status: 400 });
  if (!lineKeys.length && !emails.ok.length) return NextResponse.json({ error: "ยังไม่ได้เลือกผู้รับ" }, { status: 400 });
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive — แจ้งผู้ดูแลระบบ" }, { status: 503 });

  let sender: { id: string | null; email: string | null } = { id: null, email: null };
  try { const { data: { user } } = await supabaseFromRequest(request).auth.getUser(); sender = { id: user?.id ?? null, email: user?.email ?? null }; } catch { /* ไม่มีตัวตน */ }

  // 1) เก็บ Drive (ไฟล์งานพิมพ์อยู่ Drive เท่านั้น — ห้าม R2)
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  let link = "";
  let fileId = "";
  try {
    const root = await driveEnsureFolder(ROOT_FOLDER_NAME, DRIVE_ROOT_FOLDER_ID);
    const month = await driveEnsureFolder(sendMonthFolder(), root);
    const up = await driveUploadFile(fileName, "application/pdf", bytes, month);
    fileId = up.id; link = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`;
    await driveShareAnyone(up.id);   // คนมีลิงก์เปิดดูได้ (ผู้รับไม่มีบัญชีในระบบ)
  } catch (e) {
    return NextResponse.json({ error: `เก็บไฟล์ใน Google Drive ไม่สำเร็จ: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  // 2) LINE — ข้อความ + ลิงก์ (LINE ส่งไฟล์ PDF ไม่ได้)
  const results: { channel: "line" | "email"; to: string; ok: boolean; error?: string }[] = [];
  if (lineKeys.length) {
    const { cfg, targets } = await lineTargets();
    const text = lineSendText(message, fileName, link, sender.email ?? undefined);
    for (const key of lineKeys) {
      const t = targets.find((x) => x.key === key);
      if (!t) { results.push({ channel: "line", to: key, ok: false, error: "ไม่พบกลุ่ม LINE นี้แล้ว" }); continue; }
      const r = await linePush(cfg, { to: t.to, slot: t.slot, messages: [lineText(text)] });
      results.push({ channel: "line", to: t.label, ok: r.ok, ...(r.ok ? {} : { error: r.error || lineErrorText(r.status) }) });
    }
  }

  // 3) อีเมล — แนบไฟล์ + ลิงก์
  if (emails.ok.length) {
    if (!emailConfigured()) {
      for (const to of emails.ok) results.push({ channel: "email", to, ok: false, error: "ยังไม่ได้ตั้งค่าการส่งอีเมล" });
    } else {
      const body = message.trim() || fileName;
      for (const to of emails.ok) {
        const r = await sendEmail({
          to, subject: fileName.replace(/\.pdf$/i, ""),
          text: `${body}\n\n${fileName}\n${link}`,
          html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${esc(body).replace(/\n/g, "<br>")}<p>📄 <a href="${esc(link)}">${esc(fileName)}</a> (แนบไฟล์มาด้วย)</p></div>`,
          ...(sender.email ? { replyTo: sender.email } : {}),
          attachments: [{ filename: fileName, content: Buffer.from(bytes), contentType: "application/pdf" }],
        });
        results.push({ channel: "email", to, ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
      }
    }
  }

  // 4) ประวัติการส่ง (ใคร ส่งอะไร ถึงใคร เมื่อไหร่)
  const uuid = docId && /^[0-9a-f-]{36}$/i.test(docId) ? docId : null;
  await writeAudit(supabaseAdmin(), {
    action: "document.sent", entityType: docType, entityId: uuid, actorId: sender.id, actorName: sender.email,
    metadata: { file: fileName, doc_id: docId, drive_file_id: fileId, link, results },
  });

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ link, results, ok: okCount, failed: results.length - okCount, error: null });
}
