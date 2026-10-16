"use client";

/**
 * ของกลาง — ตัวเลือก "กดแล้วไปที่" (ช่องชนิด target ใน schema หน้าเว็บร้าน)
 *
 * เลือกจากรายการแทนการพิมพ์ URL เอง: หน้าในเว็บ / หมวดสินค้า / สินค้า / ส่วนอื่นในหน้านี้ / ลิงก์ภายนอก
 * ค่าที่เก็บ = href ธรรมดา (string) → ข้อมูลเดิมที่เป็น "/shop" ฯลฯ เปิดมาก็เลือกถูกช่องเอง
 * รูปแบบ URL ของกลางอยู่ที่ lib/website-links.ts (ต้องตรงกับ route ของเว็บร้าน)
 */
import { useEffect, useMemo, useState } from "react";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { BASE_PAGES, categoryHref, productHref, sectionHref, categoryKeyOf } from "@/lib/website-links";
import type { SchemaFormContext } from "@/components/website-schema-form";

type Kind = "none" | "page" | "category" | "product" | "section" | "url";

const KINDS: { v: Kind; l: string }[] = [
  { v: "none", l: "ไม่มีลิงก์" },
  { v: "page", l: "หน้าในเว็บ" },
  { v: "category", l: "หมวดสินค้า" },
  { v: "product", l: "สินค้า (รุ่น)" },
  { v: "section", l: "เลื่อนไปส่วนอื่นในหน้านี้" },
  { v: "url", l: "ลิงก์ภายนอก / อีเมล / โทร" },
];

const clsMd =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
/** size="sm" — ช่องเตี้ย ตัวเล็ก (รายการที่เปิดก็ตัวเล็กตาม) ใช้ในแผงตั้งค่าที่แน่น เช่น ตัวจัดแผงเมนู */
const clsSm =
  "w-full h-7 rounded-lg border border-slate-200 px-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";

/** ทายว่า href เดิมเป็นลิงก์ชนิดไหน */
function kindOf(href: string): Kind {
  if (!href) return "none";
  if (href.startsWith("#")) return "section";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return "url";
  if (categoryKeyOf(href) !== null) return "category";
  if (href.startsWith("/product/")) return "product";
  return "page";
}

/** หน้าที่สร้างเองของร้าน (API สาธารณะตัวเดียวกับที่เว็บร้านใช้) — แคชต่อร้านในหน้านี้ */
const pagesCache = new Map<string, Promise<{ slug: string; title: string }[]>>();
function loadStorePages(shopSlug: string) {
  if (!pagesCache.has(shopSlug))
    pagesCache.set(
      shopSlug,
      fetch(`/api/public/storefront/page?shop=${encodeURIComponent(shopSlug)}`)
        .then((r) => r.json())
        .then((j) => ((j?.pages as { slug: string; title: string }[]) ?? []).filter((p) => p.slug))
        .catch(() => [])
    );
  return pagesCache.get(shopSlug)!;
}

export function LinkTargetPicker({ value, onChange, ctx, size = "md" }: { value: string; onChange: (href: string) => void; ctx: SchemaFormContext; /** sm = ช่องเตี้ยตัวเล็ก (แผงตั้งค่าแน่น) */ size?: "sm" | "md" }) {
  const cls = size === "sm" ? clsSm : clsMd;
  const [kind, setKind] = useState<Kind>(() => kindOf(value));
  const [storePages, setStorePages] = useState<{ slug: string; title: string }[]>([]);
  const [productCode, setProductCode] = useState<string>("");

  // ค่าเปลี่ยนจากข้างนอก (เช่น undo / เลือกชิ้นอื่น) → ชนิดตามค่าใหม่
  useEffect(() => setKind(kindOf(value)), [value]);

  useEffect(() => {
    let alive = true;
    void loadStorePages(ctx.shopSlug).then((p) => alive && setStorePages(p));
    return () => {
      alive = false;
    };
  }, [ctx.shopSlug]);

  const pages = useMemo(() => [...BASE_PAGES, ...storePages.map((p) => ({ href: `/${p.slug}`, label: `📄 ${p.title || p.slug}` }))], [storePages]);
  const catKey = categoryKeyOf(value) ?? "";

  const pickKind = (k: Kind) => {
    setKind(k);
    // เปลี่ยนชนิด → ตั้งค่าเริ่มที่สมเหตุสมผล (ผู้ใช้เลือกต่อในช่องถัดไป)
    if (k === "none") onChange("");
    else if (k === "page") onChange("/shop");
    else if (k === "category") onChange(ctx.categories[0] ? categoryHref(ctx.categories[0].key) : "");
    else if (k === "section") onChange(ctx.sections?.[0] ? sectionHref(ctx.sections[0].id) : "");
    else if (k === "url") onChange(/^(https?:|mailto:|tel:)/i.test(value) ? value : "https://");
    else onChange("");
  };

  return (
    <div className="space-y-1.5">
      <select className={cls} value={kind} onChange={(e) => pickKind(e.target.value as Kind)}>
        {KINDS.map((k) => (
          <option key={k.v} value={k.v}>
            {k.l}
          </option>
        ))}
      </select>

      {kind === "page" && (
        <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
          {!pages.some((p) => p.href === value) && value && <option value={value}>{value}</option>}
          {pages.map((p) => (
            <option key={p.href} value={p.href}>
              {p.label} ({p.href})
            </option>
          ))}
        </select>
      )}

      {kind === "category" &&
        (ctx.categories.length ? (
          <select className={cls} value={catKey} onChange={(e) => onChange(categoryHref(e.target.value))}>
            {!catKey && <option value="">— เลือกหมวด —</option>}
            {ctx.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[11px] text-amber-600">ร้านนี้ยังไม่ได้ตั้งหมวดสินค้าบนเว็บ (แท็บจับคู่ฟิลด์)</p>
        ))}

      {kind === "product" && (
        <div className="space-y-1">
          <WebsiteProductPicker
            shopSlug={ctx.shopSlug}
            value={productCode ? [productCode] : []}
            max={1}
            onChange={(codes) => {
              const code = codes[codes.length - 1] ?? "";
              setProductCode(code);
              onChange(code ? productHref(code) : "");
            }}
          />
          {value.startsWith("/product/") && <p className="text-[11px] text-slate-500">ตอนนี้ลิงก์ไปที่ {value}</p>}
        </div>
      )}

      {kind === "section" &&
        (ctx.sections?.length ? (
          <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
            {!ctx.sections.some((x) => sectionHref(x.id) === value) && <option value={value}>{value || "— เลือกส่วน —"}</option>}
            {ctx.sections.map((x) => (
              <option key={x.id} value={sectionHref(x.id)}>
                {x.label}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[11px] text-slate-400">ใช้ได้ในตัวจัดหน้าเท่านั้น</p>
        ))}

      {kind === "url" && (
        <input className={cls} value={value} placeholder="https://… หรือ mailto:… หรือ tel:…" maxLength={300} onChange={(e) => onChange(e.target.value.trim())} />
      )}
    </div>
  );
}
