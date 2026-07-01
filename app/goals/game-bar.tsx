"use client";

// แถบเกมบนหัวแอป — เหรียญ + เลเวล/XP + streak (คลิกไปหน้ารางวัล)
import Link from "next/link";
import { usePlayer, levelFromXp } from "./player-store";

export function GameBar({ compact = false }: { compact?: boolean }) {
  const p = usePlayer();
  const lv = levelFromXp(p.xp);
  const pct = lv.span > 0 ? Math.min(100, Math.round((lv.into / lv.span) * 100)) : 100;

  return (
    <Link
      href="/goals/rewards"
      className="inline-flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2 hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
      title="ดูรางวัล เลเวล และกระดานทีม"
    >
      {/* เลเวล */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 border-2 border-violet-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {lv.level}
        </div>
        {!compact && (
          <div className="leading-tight">
            <div className="text-xs font-medium text-slate-700">{lv.title}</div>
            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-0.5">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* เหรียญ */}
      <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">
        <span className="text-base leading-none">🪙</span>
        <span className="text-sm font-bold">{p.coins}</span>
      </div>

      {/* streak */}
      {p.streakDays > 0 && !compact && (
        <div className="hidden sm:flex items-center gap-1 text-orange-600 text-xs font-medium">
          🔥 {p.streakDays} วัน
        </div>
      )}
    </Link>
  );
}
