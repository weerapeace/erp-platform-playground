"use client";

// หน้า "รางวัล & เกม" (เฟส 1 mock) — เหรียญ/เลเวล/ตรารางวัล/ร้านแลกรางวัล/กระดานทีม
import Link from "next/link";
import { useMemo } from "react";
import { useToast } from "@/components/toast";
import { usePlayer, levelFromXp, redeem, REWARDS, TEAMMATES, type Reward } from "../player-store";
import { MOCK_GOALS } from "../mock-data";

export default function RewardsPage() {
  const p = usePlayer();
  const toast = useToast();
  const lv = levelFromXp(p.xp);
  const pct = lv.span > 0 ? Math.min(100, Math.round((lv.into / lv.span) * 100)) : 100;

  const badges = useMemo(() => {
    const anyAchieved = MOCK_GOALS.some((g) => g.status === "achieved");
    return [
      { icon: "🏆", label: "เป้าแรกสำเร็จ", desc: "ทำเป้าหมายสำเร็จครั้งแรก", earned: anyAchieved },
      { icon: "🪙", label: "นักสะสม 100", desc: "สะสมแต้มรวม 100", earned: p.xp >= 100 },
      { icon: "💎", label: "นักสะสม 500", desc: "สะสมแต้มรวม 500", earned: p.xp >= 500 },
      { icon: "🔥", label: "ต่อเนื่อง 7 วัน", desc: "อัปเดต/ทำงานต่อเนื่อง 7 วัน", earned: p.streakDays >= 7 },
      { icon: "⚡", label: "ต่อเนื่อง 30 วัน", desc: "ต่อเนื่องไม่ขาด 30 วัน", earned: p.streakDays >= 30 },
      { icon: "🎁", label: "แลกรางวัลแรก", desc: "แลกรางวัลครั้งแรก", earned: p.redeemed.length > 0 },
    ];
  }, [p.xp, p.streakDays, p.redeemed.length]);

  const board = useMemo(() => {
    const rows = [...TEAMMATES, { name: "คุณ", coins: p.coins, xp: p.xp }];
    return rows.sort((a, b) => b.coins - a.coins);
  }, [p.coins, p.xp]);

  function handleRedeem(r: Reward) {
    if (p.coins < r.cost) { toast.error(`เหรียญไม่พอ — ขาดอีก ${r.cost - p.coins} เหรียญ`); return; }
    if (redeem(r)) toast.success(`แลก “${r.label}” สำเร็จ! 🎉`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <Link href="/goals" className="text-sm text-slate-500 hover:text-violet-600 inline-flex items-center gap-1 mb-3">← กลับไปเป้าหมาย</Link>
      <h1 className="text-xl font-bold text-slate-900 mb-4">🎮 รางวัล & เกม</h1>

      {/* การ์ดเลเวล + เหรียญ + streak */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-violet-100 text-violet-700 border-2 border-violet-400 flex items-center justify-center text-xl font-bold">{lv.level}</div>
          <div>
            <div className="font-semibold text-slate-900">เลเวล {lv.level} · {lv.title}</div>
            <div className="w-40 h-2 bg-slate-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} /></div>
            <div className="text-xs text-slate-400 mt-1">{lv.isMax ? "เลเวลสูงสุดแล้ว!" : `อีก ${lv.toNext} XP ถึงเลเวล ${lv.level + 1}`}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-4 py-2.5">
          <span className="text-2xl">🪙</span>
          <div><div className="text-2xl font-bold leading-none">{p.coins}</div><div className="text-xs">เหรียญคงเหลือ</div></div>
        </div>
        <div className="flex items-center gap-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl px-4 py-2.5">
          <span className="text-2xl">🔥</span>
          <div><div className="text-2xl font-bold leading-none">{p.streakDays}</div><div className="text-xs">วันต่อเนื่อง</div></div>
        </div>
      </div>

      {/* ตรารางวัล */}
      <section className="mt-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">🏅 ตรารางวัล</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {badges.map((b) => (
            <div key={b.label} title={b.desc} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center ${b.earned ? "bg-white border-slate-200" : "bg-slate-50 border-dashed border-slate-200 opacity-55"}`}>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl ${b.earned ? "" : "grayscale"}`}>{b.earned ? b.icon : "🔒"}</div>
              <div className="text-[11px] leading-tight text-slate-600">{b.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ร้านแลกรางวัล */}
      <section className="mt-5">
        <h2 className="text-base font-semibold text-slate-900 mb-1">🛍️ ร้านแลกรางวัล</h2>
        <p className="text-xs text-slate-400 mb-3">ใช้เหรียญที่สะสมแลกของรางวัลจริง (รายการตัวอย่าง — เฟส 2 แอดมินตั้งเองได้)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {REWARDS.map((r) => {
            const can = p.coins >= r.cost;
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="text-3xl flex-shrink-0">{r.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">{r.label}</div>
                  <div className="text-xs text-slate-400">{r.desc}</div>
                </div>
                <button
                  onClick={() => handleRedeem(r)}
                  className={`flex-shrink-0 h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${can ? "text-amber-700 border-amber-300 hover:bg-amber-50" : "text-slate-400 border-slate-200 cursor-not-allowed"}`}
                >
                  🪙 {r.cost}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* กระดานทีม */}
      <section className="mt-5">
        <h2 className="text-base font-semibold text-slate-900 mb-1">👥 กระดานทีม</h2>
        <p className="text-xs text-slate-400 mb-3">ให้กำลังใจกัน ไม่ใช่แข่งกดดัน — ทุกคนไปถึงเป้าของตัวเองคือชนะ</p>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {board.map((row, i) => {
            const me = row.name === "คุณ";
            return (
              <div key={row.name} className={`flex items-center gap-3 px-4 py-2.5 ${me ? "bg-violet-50/50" : ""}`}>
                <div className={`w-6 text-center font-bold ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>{i === 0 ? "👑" : i + 1}</div>
                <div className={`flex-1 text-sm ${me ? "font-semibold text-violet-700" : "text-slate-700"}`}>{row.name}{me && " (คุณ)"}</div>
                <div className="text-xs text-slate-400">Lv.{levelFromXp(row.xp).level}</div>
                <div className="flex items-center gap-1 text-sm font-medium text-amber-700 w-16 justify-end">🪙 {row.coins}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ประวัติได้เหรียญ */}
      {p.earnLog.length > 0 && (
        <section className="mt-5">
          <h2 className="text-base font-semibold text-slate-900 mb-3">📜 ประวัติได้เหรียญ</h2>
          <div className="space-y-1.5">
            {p.earnLog.slice(0, 12).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm bg-white border border-slate-100 rounded-lg px-3 py-2">
                <span className="text-slate-600">{e.reason}</span>
                <span className="text-amber-700 font-medium flex-shrink-0 ml-2">🪙 +{e.coins}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
