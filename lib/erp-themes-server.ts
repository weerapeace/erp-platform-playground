// ตัวช่วยฝั่ง API ของคลังธีม (server only) — app/api/themes/*
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type ThemeRow = {
  id: string; name: string; description: string | null; preset_key: string | null;
  draft_config: Record<string, unknown>; published_config: Record<string, unknown> | null;
  published_version: number; published_at: string | null; published_by_name: string | null;
  deleted_at: string | null; created_by_name: string | null; updated_by_name: string | null;
  created_at: string; updated_at: string;
};

export const THEME_COLS =
  "id,name,description,preset_key,draft_config,published_config,published_version,published_at,published_by_name,deleted_at,created_by_name,updated_by_name,created_at,updated_at";

/** ผู้ใช้ที่เรียก (id + ชื่อโชว์) — ไม่ล็อกอิน = null */
export async function themeActor(request: Request): Promise<{ id: string; name: string } | null> {
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return null;
    const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
    return { id: user.id, name: meta.full_name || meta.name || user.email || "ไม่ทราบชื่อ" };
  } catch { return null; }
}

/** ร่างต่างจากฉบับเผยแพร่ไหม (ไว้โชว์ป้าย "มีร่างยังไม่เผยแพร่") */
export function hasUnpublished(row: Pick<ThemeRow, "draft_config" | "published_config">): boolean {
  return JSON.stringify(row.draft_config ?? {}) !== JSON.stringify(row.published_config ?? null);
}
