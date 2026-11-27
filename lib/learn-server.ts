/**
 * 🎓 ศูนย์เรียนรู้ — ตัวช่วยฝั่งเซิร์ฟเวอร์ (ใช้ใน /api/learn/*)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { animLabel, cleanAnimation } from "@/lib/lesson-anim";
import { LESSON_COLS, STEP_COLS, type Lesson, type LessonStep } from "@/lib/learn";

/** ขั้นตอน → แถวที่บันทึก */
export function stepRows(guideId: string, steps: LessonStep[]) {
  return steps.map((s, i) => ({
    guide_id: guideId, step_no: i + 1, sort_order: i,
    title: s.title, body: s.body, image_r2_key: s.image_r2_key, link_url: s.link_url,
    video_url: s.video_url, video_start_sec: s.video_start_sec, video_r2_key: s.video_r2_key, checklist: s.checklist, animation: s.animation,
  }));
}

/** อ่านขั้นตอนของหลายบทเรียน แล้วประกอบเป็น Lesson[] */
export async function attachSteps(rows: Omit<Lesson, "steps">[]): Promise<Lesson[]> {
  const ids = rows.map((r) => r.id);
  const by = new Map<string, LessonStep[]>();
  if (ids.length) {
    const { data } = await supabaseAdmin().from("erp_help_guide_steps").select(STEP_COLS).in("guide_id", ids)
      .order("sort_order", { ascending: true }).order("step_no", { ascending: true });
    for (const s of (data ?? []) as unknown as (LessonStep & { guide_id: string })[]) {
      const { guide_id, ...rest } = s;
      const a = by.get(guide_id) ?? [];
      a.push({ ...rest, checklist: Array.isArray(rest.checklist) ? rest.checklist : [], animation: cleanAnimation(rest.animation) });
      by.set(guide_id, a);
    }
  }
  return rows.map((r) => ({ ...r, steps: by.get(r.id) ?? [] }));
}

/** บทเรียนเดียว (รวมที่อยู่ในถังขยะ) · ไม่ใช่บทเรียน = null */
export async function loadLesson(id: string): Promise<Lesson | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin().from("erp_help_guides").select(LESSON_COLS).eq("id", id).eq("kind", "lesson").maybeSingle();
  if (!data) return null;
  const [l] = await attachSteps([data as unknown as Omit<Lesson, "steps">]);
  return l;
}

/** ขั้นตอนแบบย่อสำหรับเทียบ audit (ก่อน/หลัง) */
export function stepsDigest(steps: LessonStep[]): string[] {
  return steps.map((s, i) => `${i + 1}. ${s.title}${s.video_url ? " [คลิป]" : ""}${s.video_r2_key ? " [คลิปอัป]" : ""}${s.image_r2_key ? " [รูป]" : ""}${s.checklist.length ? ` [เช็กลิสต์ ${s.checklist.length}]` : ""}${s.animation ? ` [ภาพเคลื่อนไหว: ${animLabel(s.animation)}]` : ""}`);
}
