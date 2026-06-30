"use client";

// ============================================================
// TeamFill (ของกลางในโมดูลงาน) — เลือก "ทีม" แล้วดึงสมาชิกทีมนั้นมาใส่ผู้รับผิดชอบ
// ใช้คู่กับช่องเลือกผู้รับผิดชอบทุกที่ (แม่แบบงานย่อย / wizard / ในงาน / คอนเทนต์)
// ============================================================

import { useEffect, useState } from "react";
import { listTeams, type Team } from "./data";
import { useT } from "@/components/i18n";

export function TeamFill({ onPick, className }: { onPick: (members: { id: string; name: string }[]) => void; className?: string }) {
  const t = useT();
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => { let live = true; listTeams().then((ts) => { if (live) setTeams(ts); }).catch(() => {}); return () => { live = false; }; }, []);
  if (teams.length === 0) return null;
  return (
    <select value="" title={t("เลือกทีม → ดึงสมาชิกมาใส่ (แก้เพิ่ม/ลบได้ต่อ)", "Pick a team → fill its members (you can still edit)")}
      onChange={(e) => { const tm = teams.find((x) => x.id === e.target.value); if (tm) onPick(tm.members.filter((m) => m.id)); e.currentTarget.value = ""; }}
      className={className ?? "h-8 px-2 text-xs border border-violet-200 rounded-lg text-violet-700 bg-white hover:bg-violet-50 cursor-pointer"}>
      <option value="">👥 {t("เลือกทีม…", "Pick a team…")}</option>
      {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({tm.members.length})</option>)}
    </select>
  );
}
