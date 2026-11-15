/**
 * POST /api/chat/conversations/[id]/send — พนักงานส่งข้อความถึงลูกค้า · สิทธิ์ chat.reply · audit "chat.send" ทุกครั้ง
 *   multipart/form-data: text? · file? (รูป JPEG/PNG ≤5MB — หน้าเว็บย่อเป็น JPEG ก่อนส่ง) · sku_id? / parent_id? (การ์ดสินค้า)
 *   หรือ JSON { text, sku_id?, parent_id? }
 *   การ์ดสินค้าสร้างจากข้อมูลจริงในระบบ (lib/chat/products) · ส่งผ่านตัวต่อช่องทาง (lib/chat/registry)
 *   LINE: ตอบฟรีถ้าลูกค้าเพิ่งทัก ≤50 วิ ไม่งั้นนับโควตา OA (ผลบอก via: reply/push)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAuditFor } from "@/lib/audit";
import { r2PutObject } from "@/lib/r2";
import { chatTextError, isUuid } from "@/lib/chat/rules";
import { CONV_SERVER_COLS, MSG_COLS, recordOutbound, type ConvServerRow } from "@/lib/chat/store";
import { chatAdapter } from "@/lib/chat/registry";
import { resolveProductCard } from "@/lib/chat/products";
import type { ChatAttachment, ChatSendRequest } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };

function appOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "chat.reply"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });

  // อ่านคำสั่ง (form-data หรือ JSON)
  let text = "", skuId: unknown = null, parentId: unknown = null, file: File | null = null;
  const ctype = request.headers.get("content-type") || "";
  if (ctype.includes("multipart/form-data")) {
    const fd = await request.formData().catch(() => null);
    if (!fd) return NextResponse.json({ error: "อ่านข้อมูลที่ส่งมาไม่ได้" }, { status: 400 });
    text = String(fd.get("text") ?? "");
    skuId = fd.get("sku_id"); parentId = fd.get("parent_id");
    const f = fd.get("file");
    file = f instanceof File && f.size > 0 ? f : null;
  } else {
    const b = (await request.json().catch(() => ({}))) as { text?: string; sku_id?: string; parent_id?: string };
    text = String(b.text ?? ""); skuId = b.sku_id; parentId = b.parent_id;
  }
  text = text.replace(/\r\n/g, "\n").trim();

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("chat_conversations").select(CONV_SERVER_COLS).eq("id", id).maybeSingle();
  const conv = (row as unknown as ConvServerRow | null) ?? null;
  if (!conv) return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });
  const adapter = chatAdapter(conv.channel);
  if (!adapter) return NextResponse.json({ error: "ช่องทางนี้ยังส่งจาก ERP ไม่ได้ — ตอบในแอปของแพลตฟอร์มไปก่อน" }, { status: 400 });

  if (text) { const err = chatTextError(conv.channel, text); if (err) return NextResponse.json({ error: err }, { status: 400 }); }
  if (file && !adapter.supports.image) return NextResponse.json({ error: "ช่องทางนี้ยังส่งรูปจาก ERP ไม่ได้" }, { status: 400 });
  if (file && !IMAGE_EXT[file.type]) return NextResponse.json({ error: "ส่งได้เฉพาะรูป JPG หรือ PNG" }, { status: 400 });
  if (file && file.size > MAX_IMAGE) return NextResponse.json({ error: "รูปใหญ่เกิน 5MB" }, { status: 400 });

  const req: ChatSendRequest = { text: text || null };
  const attachments: ChatAttachment[] = [];
  if (isUuid(skuId) || isUuid(parentId)) {
    if (!adapter.supports.product) return NextResponse.json({ error: "ช่องทางนี้ยังส่งการ์ดสินค้าจาก ERP ไม่ได้" }, { status: 400 });
    const card = await resolveProductCard(admin, { skuId, parentId }, conv.channel, conv.brand_id);
    if (!card) return NextResponse.json({ error: "ไม่พบสินค้านี้ในระบบ" }, { status: 400 });
    req.product = card;
  }
  if (file) {
    const ym = new Date().toISOString().slice(0, 7);
    const key = `chat/out/${ym}/${crypto.randomUUID()}.${IMAGE_EXT[file.type]}`;
    try { await r2PutObject(key, new Uint8Array(await file.arrayBuffer()), file.type); }
    catch { return NextResponse.json({ error: "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 }); }
    req.imageKey = key;
    attachments.push({ kind: "image", key });
  }
  if (req.product) attachments.push(req.product);
  if (!req.text && !req.imageKey && !req.product) return NextResponse.json({ error: "พิมพ์ข้อความ แนบรูป หรือเลือกสินค้าก่อนส่ง" }, { status: 400 });

  const actor = await requestActor(supabaseFromRequest(request));
  const result = await adapter.send(admin, conv, req, { origin: appOrigin(request) });
  const saved = await recordOutbound(admin, id, { text: req.text ?? null, attachments, actorId: actor.id, actorName: actor.name, result });

  await writeAuditFor(request, admin, {
    action: "chat.send", entityType: "chat_conversation", entityId: id,
    metadata: {
      name: conv.customer_name ?? "ลูกค้า", channel: conv.channel, ok: result.ok, via: result.via,
      error: result.ok ? null : result.error, text: (req.text ?? "").slice(0, 200) || null,
      image: !!req.imageKey, product: req.product?.code ?? null,
    },
  });

  const { data: msg } = saved.id ? await admin.from("chat_messages").select(MSG_COLS).eq("id", saved.id).maybeSingle() : { data: null };
  if (!result.ok) return NextResponse.json({ ok: false, message: msg ?? null, error: result.error ?? "ส่งไม่สำเร็จ" }, { status: 502 });
  return NextResponse.json({ ok: true, via: result.via, message: msg ?? null, error: null });
}
