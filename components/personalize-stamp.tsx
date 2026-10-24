"use client";

/**
 * ของกลาง — วาด "รอยปั๊มชื่อ" บนรูป (SVG ตัวเดียวกับเว็บร้าน: พิมพ์จม = personalizeEmbossFilter · เงิน/ทอง = สี/ไล่สี + personalizeFoilFilter)
 *   PersonalizeStampSvg   ชั้น SVG ทับรูปขนาด w×h px (หลายตำแหน่งได้) — แผงตั้งค่าปั๊มชื่อ (components/personalize-editor) ใช้ตัวนี้
 *   PersonalizePreviewImage รูป + รอยปั๊มจากภาพ ณ ตอนสั่ง (PersonalizePreviewSnap) — หน้าออเดอร์เว็บ (components/website-orders-panel)
 * ตำแหน่ง/มุมมอง = personalizeSvgTransform (หมุน + เอียง/ยืดรอบจุดยึด) · ตัวสุดท้ายไม่มีความห่าง (ชิดซ้าย/ขวาพอดีจุด)
 */
import { useCallback, useId, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  personalizeEmbossFilter,
  personalizeFoilFilter,
  personalizeFoilGradientEnds,
  personalizeSplitLast,
  personalizeSvgTransform,
  type PersonalizeColorPos,
  type PersonalizeEmbossFx,
  type OrderPersonalize,
  type PersonalizeFoilFx,
  type PersonalizePreviewSnap,
  type PersonalizeStyle,
} from "@/lib/website-personalize";

export function PersonalizeStampSvg({
  w,
  h,
  positions,
  text,
  letterSpacing,
  embossFx,
  foil,
  className = "absolute left-0 top-0 pointer-events-none overflow-visible",
}: {
  w: number;
  h: number;
  positions: PersonalizeColorPos[];
  text: string;
  letterSpacing: number;
  embossFx?: PersonalizeEmbossFx;
  /** เงิน/ทอง — ไม่ส่ง = พิมพ์จม (embossFx) */
  foil?: PersonalizeFoilFx | null;
  className?: string;
}) {
  const uid = `pzst-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [head, last] = personalizeSplitLast(text);
  return (
    <svg className={className} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {positions.map((p) => {
        const fontPx = (w * p.size) / 100;
        const x = (w * p.x) / 100;
        const y = (h * p.y) / 100;
        const html = foil ? personalizeFoilFilter(foil, fontPx) : embossFx ? personalizeEmbossFilter(embossFx, fontPx) : "";
        return (
          <g key={p.key}>
            <defs>
              {/* ชั้นของ filter เป็นตัวเลขล้วน (ไม่มีข้อความจากผู้ใช้) */}
              <filter id={`${uid}-${p.key}`} x="-30%" y="-60%" width="160%" height="220%" colorInterpolationFilters="sRGB" dangerouslySetInnerHTML={{ __html: html }} />
              {foil?.mode === "gradient" && (
                <linearGradient id={`${uid}-g-${p.key}`} {...personalizeFoilGradientEnds(foil.gradAngle)}>
                  {[...foil.stops].sort((a, b) => a.pos - b.pos).map((st, i) => (
                    <stop key={i} offset={`${st.pos}%`} stopColor={st.color} />
                  ))}
                </linearGradient>
              )}
            </defs>
            <text
              x={x}
              y={y}
              textAnchor={p.align === "left" ? "start" : p.align === "right" ? "end" : "middle"}
              dominantBaseline="central"
              transform={personalizeSvgTransform(p, x, y)}
              fontFamily='"Times New Roman", Times, serif'
              fontSize={fontPx}
              letterSpacing={`${letterSpacing}em`}
              fill={!foil ? "#000" : foil.mode === "solid" ? foil.solid : `url(#${uid}-g-${p.key})`}
              filter={html ? `url(#${uid}-${p.key})` : undefined}
            >
              {head}
              <tspan letterSpacing="0">{last}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const STYLE_TH: Record<PersonalizeStyle, string> = { emboss: "พิมพ์จม", silver: "พิมพ์เงิน", gold: "พิมพ์ทอง" };

/** 📸 กล่องรอยปั๊มในหน้าออเดอร์ — รูปที่ลูกค้าเห็นตอนสั่ง (กดขยายได้) + ข้อความ (คัดลอกได้) · ออเดอร์เก่า (ไม่มีภาพ) = ข้อความอย่างเดียว */
export function PersonalizeOrderPreview({ pz }: { pz: OrderPersonalize }) {
  const [big, setBig] = useState(false);
  const sn = pz.preview;
  return (
    <div className="mt-1.5 flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 flex-wrap">
      {sn && (
        <button type="button" onClick={() => setBig((v) => !v)} className={`${big ? "w-full max-w-md" : "w-36"} shrink-0 transition-all`} title={big ? "ย่อ" : "กดเพื่อขยาย"}>
          <PersonalizePreviewImage snap={sn} text={pz.text} style={pz.style} imageUrl={`/api/r2-image?key=${encodeURIComponent(sn.imageKey)}&w=900`} />
        </button>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">🔤 ปั๊มชื่อ{sn ? " — ภาพที่ลูกค้าเห็นตอนสั่ง" : ""}</p>
        <p className="flex items-center gap-1.5">
          ข้อความ: <b className="text-sm tracking-wider text-slate-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>{pz.text}</b>
          <CopyButton value={pz.text} title="คัดลอกข้อความปั๊ม" />
        </p>
        <p className="text-amber-800/80">
          {STYLE_TH[pz.style]} · {pz.position === "right" ? "มุมขวาล่าง" : "ตรงกลาง"}
          {sn ? " · ภาพบันทึกไว้ตอนสั่ง (แก้ค่าตั้งทีหลัง ภาพนี้ไม่เปลี่ยน)" : ""}
        </p>
      </div>
    </div>
  );
}

/** 📸 รูป + รอยปั๊ม ณ ตอนสั่ง — วัดขนาดกรอบจริงแล้ววาด SVG ทับ (รูปยังไม่โหลด = ยังไม่วาด) */
export function PersonalizePreviewImage({ snap, text, style, imageUrl, className }: { snap: PersonalizePreviewSnap; text: string; style: PersonalizeStyle; imageUrl: string; className?: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const setBox = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
    measure();
  }, []);
  return (
    <div ref={setBox} className={`relative overflow-hidden rounded-lg bg-slate-100 ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="block w-full h-auto" />
      {size.w > 0 && size.h > 0 && (
        <PersonalizeStampSvg w={size.w} h={size.h} positions={[snap.pos]} text={text} letterSpacing={snap.letterSpacing} embossFx={style === "emboss" ? snap.embossFx : undefined} foil={style === "emboss" ? null : snap.foilFx} />
      )}
    </div>
  );
}
