/**
 * /api/ai/mass-plan — ให้ AI ในระบบร่างแผนโพสต์ทั้งช่วง (ปุ่ม "ให้ AI ร่างเลย" ในป๊อปวางแผนแบบ Mass ของปฏิทินคอนเทนต์)
 *   POST { brand_id, start, end, per_week, platforms[], pillars[], campaign?, extra?, tone?, recommended_times? }
 *     → { rows: MassRawRow[] (1 แถว = 1 โพสต์ × 1 แพลตฟอร์ม), posts, model, warnings[] }
 *   ผลลัพธ์ยังไม่บันทึก — ป๊อปเอาไปเข้าหน้าตรวจชุดเดียวกับ "วางคำตอบจาก AI ภายนอก" แล้วผู้ใช้กดลงเอง
 *
 * ยิง 2 จังหวะให้เร็ว + เรื่องตรงกันข้ามแพลตฟอร์ม:
 *   1) วางตาราง (วัน/เวลา/หัวข้อ/แนว/แพลตฟอร์ม/ไอเดีย) ครั้งเดียว — ข้อความสั้น
 *   2) เขียนแคปชั่น "ทีละแพลตฟอร์มพร้อมกัน" (แต่ละที่เขียนต่างกัน) — ข้ามแพลตฟอร์มที่ตั้งว่าไม่ใช้แคปชั่น
 * ไม่ส่งรูป → ถูก (≈ 1–3 บาท/ครั้ง ตามจำนวนโพสต์ ด้วยรุ่น gpt-4.1-mini ที่ตั้งไว้) · prompt เพิ่มเติมตั้งได้ที่ทะเบียน prompt key "mass_plan"
 * สิทธิ์: tasks.create + ai.caption (มีค่าใช้จ่ายต่อครั้ง) · audit ai_mass_plan
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { chatJson, loadPromptRows, normalizeHashtags, openAiKey, pickJobPrompt, productDetailModel } from "@/lib/ai-caption";
import { isUuid } from "@/lib/marketing/sku-list";
import { bangkokDateKey } from "@/lib/marketing/content-plan";
import {
  buildMassPlanContext, daysInRange, estimatePostCount, isRealDate, normTime, platformRule, specialDaysBetween, thaiDateLabel,
  type MassPlanBrief, type MassPlatform, type MassRawRow,
} from "@/lib/marketing/mass-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const MASS_PLAN_KEY = "mass_plan";
const MAX_DAYS = 62;
const MAX_ROWS = 160;

// ไอเดียรูป/คลิปใช้ร่วมทุกแพลตฟอร์มของโพสต์ (จังหวะแรกตอบสั้น = เร็ว ไม่โดนตัดกลางทางตอนเลือกหลายแพลตฟอร์ม)
type PlanPost = { date: string; time: string; title: string; pillar: string; platforms: string[]; idea: string };
const str = (v: unknown, n = 2000) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ใช้ปุ่ม \"ขอ prompt\" ไปถาม AI เองได้ หรือขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });
  if (!openAiKey())
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(body.brand_id)) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });
  const brandId = body.brand_id as string;
  const today = bangkokDateKey(new Date());
  const end = str(body.end, 10);
  const start = str(body.start, 10) < today ? today : str(body.start, 10);
  if (!isRealDate(start) || !isRealDate(end) || end < start) return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง (หรือผ่านไปแล้วทั้งช่วง)" }, { status: 400 });
  if (daysInRange(start, end) > MAX_DAYS) return NextResponse.json({ error: `ให้ AI ร่างได้ครั้งละไม่เกิน ${MAX_DAYS} วัน` }, { status: 400 });
  const perWeek = Math.min(14, Math.max(1, Math.round(Number(body.per_week) || 3)));

  const admin = supabaseAdmin();
  const [{ data: brand }, { data: platRows }, { data: psetRow }, promptRows] = await Promise.all([
    admin.from("brands").select("name").eq("id", brandId).maybeSingle(),
    admin.from("erp_platforms").select("code, name_th, sort_order").order("sort_order"),
    admin.from("ui_config").select("value").eq("key", "creative_platform_settings").maybeSingle(),
    loadPromptRows(),
  ]);
  const pset = ((psetRow as { value?: Record<string, { use_caption?: boolean; use_hashtags?: boolean; note?: string | null }> } | null)?.value ?? {});
  const wanted = new Set((Array.isArray(body.platforms) ? body.platforms : []).map(String));
  const platforms: MassPlatform[] = ((platRows ?? []) as { code: string; name_th: string | null }[])
    .filter((p) => wanted.has(p.code))
    .map((p) => ({ code: p.code, label: p.name_th || p.code, useCaption: pset[p.code]?.use_caption !== false, useHashtags: pset[p.code]?.use_hashtags !== false, note: pset[p.code]?.note ?? null }));
  if (!platforms.length) return NextResponse.json({ error: "เลือกแพลตฟอร์มอย่างน้อย 1 อัน" }, { status: 400 });
  const perPlatform = estimatePostCount(perWeek, start, end);
  if (perPlatform * platforms.length > MAX_ROWS) return NextResponse.json({ error: `ขอเยอะเกินไปสำหรับครั้งเดียว (≈ ${perPlatform * platforms.length} โพสต์) — ลดช่วงวัน/จำนวนต่อสัปดาห์/แพลตฟอร์ม` }, { status: 400 });

  const jobRule = pickJobPrompt(promptRows, brandId, MASS_PLAN_KEY);
  const brief: MassPlanBrief = {
    brandName: (brand as { name?: string } | null)?.name ?? "แบรนด์", start, end, perWeek, platforms,
    pillars: (Array.isArray(body.pillars) ? body.pillars : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 20),
    campaign: str(body.campaign, 1000), specialDays: specialDaysBetween(start, end),
    recommendedTimes: str(body.recommended_times, 300), tone: str(body.tone, 2500),
    extra: [jobRule, str(body.extra, 1000)].filter(Boolean).join("\n"),
  };
  const model = await productDetailModel();
  const context = buildMassPlanContext(brief).join("\n");
  const codes = platforms.map((p) => `${p.code} = ${p.label}`).join(", ");
  const warnings: string[] = [];

  // ── จังหวะ 1: วางตาราง ──
  let plan: PlanPost[] = [];
  try {
    const out = await chatJson(
      "คุณคือนักวางแผนคอนเทนต์โซเชียลมีเดียมืออาชีพ ตอบเป็น JSON ตามรูปแบบที่ขอเท่านั้น",
      [{ type: "text", text: [
        context, "",
        `วันนี้คือ ${thaiDateLabel(today)} — วางตารางโพสต์ในช่วง ${start} ถึง ${end} (ยังไม่ต้องเขียนแคปชั่น)`,
        `ตอบ JSON: {"posts":[{"date":"YYYY-MM-DD","time":"HH:MM","title":"หัวข้อสั้น","pillar":"ชื่อแนวจากรายการ","platforms":["code"],"idea":"ไอเดียรูป/คลิปสั้น ๆ 1 บรรทัด"}]}`,
        `- code ที่ใช้ได้: ${codes}`,
        `- แต่ละแพลตฟอร์มควรได้ราว ${perPlatform} โพสต์ กระจายทั้งช่วง ไม่กองวันเดียว · ลงวันสำคัญให้รับกัน`,
        "- เรื่องเดียวกันที่ลงหลายแพลตฟอร์มในวัน-เวลาเดียวกัน ให้เป็นรายการเดียว (platforms หลายตัว)",
      ].join("\n") }],
      Math.min(12000, 800 + perPlatform * platforms.length * 60), model,
    );
    const valid = new Set(platforms.map((p) => p.code));
    plan = (Array.isArray(out.posts) ? out.posts : []).map((x): PlanPost | null => {
      const o = (x ?? {}) as Record<string, unknown>;
      const date = str(o.date, 10);
      const plats = (Array.isArray(o.platforms) ? o.platforms : []).map(String).filter((c) => valid.has(c));
      if (!isRealDate(date) || date < start || date > end || !plats.length || !str(o.title)) return null;
      return { date, time: normTime(str(o.time, 8)) || "10:00", title: str(o.title, 120), pillar: str(o.pillar, 60), platforms: [...new Set(plats)], idea: str(o.idea, 300) };
    }).filter((p): p is PlanPost => !!p).slice(0, MAX_ROWS);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  if (!plan.length) return NextResponse.json({ error: "AI ตอบกลับมาไม่มีโพสต์ที่ใช้ได้ — ลองกดอีกครั้ง หรือใช้ปุ่ม \"ขอ prompt\" แทน" }, { status: 502 });

  // ── จังหวะ 2: เขียนแคปชั่นทีละแพลตฟอร์มพร้อมกัน ──
  const captions = new Map<string, { caption: string; hashtags: string }>();   // `${index}|${code}`
  let calls = 1;
  await Promise.all(platforms.filter((p) => p.useCaption).map(async (p) => {
    const mine = plan.map((post, i) => ({ post, i })).filter(({ post }) => post.platforms.includes(p.code));
    if (!mine.length) return;
    calls++;
    try {
      const out = await chatJson(
        "คุณคือนักเขียนแคปชั่นโซเชียลมีเดียมืออาชีพ ตอบเป็น JSON ตามรูปแบบที่ขอเท่านั้น",
        [{ type: "text", text: [
          buildMassPlanContext(brief, [p]).join("\n"), "",
          `เขียนแคปชั่น ${p.label} ให้แต่ละโพสต์ (i = ลำดับ):`,
          ...mine.map(({ post, i }) => `${i}) ${thaiDateLabel(post.date)} · ${post.title}${post.pillar ? ` · แนว ${post.pillar}` : ""}${post.idea ? ` · ไอเดีย: ${post.idea}` : ""}`),
          "", `วิธีเขียน ${p.label}: ${platformRule(p)}`,
          `ตอบ JSON: {"captions":[{"i":0,"caption":"ข้อความ (ขึ้นบรรทัดใหม่ได้)","hashtags":["#tag"]}]} · ไม่ต้องใส่แฮชแท็กในแคปชั่น${p.useHashtags ? "" : " · แพลตฟอร์มนี้ไม่ใช้แฮชแท็ก (hashtags = [])"}`,
        ].join("\n") }],
        Math.min(8000, 400 + mine.length * 280), model,
      );
      for (const c of Array.isArray(out.captions) ? out.captions : []) {
        const o = (c ?? {}) as Record<string, unknown>;
        const i = Number(o.i);
        if (!Number.isInteger(i) || !plan[i]?.platforms.includes(p.code)) continue;
        captions.set(`${i}|${p.code}`, { caption: str(o.caption, 5000), hashtags: p.useHashtags ? normalizeHashtags(o.hashtags, 30).join(" ") : "" });
      }
    } catch (e) {
      warnings.push(`เขียนแคปชั่น ${p.label} ไม่สำเร็จ (${(e as Error).message}) — ลงเป็นร่างได้ แล้วให้ AI เขียนทีหลังในลิ้นชักคอนเทนต์`);
    }
  }));

  const rows: MassRawRow[] = plan.flatMap((post, i) => post.platforms.map((code) => {
    const c = captions.get(`${i}|${code}`);
    return { line: i + 1, date: post.date, time: post.time, platform: code, pillar: post.pillar, title: post.title, caption: c?.caption ?? "", hashtags: c?.hashtags ?? "", idea: post.idea };
  }));

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "ai_mass_plan", entityType: "creative_content", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { brand_id: brandId, start, end, per_week: perWeek, platforms: platforms.map((p) => p.code), posts: plan.length, rows: rows.length, calls, model, warnings },
  });
  return NextResponse.json({ rows, posts: plan.length, model, warnings, error: null });
}
