"use client";

/**
 * 📚↔📐 ซิงค์สูตร Design Library กลับเข้าใบงานที่ผูกไว้ (เจ้าของเลือกข้อ 2 · 2026-11-23)
 *  • ใช้ API เดิม /api/design-library/send-to-sheet แบบ attach (ไม่ลบของเดิมในใบ · รูปที่แนบแล้วข้าม · หน้าชื่อเดียวกัน = แทน · ตารางสีรวม)
 *  • ไม่ส่งตีราคา (cost) — ตัวนั้น "ต่อท้าย" ทุกครั้ง ซิงค์อัตโนมัติจะทำบรรทัดซ้ำ · ตีราคาส่งเองจากป๊อป "ส่งเป็นใบงาน" ในหน้าสูตร
 *  • autoSyncSheet(): เรียกหลังบันทึกสูตร / ติดดาวหรือเพิ่มรูปผล — หน่วง 1.5 วิ รวมหลายครั้งเป็นครั้งเดียว · พลาด = เงียบ (ปุ่ม "ดึงกลับตอนนี้" ในใบงานยังใช้ได้)
 */
import { apiFetch } from "@/lib/api";

export type PushResult = { ok: boolean; summary?: string; error?: string };

/** expect = ใบงานที่สูตรผูกอยู่ตอนนี้ (กันส่งทับตอนมีคนเปลี่ยนการเชื่อม) · ผูกใหม่หลังยกเลิกการเชื่อม = ส่ง null */
export async function pushRecipeToSheet(recipeId: string, sheetId: string, include: { images?: boolean; spec?: boolean; colors?: boolean } = {}, expect: string | null = sheetId): Promise<PushResult> {
  try {
    const r = await apiFetch("/api/design-library/send-to-sheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: recipeId, mode: "attach", sheet_id: sheetId, expect_sheet_id: expect,
        include: { images: include.images !== false, spec: include.spec !== false, colors: include.colors !== false, cost: false } }),
    });
    const j = await r.json().catch(() => null) as { data?: { counts?: Record<string, number>; warnings?: string[] }; error?: string } | null;
    if (!r.ok || j?.error) return { ok: false, error: j?.error ?? undefined };
    const c = j?.data?.counts ?? {};
    const bits = [c.images ? `รูป ${c.images}` : "", c.spec ? "หน้ารายละเอียดงาน" : "", c.colors ? `ชุดสี ${c.colors}` : ""].filter(Boolean);
    return { ok: true, summary: bits.length ? `ดึงจาก Design Library แล้ว · ${bits.join(" · ")}` : "ใบงานตรงกับสูตรแล้ว" };
  } catch { return { ok: false }; }
}

const timers = new Map<string, number>();
/** เรียกหลังบันทึกสูตร/รูปผลเปลี่ยน — มีใบงานผูกอยู่เท่านั้น · หน่วงรวมครั้ง */
export function autoSyncSheet(recipeId: string, sheetId: string | null | undefined, onDone?: (r: PushResult) => void) {
  if (!sheetId || typeof window === "undefined") return;
  const k = `${recipeId}:${sheetId}`;
  const old = timers.get(k); if (old) window.clearTimeout(old);
  timers.set(k, window.setTimeout(() => { timers.delete(k); void pushRecipeToSheet(recipeId, sheetId).then((r) => onDone?.(r)); }, 1500));
}
