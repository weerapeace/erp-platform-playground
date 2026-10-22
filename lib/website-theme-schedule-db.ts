/**
 * ⏰🎪 ตัวทำงานของ "ตั้งเวลาเผยแพร่ธีม" + "ธีมแคมเปญ" (ฝั่งเซิร์ฟเวอร์ · service role) — ฟังก์ชันล้วนอยู่ที่ lib/website-theme-schedule.ts
 *
 * ไม่มี cron: เรียกตอนเว็บร้านดึงค่าเว็บ (ERP site API · ทุก ~60 วิเมื่อมีคนเข้า) และตอนเปิดหน้าดีไซน์ใน ERP
 *   → ถึงเวลาแล้ว = เผยแพร่ภายใน ~1–2 นาที · ไม่มีคนเข้าเว็บ = ยังไม่มีใครเห็นอยู่แล้ว
 * กันเผยแพร่ซ้ำ: "จอง" แถวด้วย update ... where status = 'pending' (คำขอที่จองได้คนเดียวเป็นคนเผยแพร่)
 */
import { normalizeTheme } from "@/lib/website-theme";
import { normalizeBlocks } from "@/lib/website-blocks";
import { writeAudit } from "@/lib/audit";
import { syncCanvasAssetUsages } from "@/lib/website-canvas-usage";
import { SCHEDULE_TABLE, activeCampaign, scheduleFromRow, type ThemeSchedule } from "@/lib/website-theme-schedule";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface DueRow {
  id: string;
  kind: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  theme: unknown;
  layout: unknown;
  look: unknown;
  festive: unknown;
  created_by: string | null;
  created_by_name: string | null;
  note: string | null;
}

/**
 * แถว pending ที่ถึงเวลาแล้วของร้าน (คำขอเดียว): งานเผยแพร่ → เผยแพร่ · แคมเปญที่จบแล้ว → ปิดเป็น done (รายการ pending ไม่บวม)
 * → คืนแคมเปญที่ทำงานอยู่ตอนนี้ (null = ไม่มี)
 */
export async function resolveThemeSchedules(sb: Admin, shopId: string): Promise<{ published: boolean; campaign: ThemeSchedule | null }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from(SCHEDULE_TABLE)
    .select("id, kind, status, starts_at, ends_at, theme, layout, look, festive, created_by, created_by_name, note")
    .eq("shop_id", shopId)
    .eq("status", "pending")
    .lte("starts_at", nowIso)
    .order("starts_at")
    .limit(30);
  if (error) console.error("[theme-schedule] อ่านรายการไม่สำเร็จ:", error.message);
  if (error || !data?.length) return { published: false, campaign: null };
  const rows = data as DueRow[];
  let published = false;
  for (const row of rows.filter((r) => r.kind === "publish")) if (await publishScheduled(sb, shopId, row)) published = true;
  const now = Date.parse(nowIso);
  const camps = rows.filter((r) => r.kind === "campaign");
  const ended = camps.filter((r) => Date.parse(r.ends_at ?? "") <= now).map((r) => r.id);
  if (ended.length) await sb.from(SCHEDULE_TABLE).update({ status: "done", done_at: nowIso, updated_at: nowIso }).in("id", ended).eq("status", "pending");
  const campaign = activeCampaign(camps.filter((r) => !ended.includes(r.id)).map((r) => scheduleFromRow(r as unknown as Record<string, unknown>)), now);
  return { published, campaign };
}

/** เผยแพร่งานที่ตั้งเวลาไว้ 1 งาน (คืน true = เผยแพร่แล้ว) */
async function publishScheduled(sb: Admin, shopId: string, row: DueRow): Promise<boolean> {
  const doneAt = new Date().toISOString();
  const { data: claimed } = await sb.from(SCHEDULE_TABLE).update({ status: "done", done_at: doneAt, updated_at: doneAt }).eq("id", row.id).eq("status", "pending").select("id");
  if (!claimed?.length) return false;
  try {
    const { data: shop } = await sb.from("shops").select("theme_draft, home_layout_draft").eq("id", shopId).maybeSingle();
    const cur = (shop ?? {}) as { theme_draft: unknown; home_layout_draft: unknown };
    const patch: Record<string, unknown> = { theme: row.theme };
    // ร่างที่ค้าง = ชุดเดียวกับที่ตั้งเวลาไว้ → ล้าง · แก้ต่อหลังตั้งเวลา = เก็บร่างไว้ให้แก้ต่อ
    if (cur.theme_draft != null && same(normalizeTheme(cur.theme_draft), normalizeTheme(row.theme))) patch.theme_draft = null;
    const layout = Array.isArray(row.layout) ? normalizeBlocks(row.layout) : null;
    if (layout) {
      patch.home_layout = layout;
      if (cur.home_layout_draft != null && same(normalizeBlocks(cur.home_layout_draft), layout)) patch.home_layout_draft = null;
    }
    const { error } = await sb.from("shops").update(patch).eq("id", shopId);
    if (error) throw error;

    const actorName = `${row.created_by_name ?? "ระบบ"} (ตั้งเวลา)`;
    const { data: last } = await sb.from("store_theme_versions").select("version_no").eq("shop_id", shopId).order("version_no", { ascending: false }).limit(1).maybeSingle();
    const versionNo = Number((last as { version_no: number } | null)?.version_no ?? 0) + 1;
    await sb.from("store_theme_versions").insert({ shop_id: shopId, version_no: versionNo, theme: row.theme });
    let homeVersion: number | null = null;
    if (layout) {
      await syncCanvasAssetUsages(sb, { module: "website_home", recordId: shopId, recordLabel: "หน้าแรกเว็บ", field: "live", blocks: layout });
      if (patch.home_layout_draft === null) await syncCanvasAssetUsages(sb, { module: "website_home", recordId: shopId, recordLabel: "หน้าแรกเว็บ (ร่าง)", field: "draft", blocks: [] });
      const { data: lastHome } = await sb.from("store_home_versions").select("version_no").eq("shop_id", shopId).order("version_no", { ascending: false }).limit(1).maybeSingle();
      homeVersion = Number((lastHome as { version_no: number } | null)?.version_no ?? 0) + 1;
      await sb.from("store_home_versions").insert({ shop_id: shopId, version_no: homeVersion, layout, actor: actorName });
    }
    await sb.from(SCHEDULE_TABLE).update({ version_no: versionNo }).eq("id", row.id);
    await writeAudit(sb, {
      action: "update",
      entityType: "shop_theme",
      entityId: shopId,
      actorId: row.created_by,
      actorName,
      metadata: { version: versionNo, homeVersion, scheduleId: row.id, scheduledAt: row.starts_at, note: row.note || null },
    });
    return true;
  } catch {
    await sb.from(SCHEDULE_TABLE).update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", row.id);
    return false;
  }
}
