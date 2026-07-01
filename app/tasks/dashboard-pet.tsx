"use client";

// ============================================================
// DashboardPet — ตัวการ์ตูนลอยมุมแถบทักทาย ทำหน้าที่ "แจ้งเตือนงาน"
// ใช้ข้อมูลที่หน้า dashboard มีอยู่แล้ว (เกินกำหนด/รอตรวจ/ครบกำหนดวันนี้/งานใหม่) — ไม่ต่อ backend ใหม่
// แต่งได้: มุมที่ลอย / ขนาด / ข้อความตอนเคลียร์งาน / หน้าตามอารมณ์ (สบายดี↔ตกใจ เมื่อไม่มี GIF)
// notify=false → กลับไปเป็นรูปลอยเฉย ๆ แบบเดิม · "งานใหม่" นับจากเวลาเข้าครั้งล่าสุด (localStorage)
// ============================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import type { PetConfig, PetCorner } from "./overview-customizer";

// โหลด lottie-react เฉพาะตอนใช้จริง (กันบันเดิลบวมในหน้าที่ไม่มี Lottie)
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

// เล่น Lottie จาก data ตรง ๆ (เก็บในธีม) หรือ fetch จาก URL — ล้มเหลว/กำลังโหลด → โชว์ fallback (ไม่ค้าง ⏳)
function LottiePet({ data, src, size, animCls, fallback }: { data?: unknown; src?: string | null; size: number; animCls: string; fallback: ReactNode }) {
  const [fetched, setFetched] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (data || !src) return;
    let live = true; setFailed(false); setFetched(null);
    fetch(src).then((r) => r.json()).then((j) => { if (live) setFetched(j as Record<string, unknown>); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [data, src]);
  const anim = (data as Record<string, unknown> | undefined) ?? fetched ?? undefined;
  if (!anim || failed) return <>{fallback}</>;
  return (
    <div style={{ width: size, height: size }} className={`drop-shadow-lg ${animCls}`}>
      <Lottie animationData={anim} loop autoplay style={{ width: size, height: size }} />
    </div>
  );
}

// ลิงก์ภายนอกใช้ตรง · ไม่งั้นถือเป็น R2 key → ผ่าน proxy
function lottieSrcOf(v: string | null): string | null {
  if (!v) return null;
  return /^https?:/i.test(v) ? v : `/api/r2-image?key=${encodeURIComponent(v)}`;
}

// หลายรูป (เฟรมอนิเมชั่น) — สลับรูปวนไปเรื่อย ๆ ให้เหมือนขยับ
function FramePet({ frames, size, intervalMs, animCls }: { frames: string[]; size: number; intervalMs: number; animCls: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const id = setInterval(() => setI((p) => (p + 1) % frames.length), Math.max(80, intervalMs));
    return () => clearInterval(id);
  }, [frames.length, intervalMs]);
  const key = frames[Math.min(i, frames.length - 1)] ?? frames[0];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/r2-image?key=${encodeURIComponent(key)}&w=200`} alt="" style={{ width: size, height: size }} className={`object-contain drop-shadow-lg ${animCls}`} draggable={false} />
  );
}

const SEEN_KEY = "tasks_pet_seen";   // เวลาเข้าหน้าครั้งล่าสุด (กันให้ "งานใหม่" นับเฉพาะของใหม่จริง ๆ)
export type PetAlertKind = "overdue" | "review" | "dueToday" | "new";
export type PetData = { overdue: number; review: number; dueToday: number; myTaskDates: string[] };

// ตำแหน่งตามมุมที่เลือก — บอกตำแหน่ง absolute, การจัดชิด, และฟองคำพูดอยู่บน/ล่าง PET
const CORNER: Record<PetCorner, { pos: string; items: string; isTop: boolean; isLeft: boolean }> = {
  br: { pos: "bottom-1 right-3", items: "items-end", isTop: false, isLeft: false },
  bl: { pos: "bottom-1 left-3", items: "items-start", isTop: false, isLeft: true },
  tr: { pos: "top-1 right-3", items: "items-end", isTop: true, isLeft: false },
  tl: { pos: "top-1 left-3", items: "items-start", isTop: true, isLeft: true },
};

export function DashboardPet({ petUrl, lottieUrl, lottieData, frames, cfg, data, onAlert }: {
  petUrl: string | null;
  lottieUrl?: string | null;
  lottieData?: unknown;
  frames?: string[] | null;
  cfg: PetConfig;
  data: PetData;
  onAlert: (kind: PetAlertKind) => void;
}) {
  const t = useT();
  const [seen, setSeen] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [chat, setChat] = useState<string | null>(null);   // ข้อความคุยเล่น (พูดเป็นระยะ)

  // ครั้งแรกสุด: ตั้ง lastSeen = ตอนนี้ (ไม่งั้นงานเก่าทั้งหมดจะถูกนับเป็น "งานใหม่")
  useEffect(() => {
    try {
      const v = localStorage.getItem(SEEN_KEY);
      if (v) setSeen(v);
      else { const now = new Date().toISOString(); localStorage.setItem(SEEN_KEY, now); setSeen(now); }
    } catch { setSeen(new Date().toISOString()); }
  }, []);

  const newCount = useMemo(() => {
    if (!cfg.newTasks || !seen) return 0;
    return data.myTaskDates.filter((d) => d && d > seen).length;
  }, [cfg.newTasks, seen, data.myTaskDates]);

  // รายการเตือนตามที่เปิดไว้ + มีจำนวนจริง
  const alerts = useMemo(() => {
    const a: { kind: PetAlertKind; icon: string; text: string; n: number }[] = [];
    if (cfg.overdue && data.overdue > 0) a.push({ kind: "overdue", icon: "⚠️", text: t(`เกินกำหนด ${data.overdue} งาน!`, `${data.overdue} overdue!`), n: data.overdue });
    if (cfg.dueToday && data.dueToday > 0) a.push({ kind: "dueToday", icon: "⏰", text: t(`ครบกำหนดวันนี้ ${data.dueToday} งาน`, `${data.dueToday} due today`), n: data.dueToday });
    if (cfg.review && data.review > 0) a.push({ kind: "review", icon: "🟡", text: t(`รอตรวจ ${data.review} งาน`, `${data.review} to review`), n: data.review });
    if (cfg.newTasks && newCount > 0) a.push({ kind: "new", icon: "✨", text: t(`งานใหม่ ${newCount} งาน`, `${newCount} new`), n: newCount });
    return a;
  }, [cfg, data, newCount, t]);

  const total = alerts.reduce((s, a) => s + a.n, 0);
  const hasAlert = alerts.length > 0;

  // ข้อความที่ PET พูดเล่น (พูดเป็นระยะเมื่อไม่มีงานด่วน) — บรรทัดละ 1 ข้อความ
  const messages = (cfg.messages && cfg.messages.length ? cfg.messages : cfg.greeting ? [cfg.greeting] : []).map((s) => s.trim()).filter(Boolean);
  const chatEvery = cfg.chatEveryMin ?? 10;
  const defaultClear = t("เคลียร์งานหมดแล้ว เก่งมาก! 🎉", "All clear, great job! 🎉");
  const pickMsg = () => (messages.length ? messages[Math.floor(Math.random() * messages.length)] : defaultClear);

  // มีงานเตือน → เปิดกรอบคำพูดเอง + วนข้อความถ้ามีหลายอย่าง
  useEffect(() => { if (hasAlert) setOpen(true); }, [hasAlert]);
  useEffect(() => {
    if (!open || alerts.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % alerts.length), 4000);
    return () => clearInterval(id);
  }, [open, alerts.length]);
  // คุยเล่นเป็นระยะ (ทุก chatEvery นาที) เฉพาะตอนไม่มีงานด่วน · โผล่แล้วหายเองใน 8 วิ
  useEffect(() => {
    if (!cfg.notify || messages.length === 0 || chatEvery <= 0) return;
    const id = setInterval(() => setChat(pickMsg()), chatEvery * 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.notify, messages.join("|"), chatEvery]);
  useEffect(() => { if (!chat) return; const id = setTimeout(() => setChat(null), 8000); return () => clearTimeout(id); }, [chat]);

  const acknowledge = () => {
    const now = new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, now); } catch { /* ignore */ }
    setSeen(now);
  };

  const corner = CORNER[cfg.corner ?? "br"];
  const size = cfg.size ?? 64;
  const lottieSrc = lottieSrcOf(lottieUrl ?? null);
  const hasLottie = !!lottieData || !!lottieSrc;
  const frameList = (frames ?? []).filter(Boolean);
  const frameMs = cfg.frameMs ?? 400;
  const petImgNode = petUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/r2-image?key=${encodeURIComponent(petUrl)}&w=200`} alt="" style={{ width: size, height: size }} className="object-contain drop-shadow-lg" draggable={false} />
  ) : null;

  // ปิดโหมดเตือน → ตัว PET ลอยเฉย ๆ แบบเดิม (หลายรูป > Lottie > รูป/GIF) — เคารพมุม/ขนาดที่ตั้งไว้
  if (!cfg.notify) {
    if (frameList.length) return <div className={`absolute ${corner.pos} pointer-events-none select-none`}><FramePet frames={frameList} size={size} intervalMs={frameMs} animCls="ov-pet-float" /></div>;
    if (hasLottie) return <div className={`absolute ${corner.pos} pointer-events-none select-none`}><LottiePet data={lottieData} src={lottieSrc} size={size} animCls="ov-pet-float" fallback={petImgNode} /></div>;
    return petUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/r2-image?key=${encodeURIComponent(petUrl)}&w=200`} alt="" style={{ width: size, height: size }} className={`absolute ${corner.pos} object-contain drop-shadow-lg pointer-events-none select-none`} />
    ) : null;
  }

  const cur = alerts[Math.min(idx, Math.max(0, alerts.length - 1))];
  const face = hasAlert ? (cfg.emojiAlert ?? "🙀") : (cfg.emojiHappy ?? "🐥");
  const alertCls = hasAlert ? "ov-pet-alert" : "ov-pet-float";
  const faceNode = <span style={{ fontSize: size }} className={`block leading-none drop-shadow-lg ${alertCls}`}>{face}</span>;
  const petImgAlertNode = petUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/r2-image?key=${encodeURIComponent(petUrl)}&w=200`} alt="" style={{ width: size, height: size }} className={`object-contain drop-shadow-lg ${alertCls}`} draggable={false} />
  ) : null;

  const bubbleShown = hasAlert ? open : !!chat;
  const bubbleEl = bubbleShown ? (
    <div className="ov-bubble-pop max-w-[230px]">
      <div className="bg-white text-slate-700 rounded-2xl shadow-lg border border-slate-100 px-3 py-2">
        {hasAlert ? (
          <div className="space-y-1">
            {alerts.map((a) => (
              <button key={a.kind} onClick={() => { onAlert(a.kind); if (a.kind === "new") acknowledge(); }}
                className={`flex items-center gap-1.5 text-xs w-full text-left transition-colors hover:text-violet-700 ${a === cur ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                <span>{a.icon}</span><span className="flex-1">{a.text}</span><span className="text-slate-300">›</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs">{chat ?? defaultClear}</p>
        )}
      </div>
    </div>
  ) : null;

  const petEl = (
    <button onClick={() => { if (hasAlert) setOpen((o) => !o); else setChat((c) => (c ? null : pickMsg())); if (newCount > 0) acknowledge(); }} title={t("กดดูการแจ้งเตือน / ให้ PET พูด", "Tap for alerts / make the pet talk")}
      className="relative select-none focus:outline-none">
      {total > 0 && (
        <span className={`ov-badge-pulse absolute -top-1 ${corner.isLeft ? "-left-1" : "-right-1"} z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow`}>{total > 99 ? "99+" : total}</span>
      )}
      {frameList.length ? (
        <FramePet frames={frameList} size={size} intervalMs={hasAlert ? Math.round(frameMs / 2) : frameMs} animCls={alertCls} />
      ) : hasLottie ? (
        <LottiePet data={lottieData} src={lottieSrc} size={size} animCls={alertCls} fallback={petImgAlertNode ?? faceNode} />
      ) : petImgAlertNode ? (
        petImgAlertNode
      ) : (
        faceNode
      )}
    </button>
  );

  return (
    <div className={`absolute ${corner.pos} z-10 flex flex-col ${corner.items} gap-1`}>
      {corner.isTop ? <>{petEl}{bubbleEl}</> : <>{bubbleEl}{petEl}</>}
    </div>
  );
}
