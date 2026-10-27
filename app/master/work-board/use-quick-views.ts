"use client";

/**
 * โหลด/บันทึกมุมมองด่วน 2 ชั้น
 *   👥 ทีม  = ui_config "admin_wb_quick_views" (ทุกคนอ่านได้ · บันทึกได้เฉพาะแอดมิน — เซิร์ฟเวอร์บังคับ admin.users ที่คีย์ admin_*)
 *   👤 ของฉัน = useUserPref("wb_quick_views_mine") — มุมมองส่วนตัว + ปุ่มทีมที่ซ่อน + ความกว้างคอลัมน์ของมุมมองทีม (เฉพาะตัว)
 * กติกา/ชนิดข้อมูล = ./quick-views
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { useToast } from "@/components/toast";
import { QV_DEFAULT_TEAM, QV_MINE_DEFAULT, parseMine, parseTeamViews, type QvMine, type TeamView } from "./quick-views";

const TEAM_KEY = "admin_wb_quick_views";

export function useQuickViews(isAdmin: boolean) {
  const toast = useToast();
  const [team, setTeam] = useState<TeamView[] | null>(null);
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/ui-config?key=${TEAM_KEY}`).then((r) => r.json())
      .then((j) => { if (!cancel) setTeam(parseTeamViews(j?.value) ?? QV_DEFAULT_TEAM); })
      .catch(() => { if (!cancel) setTeam(QV_DEFAULT_TEAM); });
    return () => { cancel = true; };
  }, []);
  const [mine, setMine] = useUserPref<QvMine>("wb_quick_views_mine", QV_MINE_DEFAULT, parseMine);

  /** บันทึกมุมมองของทีม (แอดมิน) — คืน true เมื่อสำเร็จ */
  const saveTeam = useCallback(async (next: TeamView[]): Promise<boolean> => {
    if (!isAdmin) { toast.error("บันทึกมุมมองของทีมได้เฉพาะแอดมิน"); return false; }
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: TEAM_KEY, value: { views: next } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      setTeam(next);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกมุมมองของทีมไม่สำเร็จ"); return false; }
  }, [isAdmin, toast]);

  return { team: team ?? QV_DEFAULT_TEAM, teamLoaded: team !== null, mine, setMine, saveTeam };
}
