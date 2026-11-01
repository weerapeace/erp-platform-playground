/**
 * ลงแผนคอนเทนต์แบบ Mass — POST /api/marketing/content-plan/mass
 * body { brand_id, posts: MassCreatePost[] }  (ผ่านหน้าตรวจในป๊อป "วางแผนแบบ Mass" ของปฏิทินมาแล้ว)
 *   → สร้างคอนเทนต์สถานะ draft ทีเดียวหลายชิ้น (1 โพสต์ = 1 คอนเทนต์ หลายแพลตฟอร์ม · แคปชั่นแยกแถวต่อแพลตฟอร์ม)
 * กติกา: ไม่แก้/ไม่ทับคอนเทนต์เดิมเด็ดขาด · ข้ามวันที่ผ่านแล้ว (เวลาไทย) · ข้ามหัวข้อ+วันที่ที่แบรนด์นี้มีอยู่แล้ว (กันกดซ้ำ)
 * สิทธิ์ = tasks.create · audit 1 รายการต่อการลง (เก็บ ids ไว้ตามรอย/ย้อน)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { nextContentNo } from "@/lib/creative-tasks-server";
import { isUuid } from "@/lib/marketing/sku-list";
import { bangkokDateKey, toScheduledIso, dateKeyOf } from "@/lib/marketing/content-plan";
import { MASS_MAX_POSTS, normTime, validateCreatePost, type MassCreatePost } from "@/lib/marketing/mass-plan";

export const dynamic = "force-dynamic";

const squash = (s: string) => String(s ?? "").toLowerCase().replace(/[\s_\-./]/g, "");
const cut = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  let b: { brand_id?: unknown; posts?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(b.brand_id)) return NextResponse.json({ data: null, error: "เลือกแบรนด์ก่อน" }, { status: 400 });
  const brandId = b.brand_id as string;
  const posts = Array.isArray(b.posts) ? (b.posts as Partial<MassCreatePost>[]) : [];
  if (!posts.length) return NextResponse.json({ data: null, error: "ไม่มีโพสต์ที่จะลง" }, { status: 400 });
  if (posts.length > MASS_MAX_POSTS) return NextResponse.json({ data: null, error: `ลงได้ครั้งละไม่เกิน ${MASS_MAX_POSTS} โพสต์ (ส่งมา ${posts.length}) — แบ่งเป็นช่วง ๆ` }, { status: 400 });

  const admin = supabaseAdmin();
  const [{ data: platRows, error: pErr }, { data: psetRow }] = await Promise.all([
    admin.from("erp_platforms").select("code"),
    admin.from("ui_config").select("value").eq("key", "creative_platform_settings").maybeSingle(),
  ]);
  if (pErr) return NextResponse.json({ data: null, error: "โหลดรายชื่อแพลตฟอร์มไม่สำเร็จ: " + pErr.message }, { status: 500 });
  const validPlatforms = new Set(((platRows ?? []) as { code: string }[]).map((r) => r.code));
  const pset = ((psetRow as { value?: Record<string, { template_key?: string | null }> } | null)?.value ?? {});

  // ตรวจทีละโพสต์ (กันข้อมูลที่ไม่ได้ผ่านหน้าตรวจ)
  const today = bangkokDateKey(new Date());
  const skipped: { title: string; date: string; reason: string }[] = [];
  const valid: MassCreatePost[] = [];
  for (const p of posts) {
    const why = validateCreatePost(p, today, validPlatforms);
    if (why) { skipped.push({ title: cut(p?.title, 80), date: cut(p?.date, 10), reason: why }); continue; }
    valid.push(p as MassCreatePost);
  }

  // ของเดิมของแบรนด์ในช่วงนี้ → หัวข้อ+วันซ้ำ = ข้าม (กดลงซ้ำ/ลงชุดเดิมสองรอบ)
  if (valid.length) {
    const dates = valid.map((p) => p.date).sort();
    const { data: exist, error: eErr } = await admin.from("erp_creative_content").select("title, scheduled_at")
      .eq("brand_id", brandId).eq("is_active", true).neq("status", "cancelled")
      .gte("scheduled_at", toScheduledIso(dates[0], "00:00")).lte("scheduled_at", toScheduledIso(dates[dates.length - 1], "23:59"));
    if (eErr) return NextResponse.json({ data: null, error: "ตรวจของเดิมไม่สำเร็จ: " + eErr.message }, { status: 500 });
    const taken = new Set(((exist ?? []) as { title: string; scheduled_at: string | null }[]).map((r) => `${dateKeyOf(r.scheduled_at)}|${squash(r.title)}`));
    for (let i = valid.length - 1; i >= 0; i--) {
      const k = `${valid[i].date}|${squash(valid[i].title)}`;
      if (taken.has(k)) { skipped.push({ title: valid[i].title, date: valid[i].date, reason: "มีหัวข้อนี้ในวันนี้อยู่แล้ว" }); valid.splice(i, 1); }
      else taken.add(k);   // หัวข้อซ้ำกันเองในชุดเดียว = ลงแค่อันแรก
    }
  }
  if (!valid.length) return NextResponse.json({ data: { created: 0, ids: [], content_nos: [], skipped }, error: null });

  // สร้างจริง: เลขเอกสารเรียงต่อกัน · ชนเลข (มีคนสร้างพร้อมกัน) → ขอเลขใหม่แล้วลองอีกครั้ง (แบบเดียวกับสร้างแผนจากสล็อต)
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const rowsFrom = (firstNo: string) => {
    const prefix = firstNo.slice(0, firstNo.lastIndexOf("-") + 1);
    const start = parseInt(firstNo.slice(prefix.length), 10) || 1;
    return valid.map((p, i) => {
      const platforms = [...new Set(p.captions.map((c) => String(c.platform)))];
      const formats = Object.fromEntries(Object.entries(p.platform_formats ?? {}).filter(([k, v]) => platforms.includes(k) && typeof v === "string"));
      return {
        content_no: `${prefix}${String(start + i).padStart(4, "0")}`, title: cut(p.title, 200), brand_id: brandId,
        platforms, platform_formats: formats, pillar_id: isUuid(p.pillar_id) ? p.pillar_id : null, brief: cut(p.brief, 2000) || null,
        status: "draft", scheduled_at: toScheduledIso(p.date, normTime(p.time)), is_template: false, created_by: user?.id ?? null,
      };
    });
  };
  let rows = rowsFrom(await nextContentNo(admin));
  let { data: created, error } = await admin.from("erp_creative_content").insert(rows).select("id, content_no");
  if (error && /duplicate|unique/i.test(error.message)) {
    rows = rowsFrom(await nextContentNo(admin));
    ({ data: created, error } = await admin.from("erp_creative_content").insert(rows).select("id, content_no"));
  }
  if (error || !created) return NextResponse.json({ data: null, error: "ลงแผนไม่สำเร็จ: " + (error?.message ?? "ไม่ทราบสาเหตุ") }, { status: 500 });

  // แคปชั่นแยกแถวต่อแพลตฟอร์ม — ลงเฉพาะที่มีข้อความ/แฮชแท็ก (แพลตฟอร์มที่ว่าง ลิ้นชักคอนเทนต์สร้างการ์ดเปล่าให้เอง)
  const createdRows = created as { id: string; content_no: string }[];
  const idByNo = new Map(createdRows.map((r) => [r.content_no, r.id]));
  const caps = valid.flatMap((p, i) => {
    const contentId = idByNo.get(rows[i].content_no);
    if (!contentId) return [];
    return p.captions
      .filter((c) => String(c.caption ?? "").trim() || String(c.hashtags ?? "").trim())
      .map((c, j) => ({
        content_id: contentId, platform: String(c.platform), caption: cut(c.caption, 6000) || null, hashtags: cut(c.hashtags, 1000) || null,
        caption_type: pset[String(c.platform)]?.template_key || "short", sort_order: j,
      }));
  });
  let captionError: string | null = null;
  if (caps.length) {
    const { error: cErr } = await admin.from("erp_creative_content_captions").insert(caps);
    if (cErr) captionError = "ลงคอนเทนต์แล้ว แต่บันทึกแคปชั่นไม่สำเร็จ: " + cErr.message;
  }

  const ids = createdRows.map((r) => r.id);
  await writeAudit(admin, {
    action: "marketing.plan.mass_import", entityType: "creative_content", entityId: ids[0] ?? null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { brand_id: brandId, created: ids.length, captions: caps.length, ids, content_nos: createdRows.map((r) => r.content_no), skipped },
  });
  return NextResponse.json({ data: { created: ids.length, ids, content_nos: createdRows.map((r) => r.content_no), skipped, caption_error: captionError }, error: null });
}
