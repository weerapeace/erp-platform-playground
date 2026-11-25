/**
 * /api/ai/tag-setup — ✨ ให้ AI ช่วยคิดการตั้งค่า "ประเภทสินค้า" (แท็ก + กฎ) ในป๊อป AI ร่างรายละเอียดสินค้า
 *   POST { name, name_en?, groups: [{id,name}], slots: [{id,name}], manual_keys: string[] }
 *     → { data: { name_en, group_id, topics: [{th,en,options[]}], highlights[], slot_ids[], manual_required[] } }
 *   ใช้ที่: ป๊อป "สร้างแท็กประเภทสินค้า" + "⚙ ตั้งค่าประเภทนี้" (ขั้น 2)
 *   รุ่นถูกสุด gpt-4o-mini · ส่งแค่ข้อความ (ไม่ส่งรูป) ~0.02 บาท/ครั้ง · นับโควตาในศูนย์ AI key = ai.tag_setup
 *   ส่งกฎที่มีอยู่เป็นตัวอย่าง → ได้รูปแบบเดียวกันทั้งระบบ · กลุ่ม/ชนิดช่อง/ช่องกรอกมือ เลือกได้เฉพาะของที่ส่งมา (sanitizeTagSetup)
 * สิทธิ์: ai.caption + tasks.approve (สิทธิ์เดียวกับแก้กฎ) · audit ai_tag_setup
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat } from "@/lib/paid-services-server";
import { MANUAL_FIELDS, normalizeExtras, sanitizeTagSetup } from "@/lib/ai-draft-setup";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const CHEAP_MODEL = "gpt-4o-mini";

type Opt = { id?: string; name?: string };
const opts = (v: unknown, max: number) => (Array.isArray(v) ? v : [])
  .map((x: Opt) => ({ id: String(x?.id ?? "").trim(), name: String(x?.name ?? "").trim().slice(0, 80) }))
  .filter((x) => x.id && x.name).slice(0, max);

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption)" }, { status: 401 });
  if (!(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ต้องเป็นหัวหน้า/ผู้ดูแลจึงตั้งค่าประเภทสินค้าได้ (tasks.approve)" }, { status: 401 });
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI (OPENAI_API_KEY)" }, { status: 400 });

  let b: { name?: string; name_en?: string; groups?: unknown; slots?: unknown; manual_keys?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "ใส่ชื่อประเภทสินค้า (ชื่อไทย) ก่อน" }, { status: 400 });
  const groups = opts(b.groups, 80);
  const slots = opts(b.slots, 80);
  const manual = MANUAL_FIELDS.map((f) => ({ id: f.key, name: f.label }));

  // ตัวอย่างจากกฎที่มีอยู่ (รูปแบบเดียวกันทั้งระบบ)
  const admin = supabaseAdmin();
  const { data: rules } = await admin.from("erp_ai_product_rules").select("name, required_topics, topic_options, extras").eq("is_active", true).limit(6);
  const examples = ((rules ?? []) as { name: string; required_topics: string[] | null; topic_options: Record<string, string[]> | null; extras: unknown }[])
    .map((r) => {
      const ex = normalizeExtras(r.extras);
      const tp = (r.required_topics ?? []).map((t) => `${t}${(r.topic_options ?? {})[t]?.length ? `: ${(r.topic_options ?? {})[t].join(", ")}` : ""}`);
      return `- "${r.name}": หัวข้อ = ${tp.join(" | ") || "-"}${ex.highlights.length ? ` · จุดเด่น = ${ex.highlights.join(", ")}` : ""}`;
    }).join("\n");

  const system = [
    "คุณช่วยตั้งค่า 'ประเภทสินค้า' ให้ร้านขายเครื่องหนัง/กระเป๋า/ของใช้ในไทย เพื่อใช้เป็นแบบฟอร์มก่อนให้ AI เขียนรายละเอียดสินค้า",
    "ตอบ JSON เท่านั้น:",
    '{"name_en":"ชื่อประเภทภาษาอังกฤษ สั้น เป็นคำที่ร้านค้าออนไลน์ใช้","group_id":"id กลุ่มจากรายการ หรือ \\"\\"",',
    '"topics":[{"th":"คำถามสั้นที่ต้องรู้ก่อนเขียน แต่ดูจากรูปไม่ออก","en":"English","options":["ตัวเลือกคำตอบสั้น 2-5 ข้อ"]}],',
    '"highlights":["จุดเด่นที่สินค้าประเภทนี้มักมี 6-10 ข้อ สั้น 2-5 คำ"],',
    '"slot_ids":["id ชนิดช่องที่สินค้าประเภทนี้มักมี จากรายการเท่านั้น"],',
    '"manual_required":["id ช่องที่ควรบังคับกรอกเอง จากรายการเท่านั้น"]}',
    "กติกา:",
    "- topics 3-6 ข้อ ถามเฉพาะสิ่งที่ลูกค้าอยากรู้และ AI ดูจากรูปไม่ออก (วัสดุจริง จำนวนช่อง ถอดสายได้ไหม กันน้ำ ฯลฯ) ห้ามถามขนาด/น้ำหนัก (มีขั้นวัดขนาดแยก)",
    "- group_id / slot_ids / manual_required ต้องเป็น id ที่อยู่ในรายการที่ให้เท่านั้น ห้ามแต่ง id ใหม่ · ไม่แน่ใจให้เว้นว่าง",
    "- ภาษาไทยที่คนไทยใช้จริง ไม่ทางการเกินไป",
  ].join("\n");
  const user = [
    `ประเภทสินค้า: ${name}${b.name_en ? ` (EN: ${String(b.name_en).slice(0, 80)})` : ""}`,
    `กลุ่มที่มี: ${groups.map((g) => `${g.id}=${g.name}`).join(" | ") || "-"}`,
    `ชนิดช่องที่มี: ${slots.map((s) => `${s.id}=${s.name}`).join(" | ") || "-"}`,
    `ช่องกรอกเองที่มี: ${manual.map((m) => `${m.id}=${m.name}`).join(" | ")}`,
    examples ? `ตัวอย่างประเภทที่ตั้งไว้แล้ว (ทำรูปแบบเดียวกัน):\n${examples}` : "",
  ].filter(Boolean).join("\n");

  let out: Record<string, unknown>;
  try {
    out = await aiChat("ai.tag_setup", system, [{ type: "text", text: user }], 900, CHEAP_MODEL, { request });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI ตอบกลับไม่สำเร็จ" }, { status: 502 });
  }
  const data = sanitizeTagSetup(out, { groupIds: groups.map((g) => g.id), slotIds: slots.map((s) => s.id) });

  const { data: { user: actor } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "ai_tag_setup", entityType: "product_families", entityId: null, actorId: actor?.id ?? null, actorName: actor?.email ?? null, metadata: { name, topics: data.topics.length, highlights: data.highlights.length, model: CHEAP_MODEL } });
  return NextResponse.json({ data, error: null });
}
