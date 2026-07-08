"use client";

// ============================================================
// GifPokeLayer — ตัว GIF ที่เพื่อนส่งมา "วิ่งไปมา" บนจอของผู้รับ (เฟส 2)
// - ดึงกล่องรับของฉัน (GET /api/gif-poke) → โชว์สูงสุด 5 ตัว (ที่เหลือรอคิว)
// - ลากขยับได้ (ลากแล้วหยุดวิ่ง อยู่ที่วาง) · คลิก = เปิดข้อความ/คนส่ง · ปุ่มตอบกลับ + ปิด
// - มาใหม่ = เด้งลงมา (gif-poke-drop) + เสียงป๊อป (ปิดได้ในตั้งค่า)
// reuse อนิเมชัน ov-pet-float / ov-bubble-pop · fixed overlay ไม่บังการคลิกหน้า
// ============================================================

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { apiFetch } from "@/lib/api";
import { avatarSrc } from "@/lib/r2-image";
import { useT } from "@/components/i18n";

export type Poke = { id: string; from_user_id: string; from_name: string | null; from_avatar: string | null; gif_url: string | null; gif_key: string | null; message: string | null; created_at: string };

const MAX_ON_SCREEN = 5;
const SIZE = 92;
const MOVE_MS = 6000;   // ย้ายที่ทุก 6 วิ (เลื่อนนุ่ม ๆ)

const rnd = (min: number, max: number) => Math.round((min + Math.random() * (max - min)) * 10) / 10;
// url ภายนอกใช้ตรง · R2 key ผ่าน proxy (ไม่ใส่ w — ย่อจะทำ GIF อนิเมชั่นหาย)
const gifSrc = (p: { gif_url: string | null; gif_key: string | null }): string | null => avatarSrc(p.gif_url || p.gif_key || null);

// เสียงป๊อปสั้น ๆ ด้วย WebAudio (ไม่ต้องมีไฟล์เสียง) — เล่นได้หลัง user คลิกหน้าครั้งแรก
let audioCtx: AudioContext | null = null;
function playPop() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = audioCtx ?? new AC();
    const ctx = audioCtx; const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(620, now); o.frequency.exponentialRampToValueAtTime(1020, now + 0.12);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.14, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 0.27);
  } catch { /* noop */ }
}

export function GifPokeLayer({ userId, onReply }: { userId: string | null; onReply?: (p: Poke) => void }) {
  const t = useT();
  const [pokes, setPokes] = useState<Poke[]>([]);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());   // ตัวที่ลากวางไว้ (หยุดวิ่ง)
  const [dropIds, setDropIds] = useState<Set<string>>(new Set()); // ตัวที่กำลังเล่นอนิเมชั่นเด้ง
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const knownRef = useRef<Set<string>>(new Set());   // id ที่เคยเห็นแล้ว (กันเล่นเสียง/เด้งซ้ำ)
  const firstRef = useRef(true);
  const soundRef = useRef(true);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  // อ่านค่าตั้งค่าเสียง (ปิดได้ในตั้งค่าการรับ)
  useEffect(() => {
    if (!userId) return;
    apiFetch("/api/user-prefs?key=gif_poke_mute").then((r) => r.json())
      .then((j) => { soundRef.current = (j?.value?.sound ?? true) !== false; }).catch(() => { /* noop */ });
  }, [userId]);

  const load = useCallback(() => {
    if (!userId) return;
    apiFetch("/api/gif-poke").then((r) => r.json())
      .then((j) => {
        if (j.error) return;
        const list = (j.data as Poke[]) ?? [];
        // ตรวจตัวที่มาใหม่ → เด้ง + เสียง (ไม่นับรอบโหลดแรก)
        const fresh = list.filter((p) => !knownRef.current.has(p.id)).map((p) => p.id);
        if (fresh.length) {
          setDropIds((prev) => { const n = new Set(prev); fresh.forEach((id) => n.add(id)); return n; });
          if (!firstRef.current && soundRef.current) playPop();
          fresh.forEach((id) => setTimeout(() => setDropIds((prev) => { const n = new Set(prev); n.delete(id); return n; }), 800));
        }
        list.forEach((p) => knownRef.current.add(p.id));
        firstRef.current = false;
        setPokes(list);
      }).catch(() => { /* noop */ });
  }, [userId]);

  useEffect(() => { load(); const id = setInterval(load, 90000); return () => clearInterval(id); }, [load]);

  const shown = pokes.slice(0, MAX_ON_SCREEN);
  const queued = Math.max(0, pokes.length - shown.length);
  const shownKey = shown.map((p) => p.id).join(",");

  // แจกตำแหน่งเริ่มต้นให้ตัวใหม่
  useEffect(() => {
    setPos((prev) => {
      const next = { ...prev };
      for (const p of shown) if (!next[p.id]) next[p.id] = { x: rnd(6, 82), y: rnd(12, 78) };
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  // เดินไปมา — ย้ายทุก MOVE_MS (เว้นตัวที่เปิดอ่าน/ลากค้าง/ปักหมุด)
  useEffect(() => {
    const id = setInterval(() => {
      setPos((prev) => {
        const next = { ...prev };
        for (const p of shown) {
          if (p.id === activeId || p.id === draggingId || pinned.has(p.id)) continue;
          next[p.id] = { x: rnd(6, 82), y: rnd(12, 78) };
        }
        return next;
      });
    }, MOVE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, activeId, draggingId, pinned]);

  const dismiss = (id: string) => {
    setPokes((prev) => prev.filter((p) => p.id !== id));
    setActiveId((a) => (a === id ? null : a));
    apiFetch("/api/gif-poke", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => { /* noop */ });
  };

  // ── ลากขยับ ──
  const onDown = (id: string) => (e: ReactPointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current = { id, moved: false };
  };
  const onMove = (id: string) => (e: ReactPointerEvent) => {
    const d = dragRef.current; if (!d || d.id !== id) return;
    if (!d.moved) { d.moved = true; setDraggingId(id); }
    const x = Math.min(94, Math.max(2, (e.clientX / window.innerWidth) * 100));
    const y = Math.min(90, Math.max(4, (e.clientY / window.innerHeight) * 100));
    setPos((prev) => ({ ...prev, [id]: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } }));
  };
  const onUp = (id: string) => (e: ReactPointerEvent) => {
    const d = dragRef.current; dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (d?.moved) { setPinned((prev) => new Set(prev).add(id)); setDraggingId(null); }   // ลากแล้ว → ปักหมุด (หยุดวิ่ง)
    else setActiveId((a) => (a === id ? null : id));                                       // ไม่ได้ลาก = คลิก
  };

  if (!userId || shown.length === 0) return null;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
      {shown.map((p) => {
        const src = gifSrc(p);
        const pp = pos[p.id] ?? { x: 50, y: 50 };
        const active = p.id === activeId;
        const dragging = p.id === draggingId;
        const av = avatarSrc(p.from_avatar, 48);
        const innerCls = dropIds.has(p.id) ? "gif-poke-drop" : dragging ? "" : "ov-pet-float";
        return (
          <div key={p.id} className="absolute pointer-events-auto" style={{ left: `${pp.x}%`, top: `${pp.y}%`, transition: dragging ? "none" : `left ${MOVE_MS}ms linear, top ${MOVE_MS}ms linear` }}>
            {active && (
              <div className="ov-bubble-pop absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 max-w-[72vw]">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {av ? <img src={av} alt="" className="w-6 h-6 rounded-full object-cover" /> : <span className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-xs">🎁</span>}
                    <span className="text-xs font-semibold text-slate-700 truncate">{p.from_name || t("เพื่อนร่วมงาน", "A colleague")}</span>
                  </div>
                  {p.message && <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{p.message}</p>}
                  <div className="flex gap-1.5 mt-2">
                    {onReply && p.from_user_id && (
                      <button onClick={() => { onReply(p); setActiveId(null); }} className="flex-1 h-8 rounded-lg border border-violet-200 text-violet-700 text-xs font-bold hover:bg-violet-50">{t("↩ ตอบกลับ", "↩ Reply")}</button>
                    )}
                    <button onClick={() => dismiss(p.id)} className="flex-1 h-8 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700">{t("ปิด 💜", "Thanks 💜")}</button>
                  </div>
                </div>
              </div>
            )}
            <button
              onPointerDown={onDown(p.id)} onPointerMove={onMove(p.id)} onPointerUp={onUp(p.id)}
              title={p.from_name ? t(`จาก ${p.from_name} · ลากเพื่อย้าย`, `from ${p.from_name} · drag to move`) : t("ลากเพื่อย้าย", "drag to move")}
              className={`relative block focus:outline-none ${innerCls}`} style={{ width: SIZE, height: SIZE, cursor: "grab", touchAction: "none" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src && <img src={src} alt="" className="w-full h-full object-contain drop-shadow-lg select-none" draggable={false} />}
              {!active && p.message && <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center shadow">💬</span>}
              {pinned.has(p.id) && <span className="absolute -bottom-1 -right-1 text-[11px]">📌</span>}
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
