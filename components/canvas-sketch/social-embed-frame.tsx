"use client";

// ตัวฝัง Pinterest / TikTok บนกระดาน — Excalidraw เรียกผ่าน renderEmbeddable (กล่องฝังที่ลิงก์เป็น Pinterest/TikTok)
// ใช้ iframe ทางการของแต่ละเว็บ (lib/social-embed) · ลิงก์สั้น/เช็กพินถูกลบ ผ่าน /api/social-embed

import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { EmptyState, LoadingState } from "@/components/state-views";
import { pinRatioFromSize, pinterestFit, socialEmbedSrc, type SocialEmbedInfo, type SocialLink } from "@/lib/social-embed";

const infoCache = new Map<string, Promise<SocialEmbedInfo | null>>();
/** ถามข้อมูลลิงก์ (จำไว้ตลอดการเปิดหน้า · ขอซ้ำพร้อมกันได้คำตอบเดียว · พลาด = ลืม ให้ลองใหม่รอบหน้า) */
export function fetchSocialInfo(url: string): Promise<SocialEmbedInfo | null> {
  let p = infoCache.get(url);
  if (!p) {
    p = apiFetch(`/api/social-embed?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.data?.id ? j.data as SocialEmbedInfo : null))
      .catch(() => null)
      .then((d) => { if (!d) infoCache.delete(url); return d; });
    infoCache.set(url, p);
  }
  return p;
}

/** width/height = ขนาดด้านในกล่องฝังบนกระดาน (ใช้ย่อ/ขยายตัวฝัง Pinterest ให้พอดีกล่องตอนผู้ใช้ยืด/หด) */
export function SocialEmbedFrame({ link, width, height }: { link: SocialLink; width: number; height: number }) {
  const t = useT();
  // TikTok ที่รู้เลขคลิปแล้วไม่ต้องถาม (ตัวเล่น TikTok แจ้งคลิปใช้ไม่ได้เอง) · Pinterest ถามเพื่อรู้ว่าพินถูกลบไหม
  const needInfo = !link.id || link.kind === "pinterest";
  const [info, setInfo] = useState<SocialEmbedInfo | null | "loading">(needInfo ? "loading" : null);
  useEffect(() => {
    if (!needInfo) return;
    let alive = true;
    setInfo("loading");
    void fetchSocialInfo(link.url).then((d) => { if (alive) setInfo(d); });
    return () => { alive = false; };
  }, [link.url, needInfo]);

  const name = link.kind === "pinterest" ? "Pinterest" : "TikTok";
  const id = link.id ?? (info && info !== "loading" ? info.id : null);
  const openLink = { label: t(`เปิดใน ${name}`, `Open in ${name}`), onClick: () => window.open(link.url, "_blank", "noopener,noreferrer") };

  if (info && info !== "loading" && !info.available)
    return <EmptyState className="h-full flex flex-col items-center justify-center" icon="🚫" title={t(`${name} นี้ถูกลบหรือเป็นส่วนตัว`, `This ${name} post was removed or is private`)} hint={t("โชว์บนกระดานไม่ได้", "Can't be shown on the board")} action={openLink} />;
  if (!id)
    return info === "loading"
      ? <LoadingState className="h-full bg-white" label={t(`กำลังเปิดลิงก์ ${name}...`, `Opening ${name} link...`)} />
      : <EmptyState className="h-full flex flex-col items-center justify-center" tone="danger" icon="⚠️" title={t("เปิดลิงก์สั้นนี้ไม่ได้", "Couldn't open this short link")} hint={t("ลองเปิดในแอปแล้ว copy ลิงก์เต็มมาวางแทน", "Open it in the app and paste the full link instead")} action={openLink} />;

  const frame = (style?: CSSProperties) => (
    <iframe
      className="excalidraw__embeddable"
      style={style}
      src={socialEmbedSrc(link.kind, id)}
      title={name}
      scrolling="no"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
      allowFullScreen
      // เว็บนอก (คนละโดเมนกับเรา) → allow-same-origin ให้ตัวเล่นใช้คุกกี้/สตอเรจของมันเองได้ ไม่แตะของ ERP
      sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation"
    />
  );
  // TikTok: ตัวเล่นยืดเต็มกล่องเองทุกขนาด
  if (link.kind === "tiktok") return frame();
  // Pinterest: ตัวฝังไม่ยืดตามกล่อง (หดเกินถูกตัด · ยืดเกิน 600 ไม่โต · สูงตามรูป) → วาดขนาดที่มันรับได้แล้วย่อ/ขยายทั้งก้อน
  const fit = pinterestFit(width, height, info && info !== "loading" ? pinRatioFromSize(info) : null);
  return (
    <div className="relative w-full h-full overflow-hidden">
      {frame({ position: "absolute", left: fit.left, top: fit.top, width: fit.frameW, height: fit.frameH, transform: `scale(${fit.scale})`, transformOrigin: "0 0" })}
    </div>
  );
}
