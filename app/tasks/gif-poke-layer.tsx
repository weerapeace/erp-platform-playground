"use client";

// ============================================================
// GifPokeLayer — ตัว GIF ที่เพื่อนส่งมา "วิ่งไปมา" บนจอของผู้รับ
// ดึงกล่องรับของฉัน (GET /api/gif-poke) → โชว์สูงสุด 5 ตัว (ที่เหลือรอคิว)
// คลิกตัว → เห็นคนส่ง + ข้อความ → กดปิด (dismiss) แล้วหาย ตัวถัดไปในคิวขึ้นแทน
// reuse อนิเมชัน ov-pet-float / ov-bubble-pop (มีอยู่แล้ว) · fixed overlay ไม่บังการคลิกหน้า
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { avatarSrc } from "@/lib/r2-image";
import { useT } from "@/components/i18n";

type Poke = { id: string; from_name: string | null; from_avatar: string | null; gif_url: string | null; gif_key: string | null; message: string | null; created_at: string };

// url ภายนอกใช้ตรง · R2 key ผ่าน proxy (ไม่ใส่ w — ย่อจะทำ GIF อนิเมชั่นหาย)
const gifSrc = (p: { gif_url: string | null; gif_key: string | null }): string | null => avatarSrc(p.gif_url || p.gif_key || null);

const MAX_ON_SCREEN = 5;
const SIZE = 92;
const MOVE_MS = 6000;   // ย้ายที่ทุก 6 วิ (เลื่อนนุ่ม ๆ)

const rnd = (min: number, max: number) => Math.round((min + Math.random() * (max - min)) * 10) / 10;

export function GifPokeLayer({ userId }: { userId: string | null }) {
  const t = useT();
  const [pokes, setPokes] = useState<Poke[]>([]);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    apiFetch("/api/gif-poke").then((r) => r.json())
      .then((j) => { if (!j.error) setPokes((j.data as Poke[]) ?? []); })
      .catch(() => { /* noop */ });
  }, [userId]);

  useEffect(() => { load(); const id = setInterval(load, 90000); return () => clearInterval(id); }, [load]);

  const shown = pokes.slice(0, MAX_ON_SCREEN);
  const queued = Math.max(0, pokes.length - shown.length);
  const shownKey = shown.map((p) => p.id).join(",");

  // แจกตำแหน่งเริ่มต้นให้ตัวใหม่ (เก็บของเดิมไว้)
  useEffect(() => {
    setPos((prev) => {
      const next = { ...prev };
      for (const p of shown) if (!next[p.id]) next[p.id] = { x: rnd(6, 82), y: rnd(12, 78) };
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  // เดินไปมา — ย้ายทุก MOVE_MS (เว้นตัวที่กำลังเปิดอ่านข้อความ)
  useEffect(() => {
    const id = setInterval(() => {
      setPos((prev) => {
        const next = { ...prev };
        for (const p of shown) if (p.id !== activeId) next[p.id] = { x: rnd(6, 82), y: rnd(12, 78) };
        return next;
      });
    }, MOVE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, activeId]);

  const dismiss = (id: string) => {
    setPokes((prev) => prev.filter((p) => p.id !== id));
    setActiveId((a) => (a === id ? null : a));
    apiFetch("/api/gif-poke", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => { /* noop */ });
  };

  if (!userId || shown.length === 0) return null;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
      {shown.map((p) => {
        const src = gifSrc(p);
        const pp = pos[p.id] ?? { x: 50, y: 50 };
        const active = p.id === activeId;
        const av = avatarSrc(p.from_avatar, 48);
        return (
          <div key={p.id} className="absolute pointer-events-auto" style={{ left: `${pp.x}%`, top: `${pp.y}%`, transition: `left ${MOVE_MS}ms linear, top ${MOVE_MS}ms linear` }}>
            {active && (
              <div className="ov-bubble-pop absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 max-w-[72vw]">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {av ? <img src={av} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-xs">🎁</span>}
                    <span className="text-xs font-semibold text-slate-700 truncate">{p.from_name || t("เพื่อนร่วมงาน", "A colleague")}</span>
                  </div>
                  {p.message && <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{p.message}</p>}
                  <button onClick={() => dismiss(p.id)} className="mt-2 w-full h-8 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700">{t("ปิด / ขอบคุณ 💜", "Thanks 💜")}</button>
                </div>
              </div>
            )}
            <button onClick={() => setActiveId((a) => (a === p.id ? null : p.id))}
              title={p.from_name ? t(`จาก ${p.from_name}`, `from ${p.from_name}`) : "GIF"}
              className="relative block ov-pet-float focus:outline-none" style={{ width: SIZE, height: SIZE }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src && <img src={src} alt="" className="w-full h-full object-contain drop-shadow-lg select-none" draggable={false} />}
              {!active && p.message && <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center shadow">💬</span>}
            </button>
          </div>
        );
      })}
      {queued > 0 && (
        <div className="absolute bottom-3 left-3 bg-violet-600/90 text-white text-xs font-medium rounded-full px-2.5 py-1 shadow">🎁 +{queued} {t("รออยู่", "waiting")}</div>
      )}
    </div>
  );
}
