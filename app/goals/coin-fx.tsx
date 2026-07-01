"use client";

// เอฟเฟกต์ "เหรียญเด้ง" ตอนได้แต้ม — ใช้คู่กับ awardCoins()
// const { fx, burst } = useCoinFx();  → วาง {fx} ในหน้า, เรียก burst(5, "เหตุผล")
import { useState, useCallback } from "react";

export function useCoinFx() {
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);

  const burst = useCallback((coins: number, reason: string) => {
    const id = Date.now() + Math.random();
    setPops((p) => [...p, { id, text: `+${coins} 🪙 ${reason}` }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 2200);
  }, []);

  const fx = (
    <div className="fixed left-1/2 -translate-x-1/2 top-20 z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {pops.map((p) => (
        <div key={p.id} className="coin-pop bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
          {p.text}
        </div>
      ))}
      <style>{`@keyframes coinPop{0%{opacity:0;transform:translateY(12px) scale(.8)}15%{opacity:1;transform:translateY(0) scale(1.06)}30%{transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:translateY(-16px)}}.coin-pop{animation:coinPop 2.2s ease forwards}`}</style>
    </div>
  );

  return { fx, burst };
}
