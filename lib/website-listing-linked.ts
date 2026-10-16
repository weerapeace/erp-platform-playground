/**
 * 🔗 "ข้อมูลที่เชื่อม" ของสินค้าบนเว็บ 1 รุ่น · 1 ร้าน — หน้าเว็บดึงอะไรมาจากไหน + ค่าตอนนี้ (ว่าง = เตือน)
 * ใช้ที่: /api/parent-web-listings (หน้าต่างสินค้าบนเว็บ แท็บขายบนเว็บ → กล่อง 🔗 ใต้คำอธิบาย)
 * pure — ไม่แตะ DB (ฝั่งที่เรียกโหลดข้อมูลมาให้) · ป้ายแหล่งข้อมูลใช้ชุดเดียวกับแท็บจับคู่ฟิลด์ (lib/website-field-map *_SOURCE_OPTIONS)
 */
import { DESC_SOURCE_OPTIONS, NAME_SOURCE_OPTIONS, PRICE_SOURCE_OPTIONS, IMAGE_SOURCE_OPTIONS, type FieldMap } from "@/lib/website-field-map";
import type { ProductDetailItem } from "@/lib/website-theme";
import type { DetailOverride } from "@/lib/website-detail-overrides";

export type LinkedStatus = "ok" | "empty" | "override" | "hidden" | "none";

export interface LinkedRow {
  /** ช่องบนเว็บ */
  label: string;
  /** ดึงจากไหน (ภาษาคน) */
  from: string;
  /** ค่าตอนนี้แบบสั้น */
  value: string;
  status: LinkedStatus;
  /** ฟิลด์ใน Parent SKU ที่ว่าง (ไปเติมได้) */
  missing?: string[];
}

const optLabel = (opts: { v: string; l: string }[], v: string) => opts.find((o) => o.v === v)?.l.replace(/\s*\(.*\)\s*$/, "") ?? v;
const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "" && !(typeof v === "number" && v === 0);
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const short = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function buildLinkedRows(a: {
  fieldMap: FieldMap;
  parent: Record<string, unknown>;
  code: string;
  autoName: string;
  listing: { web_name?: unknown; web_price?: unknown; web_description?: unknown } | null;
  auto: { price: number; description: string };
  imageCount: number;
  /** หมวดเว็บของรุ่นนี้ (ไว้ดูว่าหัวข้อ "เฉพาะหมวด" ใช้กับรุ่นนี้ไหม) */
  categories: string[];
  detailItems: ProductDetailItem[];
  detailOverrides: Record<string, DetailOverride>;
  /** key ฟิลด์ Parent SKU → ชื่อ (ทะเบียนฟิลด์) */
  fieldLabel: (key: string) => string;
  shipping: { flat: number; freeMin: number };
}): LinkedRow[] {
  const rows: LinkedRow[] = [];
  const fm = a.fieldMap;
  const l = a.listing;

  // ชื่อ
  const rules = [fm.name.removeBrand && "ตัดแบรนด์", fm.name.removeCollection && "ตัดคอลเลกชัน", fm.name.removeCode && "ตัดรหัส", fm.name.removeParens && "ตัดวงเล็บ"].filter(Boolean).join(" · ");
  const typedName = String(l?.web_name ?? "").trim();
  rows.push({
    label: "ชื่อ",
    from: `${optLabel(NAME_SOURCE_OPTIONS, fm.name.source)}${rules ? ` · ${rules}` : ""}`,
    value: typedName ? `พิมพ์ทับ: ${short(typedName)}` : a.autoName ? short(a.autoName) : "ว่าง",
    status: typedName ? "override" : a.autoName ? "ok" : "empty",
  });

  // ราคา
  const typedPrice = Number(l?.web_price) || 0;
  rows.push({
    label: "ราคา",
    from: optLabel(PRICE_SOURCE_OPTIONS, fm.price.source),
    value: typedPrice > 0 ? `ตั้งบนเว็บ ${baht(typedPrice)}` : a.auto.price > 0 ? baht(a.auto.price) : "ไม่มีราคา",
    status: typedPrice > 0 ? "override" : a.auto.price > 0 ? "ok" : "empty",
  });

  // คำอธิบาย
  const typedDesc = String(l?.web_description ?? "").trim();
  rows.push({
    label: "คำอธิบาย",
    from: optLabel(DESC_SOURCE_OPTIONS, fm.description.source),
    value: typedDesc ? `พิมพ์ทับ ${typedDesc.length.toLocaleString("th-TH")} ตัวอักษร` : a.auto.description ? `${a.auto.description.length.toLocaleString("th-TH")} ตัวอักษร` : "ว่าง",
    status: typedDesc ? "override" : a.auto.description ? "ok" : fm.description.source === "none" ? "none" : "empty",
    missing: !typedDesc && !a.auto.description && fm.description.source !== "none" ? [optLabel(DESC_SOURCE_OPTIONS, fm.description.source)] : undefined,
  });

  // รูป
  rows.push({
    label: "รูป",
    from: optLabel(IMAGE_SOURCE_OPTIONS, fm.image.source),
    value: a.imageCount ? `${a.imageCount} รูป` : "ไม่มีรูป",
    status: a.imageCount ? "ok" : "empty",
  });

  // หัวข้อรายละเอียดหน้าสินค้า (ชุดของธีม · เฉพาะที่ใช้กับรุ่นนี้)
  const code = a.code.toUpperCase();
  for (const it of a.detailItems) {
    if (!it.enabled) continue;
    if (it.applyTo === "categories" && !it.categories.some((c) => a.categories.includes(c))) continue;
    if (it.applyTo === "products" && !it.products.map((p) => p.toUpperCase()).includes(code)) continue;
    const ov = a.detailOverrides[it.id];
    if (ov?.show === false) {
      rows.push({ label: it.label, from: "ซ่อนเฉพาะรุ่นนี้", value: "ไม่ขึ้นเว็บ", status: "hidden" });
      continue;
    }
    if (ov?.text?.trim()) {
      rows.push({ label: it.label, from: "ข้อความเฉพาะรุ่นนี้", value: short(ov.text.trim()), status: "override" });
      continue;
    }
    switch (it.source) {
      case "fields": {
        const keys = it.fields.filter(Boolean);
        const have = keys.filter((k) => filled(a.parent[k]));
        const miss = keys.filter((k) => !filled(a.parent[k]));
        rows.push({
          label: it.label,
          from: keys.map(a.fieldLabel).join(" · ") || "ยังไม่ได้เลือกฟิลด์",
          value: !keys.length ? "—" : miss.length ? `มี ${have.length}/${keys.length} ช่อง` : `ครบ ${keys.length} ช่อง`,
          status: !keys.length ? "none" : have.length === 0 ? "empty" : "ok",
          missing: miss.length ? miss.map(a.fieldLabel) : undefined,
        });
        break;
      }
      case "description":
        rows.push({ label: it.label, from: "คำอธิบายสินค้า (แถวคำอธิบายด้านบน)", value: typedDesc || a.auto.description ? "มีข้อมูล" : "ว่าง", status: typedDesc || a.auto.description ? "ok" : "empty" });
        break;
      case "details":
        // ⚠️ ตอนนี้สินค้าจาก ERP ยังไม่มีช่อง "จุดเด่น" ให้ดึง → หัวข้อนี้ไม่ขึ้นเว็บ (ใส่ข้อความเฉพาะรุ่นได้ในแท็บ 🔤 รายละเอียด)
        rows.push({ label: it.label, from: "จุดเด่น (ยังไม่มีช่องต้นทางใน ERP)", value: "ไม่ขึ้นเว็บ — ใส่ข้อความเฉพาะรุ่นได้", status: "none" });
        break;
      case "text":
        rows.push({ label: it.label, from: "ข้อความกลางของธีม", value: it.text.trim() ? short(it.text.trim()) : "ว่าง", status: it.text.trim() ? "ok" : "empty" });
        break;
      case "shipping":
        rows.push({
          label: it.label,
          from: "ข้อมูลร้าน (ค่าส่ง/ช่องทางจ่าย)",
          value: `ค่าส่ง ${a.shipping.flat > 0 ? baht(a.shipping.flat) : "ฟรี"}${a.shipping.freeMin > 0 ? ` · ฟรีเมื่อครบ ${baht(a.shipping.freeMin)}` : ""}`,
          status: "ok",
        });
        break;
      case "dimensions": {
        const keys = ["size_length_cm", "size_height_cm", "size_thickness_cm"];
        const miss = keys.filter((k) => !filled(a.parent[k]));
        rows.push({
          label: it.label,
          from: "ช่องขนาดใน Parent SKU (กว้าง/สูง/หนา…)",
          value: miss.length === keys.length ? "ว่าง" : miss.length ? `มี ${keys.length - miss.length}/${keys.length}` : "ครบ",
          status: miss.length === keys.length ? "empty" : "ok",
          missing: miss.length ? miss.map(a.fieldLabel) : undefined,
        });
        break;
      }
    }
  }
  return rows;
}
