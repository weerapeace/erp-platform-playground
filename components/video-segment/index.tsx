"use client";

/**
 * 🎬 VideoSegmentPlayer — ตัวเล่นคลิป "เฉพาะช่วง" ของกลาง (ฝังเล่นในหน้า ไม่ดาวน์โหลดไฟล์)
 *   ใช้ใน: คลัง Video Shot (/misc/learn แท็บ Video Shot) · คลิปของขั้นตอนบทเรียน
 *   YouTube  = เล่นเฉพาะช่วง (start/end) + วนช่วงเอง (คุมผ่าน JS API ของ YouTube ด้วย postMessage)
 *   TikTok   = ตัวเล่น player/v1 สั่งกระโดดไปเวลาเริ่ม + หยุด/วนเมื่อถึงเวลาจบ · ตัวเล่นไม่ตอบ = โชว์ป้ายช่วงให้ดูเอง
 *   Pinterest / Instagram = ตั้งเวลาไม่ได้ → เล่นทั้งคลิป + ป้ายบอกช่วงที่ควรดู
 *   ยังไม่กด = โชว์ภาพปก (ไม่โหลดตัวเล่น กันหน้าหนัก)
 * กติกาลิงก์/แพลตฟอร์ม = lib/video-shot · คู่มือ docs/learning-center.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { socialEmbedSize } from "@/lib/social-embed";
import { parseShotLink, rangeText, SEGMENT_LABEL, SHOT_PLATFORMS, shotEmbedSrc, shotWatchUrl, youtubeThumb } from "@/lib/video-shot";

type Props = {
  url: string;
  start?: number | null;
  end?: number | null;
  /** วนช่วงซ้ำ (ค่าเริ่ม: วนเมื่อมีเวลาจบ) */
  loop?: boolean;
  thumb?: string | null;
  title?: string | null;
  /** โหลดตัวเล่นทันที (ไม่ต้องกดภาพปก) */
  autoLoad?: boolean;
  className?: string;
};

const parse = (d: unknown): Record<string, unknown> | null => {
  if (d && typeof d === "object") return d as Record<string, unknown>;
  if (typeof d === "string" && d.startsWith("{")) { try { return JSON.parse(d) as Record<string, unknown>; } catch { return null; } }
  return null;
};

export function VideoSegmentPlayer({ url, start = null, end = null, loop, thumb, title, autoLoad, className = "" }: Props) {
  const link = useMemo(() => parseShotLink(url), [url]);
  const [play, setPlay] = useState(!!autoLoad);
  const [loopOn, setLoopOn] = useState(loop ?? !!end);
  const [tt, setTt] = useState<"wait" | "ok" | "fail">("wait"); // TikTok: ตัวเล่นตอบไหม
  const ref = useRef<HTMLIFrameElement>(null);
  const loopRef = useRef(loopOn);
  const lastJump = useRef(0);
  const st = start && start > 0 ? start : 0;
  useEffect(() => { loopRef.current = loopOn; }, [loopOn]);
  useEffect(() => { setPlay(!!autoLoad); setTt("wait"); }, [url, start, end, autoLoad]);

  const platform = link?.platform ?? null;
  const id = link?.id ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const src = useMemo(() => (platform && id ? shotEmbedSrc(platform, id, { start, end, autoplay: true, origin }) : null), [platform, id, start, end, origin]);

  const ytCmd = useCallback((func: string, args: unknown[] = []) => {
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }, []);
  const ttCmd = useCallback((type: string, value?: unknown) => {
    ref.current?.contentWindow?.postMessage({ type, value, "x-tiktok-player": true }, "*");
  }, []);

  /** กลับไปต้นช่วงแล้วเล่นต่อ */
  const replay = useCallback(() => {
    lastJump.current = Date.now();
    if (platform === "youtube") { ytCmd("seekTo", [st, true]); ytCmd("playVideo"); }
    else if (platform === "tiktok") { ttCmd("seekTo", st); ttCmd("play"); }
  }, [platform, st, ytCmd, ttCmd]);

  // ฟังสถานะจากตัวเล่น → ถึงเวลาจบ = วนกลับต้นช่วง (หรือหยุด)
  useEffect(() => {
    if (!play || (platform !== "youtube" && platform !== "tiktok")) return;
    const atEnd = (t: number) => {
      if (Date.now() - lastJump.current < 900) return;
      if (loopRef.current) replay();
      else if (platform === "youtube") ytCmd("pauseVideo");
      else { lastJump.current = Date.now(); ttCmd("pause"); }
      void t;
    };
    const onMsg = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = parse(e.data);
      if (!d) return;
      if (platform === "youtube") {
        const info = (d.info && typeof d.info === "object" ? d.info : {}) as { currentTime?: number; playerState?: number };
        const state = d.event === "onStateChange" ? Number(d.info) : info.playerState;
        if (end && typeof info.currentTime === "number" && info.currentTime >= end - 0.3) atEnd(info.currentTime);
        else if (state === 0 && end) atEnd(end);
        return;
      }
      if (!d["x-tiktok-player"]) return;
      if (d.type === "onPlayerReady") {
        if (st) { lastJump.current = Date.now(); ttCmd("seekTo", st); }
        ttCmd("play");
      } else if (d.type === "onCurrentTime") {
        const v = (d.value ?? {}) as { currentTime?: number };
        const t = Number(v.currentTime);
        if (!Number.isFinite(t)) return;
        if (tt !== "ok" && (!st || Math.abs(t - st) < 2.5 || t > st)) setTt("ok");
        if (end && t >= end - 0.2) atEnd(t);
      } else if (d.type === "onError") setTt("fail");
    };
    window.addEventListener("message", onMsg);
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (platform === "tiktok") timer = setTimeout(() => setTt((x) => (x === "ok" ? x : "fail")), 7000);
    return () => { window.removeEventListener("message", onMsg); if (timer) clearTimeout(timer); };
  }, [play, platform, end, st, replay, ytCmd, ttCmd, tt]);

  const onLoad = () => {
    if (platform !== "youtube") return;
    // ขอให้ YouTube ส่งเวลาปัจจุบัน/สถานะกลับมา (โปรโตคอลเดียวกับ IFrame API)
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "seg", channel: "widget" }), "*");
    ytCmd("addEventListener", ["onStateChange"]);
  };

  if (!link) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50">
        <Icon name="video" /> เปิดคลิป <Icon name="external-link" className="ml-auto" />
      </a>
    );
  }
  const meta = SHOT_PLATFORMS[link.platform];
  const range = rangeText(start, end);
  const watch = shotWatchUrl(link.platform, link.url, id, start);
  const poster = thumb || (link.platform === "youtube" && id ? youtubeThumb(id) : null);
  const canLoop = (link.platform === "youtube" || (link.platform === "tiktok" && tt !== "fail")) && !!end;
  const size = link.platform === "pinterest" || link.platform === "instagram" ? socialEmbedSize(link.platform) : null;
  const box = link.platform === "youtube" ? "aspect-video w-full"
    : link.platform === "tiktok" ? "aspect-[9/16] w-full max-w-[320px] mx-auto"
    : "w-full mx-auto";

  return (
    <div className={className}>
      <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${box}`} style={size ? { maxWidth: size.width, height: size.height } : undefined}>
        {play && src ? (
          <iframe ref={ref} key={src} src={src} onLoad={onLoad} title={title || `คลิป ${meta.label}`}
            className="absolute inset-0 h-full w-full border-0" scrolling={size ? "no" : undefined} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <button type="button" onClick={() => setPlay(true)} disabled={!src}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90 hover:text-white disabled:cursor-not-allowed">
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }}
                className="absolute inset-0 h-full w-full object-cover opacity-70" />
            )}
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-2xl"><Icon name="player-play" /></span>
            <span className="relative rounded-full bg-black/40 px-2.5 py-0.5 text-xs">{src ? `เล่น${range ? `ช่วง ${range}` : "คลิป"} (${meta.label})` : "ลิงก์สั้นนี้ต้องบันทึกก่อนถึงเล่นได้"}</span>
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
        {range && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700"><Icon name="cut" /> ช่วง {range}</span>}
        <span className={`rounded-full px-2 py-0.5 ${meta.segment === "full" || (meta.segment === "seek" && tt === "ok") ? "bg-emerald-50 text-emerald-700" : meta.segment === "seek" && tt === "wait" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-800"}`}>
          {meta.segment === "seek" && tt === "fail" ? "ตัวเล่นไม่ตอบ — ดูช่วงตามป้าย" : SEGMENT_LABEL[meta.segment]}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {play && canLoop && (
            <>
              <button type="button" onClick={replay} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50"><Icon name="player-skip-back" /> เล่นช่วงนี้อีกครั้ง</button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-600">
                <input type="checkbox" checked={loopOn} onChange={(e) => setLoopOn(e.target.checked)} className="accent-indigo-600" /> วนช่วงนี้
              </label>
            </>
          )}
          <a href={watch} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-indigo-700 hover:bg-indigo-50">
            เปิดที่ {meta.label}{link.platform === "youtube" && st ? ` (เริ่ม ${rangeText(st, null).replace("ตั้งแต่ ", "")})` : ""} <Icon name="external-link" />
          </a>
        </span>
      </div>
      {range && meta.segment === "none" && <p className="mt-1 text-[12px] text-amber-800">{meta.label} ตั้งเวลาเริ่ม/จบไม่ได้ — เล่นทั้งคลิป ให้ดูช่วง {range}</p>}
    </div>
  );
}

export default VideoSegmentPlayer;
