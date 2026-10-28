"use client";

/**  (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useState } from "react";
import { cardImagePosition, type Shape } from "@/lib/website-theme";
import { type SampleItem, type Theme } from "./shared";

/* ─────────── การ์ดสินค้าจำลอง (แท็บการ์ดสินค้า) — เลียนแบบ storefront ProductCard ให้ใกล้ที่สุด ─────────── */
export const RATIO_CSS: Record<string, string> = { "1:1": "1 / 1", "4:3": "4 / 3", "4:5": "4 / 5", "3:4": "3 / 4", "16:9": "16 / 9" };
export const STOCK_TH: Record<string, { text: string; color: string }> = { in: { text: "พร้อมส่ง", color: "#1F9254" }, low: { text: "เหลือน้อย", color: "#C77A0A" }, preorder: { text: "สั่งจอง", color: "#8A8F97" }, out: { text: "สินค้าหมด", color: "#9CA3AF" } };
export function SampleCard({ item, card, colors, fonts, radius, shape }: { item: SampleItem; card: Theme["card"]; colors: Theme["colors"]; fonts: Theme["fonts"]; radius: Theme["radius"]; shape?: Shape }) {
  const [hover, setHover] = useState(false);
  const base = radius === "sharp" ? 4 : radius === "round" ? 20 : 12;
  // ความมนจริงตามแท็บรูปทรง/การ์ด (null = ตามค่ารวม) — การ์ดย่อส่วน จึงหารครึ่งให้ดูสมจริง
  const rCard = Math.round((shape?.cardRadius ?? base) * 0.6);
  const r = Math.round((shape?.imageRadius ?? base) * 0.6);
  const boxed = card.preset === "border" || card.preset === "shadow" || card.preset === "floating";
  const lift = card.hover === "lift" || card.hover === "lift-swap";
  const swap = (card.hover === "swap" || card.hover === "lift-swap") && item.images.length > 1;
  const wrap: React.CSSProperties = {
    background: boxed ? colors.surface : "transparent",
    border: card.preset === "border" ? `1px solid ${colors.line}` : undefined,
    boxShadow: card.preset === "shadow" ? "0 2px 10px rgba(20,21,23,.06)" : card.preset === "floating" ? "0 14px 34px rgba(20,21,23,.14)" : undefined,
    borderRadius: boxed ? rCard : undefined,
    overflow: boxed ? "hidden" : undefined,
    transform: hover && lift ? "translateY(-4px)" : undefined,
    transition: "transform .25s, box-shadow .25s",
    textAlign: card.align === "center" ? "center" : "left",
    fontFamily: fonts.body,
  };
  const stock0 = STOCK_TH[item.stock] ?? STOCK_TH.in;
  const stock = { ...stock0, color: item.stock === "low" ? colors.stockLow : item.stock === "preorder" || item.stock === "out" ? stock0.color : colors.stockIn };
  const onSale = !!item.comparePrice && item.comparePrice > item.price;
  return (
    <div style={wrap} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative overflow-hidden" style={{ aspectRatio: RATIO_CSS[card.imageRatio] ?? "4 / 5", background: card.imageBg || "#eee", borderRadius: boxed ? undefined : r }}>
        {item.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.images[0]} alt="" className={`absolute inset-0 w-full h-full transition-all duration-500 ${card.imageFit === "contain" ? "object-contain" : "object-cover"} ${card.imagePad == null && card.imageFit === "contain" ? "p-2" : ""}`} style={{ transform: hover && card.hover === "zoom" ? "scale(1.05)" : undefined, opacity: hover && swap ? 0 : 1, padding: card.imagePad != null ? `${card.imagePad}%` : undefined, objectPosition: cardImagePosition(card), scale: card.imageScale !== 100 ? String(card.imageScale / 100) : undefined, transformOrigin: cardImagePosition(card) }} />
        )}
        {swap && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.images[1]} alt="" className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${card.imageFit === "contain" ? "object-contain p-2" : "object-cover"}`} style={{ opacity: hover ? 1 : 0, objectPosition: cardImagePosition(card), scale: card.imageScale !== 100 ? String(card.imageScale / 100) : undefined, transformOrigin: cardImagePosition(card) }} />
        )}
        {card.showBadge && item.badge && <span className="absolute top-2 left-2 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/90" style={{ color: colors.ink, letterSpacing: ".08em" }}>{item.badge}</span>}
        {card.autoBadges.sale && item.comparePrice && item.comparePrice > item.price && Math.round((1 - item.price / item.comparePrice) * 100) >= card.autoBadges.saleMin && (
          <span className={`absolute top-2 ${card.autoBadges.pos === "top-right" ? "right-2" : "left-2"} text-[9px] font-bold px-2 py-0.5 text-white`} style={{ background: card.autoBadges.saleColor, borderRadius: card.autoBadges.shape === "pill" ? 99 : 2, marginTop: item.badge && card.showBadge && card.autoBadges.pos === "top-left" ? 18 : 0 }}>
            {card.autoBadges.saleText.replace("{pct}", String(Math.round((1 - item.price / item.comparePrice) * 100)))}
          </span>
        )}
        {card.quickAdd !== "none" && (
          <span className="absolute left-2 right-2 bottom-2 text-[11px] text-center rounded-md py-1 bg-white/95 transition-all duration-300" style={{ color: colors.ink, opacity: card.quickAdd === "always" || hover ? 1 : 0, transform: card.quickAdd === "always" || hover ? "none" : "translateY(6px)" }}>เพิ่มลงตะกร้า</span>
        )}
      </div>
      <div className={boxed ? "p-3" : "pt-2.5"}>
        <div className={`flex items-center text-[9px] mb-0.5 ${card.align === "center" ? "justify-center gap-2" : "justify-between"}`}>
          {card.showCategory && <span className="uppercase tracking-wider" style={{ color: colors.muted }}>{item.category}</span>}
          {card.showStock && <span className="inline-flex items-center gap-1" style={{ color: stock.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: stock.color }} />{stock.text}</span>}
        </div>
        {(() => {
          // 🃏 ชื่อ-ราคา: split = บรรทัดเดียว (ชื่อตัด 1 บรรทัด · ราคาขวา) · จุดสีข้างชื่อ = 1 ช่อง + "+N"
          const split = card.infoLayout === "split";
          const swR = card.swatchShape === "square" ? "0" : card.swatchShape === "rounded" ? "3px" : "999px";
          const name = <div className="leading-snug min-w-0" style={{ fontFamily: fonts.display, color: hover ? colors.link || colors.brand : colors.ink, fontWeight: card.nameWeight, textTransform: card.nameUpper ? "uppercase" : undefined, letterSpacing: card.nameTracking ? `${card.nameTracking / 100}em` : undefined, fontSize: `${0.8 * card.nameSize / 100}rem`, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: split ? 1 : card.titleLines, overflow: "hidden" }}>{item.name}</div>;
          const price = (
            <div className={split ? "shrink-0" : "mt-1"} style={{ fontSize: `${0.82 * card.priceSize / 100}rem` }}>
              <span style={{ fontFamily: fonts.display, fontWeight: card.priceWeight, color: (onSale && colors.sale) || colors.price || colors.ink }}>฿{item.price.toLocaleString("th-TH")}</span>
              {card.showCompare && item.comparePrice && item.comparePrice > item.price && <s className="ml-1.5 text-[0.8em]" style={{ color: colors.muted }}>฿{item.comparePrice.toLocaleString("th-TH")}</s>}
              {card.showUnit && <span className="text-[0.8em]" style={{ color: colors.muted }}> / {item.unit}</span>}
            </div>
          );
          const nameSw = card.showSwatches && card.swatchPos === "name" && item.swatches.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <span className="inline-block w-3 h-3 bg-cover bg-center" style={{ borderRadius: swR, background: item.swatches[0].color, backgroundImage: item.swatches[0].color ? undefined : `url(${item.swatches[0].img})`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />
              {item.swatches.length > 1 && <span className="text-[9px]" style={{ color: colors.muted }}>+{item.swatches.length - 1}</span>}
            </span>
          );
          return split ? (
            <div className="flex items-baseline justify-between gap-2">{name}{nameSw}{price}</div>
          ) : (
            <>
              {nameSw ? <div className="flex items-center justify-between gap-2">{name}{nameSw}</div> : name}
              {price}
            </>
          );
        })()}
        {card.showSwatches && card.swatchPos !== "name" && item.swatches.length > 0 && (
          <div className={`flex items-center gap-1 mt-1.5 ${card.align === "center" ? "justify-center" : ""}`}>
            {item.swatches.slice(0, card.swatchMax).map((c, i) => <span key={i} className="inline-block w-3 h-3 bg-cover bg-center" style={{ borderRadius: card.swatchShape === "square" ? 0 : card.swatchShape === "rounded" ? 3 : 999, background: c.color, backgroundImage: c.color ? undefined : `url(${c.img})`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />)}
            {item.swatches.length > card.swatchMax && <span className="text-[9px]" style={{ color: colors.muted }}>+{item.swatches.length - card.swatchMax}</span>}
          </div>
        )}
        {card.showColorCount && item.swatches.length > 1 && <div className="text-[9px] mt-0.5" style={{ color: colors.muted }}>{item.swatches.length} สี</div>}
      </div>
    </div>
  );
}