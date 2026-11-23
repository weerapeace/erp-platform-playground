"use client";

/**
 * แถวการ์ดบนสุดของมุมมองหน้าร้าน — ใช้การ์ดกลาง StatFilterCards (ไม่ทำการ์ดเอง)
 * กติกาว่ารายการไหนอยู่แท็บ/กองไหน = lib/platform-listing-health (inShopTab · inShopQueue)
 *
 * เจ้าของ 2026-11-23: ใบแรก "งานที่ต้องทำ" (ยอดรวมปัญหาที่ไม่ได้กรองอะไร) ชวนงง → เปลี่ยนเป็น
 *   "สินค้าที่ขายอยู่" (เปิดหน้ามาเจอ · ไม่โชว์ตัวที่ปิดขาย) + "สินค้าทั้งหมด" (รวมตัวที่ปิดขาย) แล้วตามด้วยกองปัญหา
 *   กองปัญหา (ไม่มีรูป/ซ้ำ/ยังไม่จับคู่/ของขวัญ) นับเฉพาะตัวที่ขายอยู่ (ข้อ 1)
 * โชว์เฉพาะกองที่มีของ (กองว่าง = ไม่ต้องทำ ไม่ต้องรก) · กดกองที่เลือกอยู่ซ้ำ = กลับไป "สินค้าที่ขายอยู่"
 */
import { StatFilterCards, type StatFilterCard } from "@/components/stat-filter-cards";
import { SHOP_QUEUES, inShopQueue, inShopTab, type ShopItem, type ShopParent, type ShopQueue, type ShopTab } from "@/lib/platform-listing-health";

/** กองของรายการบนร้าน + กอง "ไม่มีรูปในระบบ" (เป็นสินค้าของเรา) · none = ไม่กรองกอง (ใช้แท็บ) */
export type QueueKey = ShopQueue | "noimg_erp" | "none";

/** การ์ดที่เป็นแท็บ (ไม่ใช่กอง) */
const TAB_CARDS: { tab: ShopTab; label: string; hint: string }[] = [
  { tab: "selling", label: "สินค้าที่ขายอยู่", hint: "เปิดขายอยู่บนร้าน (รวมตัวที่ของหมดแต่ยังเปิดขาย) · ไม่โชว์ตัวที่ปิดขาย" },
  { tab: "all", label: "สินค้าทั้งหมด", hint: "ทุกรายการบนร้าน รวมตัวที่ปิดขาย" },
];
const tabKey = (t: ShopTab) => `tab:${t}`;

export function ShopQueues({ items, noImage, value, tab, onChange, onPickTab, compact = false }: {
  items: ShopItem[];
  /** สินค้าแบรนด์นี้ที่ไม่มีรูปปก (null = ยังไม่ได้เลือกแบรนด์) */
  noImage: ShopParent[] | null;
  value: QueueKey;
  /** แท็บที่เลือกอยู่ (การ์ด "ขายอยู่ / ทั้งหมด" ติดสีตามนี้ตอนไม่ได้เลือกกอง) */
  tab: ShopTab;
  onChange: (k: QueueKey) => void;
  onPickTab: (t: ShopTab) => void;
  /** การ์ดแถวเดียวแบบเตี้ย (StatFilterCards compact) */
  compact?: boolean;
}) {
  const counts = SHOP_QUEUES.map((q) => ({ ...q, n: items.filter((it) => inShopQueue(it, q.key)).length }));
  const noneImg = noImage?.filter((p) => p.image_state === "none").length ?? 0;
  const skuOnly = noImage?.filter((p) => p.image_state === "sku_only").length ?? 0;

  const cards: StatFilterCard[] = [
    ...TAB_CARDS.map((c) => ({ key: tabKey(c.tab), label: c.label, value: items.filter((it) => inShopTab(it, c.tab)).length, hint: c.hint, keep: true })),
    ...counts.filter((q) => q.n > 0).map((q) => ({
      key: q.key, label: q.label, value: q.n, tone: q.tone === "neutral" ? "neutral" as const : q.tone, hint: q.why,
    })),
  ];
  if (noneImg + skuOnly > 0) {
    cards.push({ key: "noimg_erp", label: "ไม่มีรูปในระบบ", value: noneImg, tone: "warning", hint: skuOnly ? `อีก ${skuOnly.toLocaleString()} มีรูป SKU แต่ยังไม่ตั้งปก` : "ลงร้านใหม่ไม่ได้ถ้าไม่มีรูป" });
  }
  // ไม่ได้เลือกกอง → ติดสีการ์ดแท็บ (ถ้าแท็บที่เลือกในแถบซ้ายไม่ใช่ ขายอยู่/ทั้งหมด = ไม่มีใบไหนติดสี)
  const selected = value !== "none" ? value : tabKey(tab);
  return (
    <StatFilterCards cards={cards} value={selected} compact={compact}
      onChange={(k) => (k.startsWith("tab:") ? onPickTab(k.slice(4) as ShopTab) : onChange(k as QueueKey))} />
  );
}

/** คำอธิบายของกอง (โชว์เหนือตารางตอนเลือกกอง) */
export function queueWhy(k: QueueKey): string {
  if (k === "noimg_erp") return "สินค้าในระบบที่ไม่มีรูปปก — สร้างงานถ่ายรูป/ทำรูป · ตัวที่มีรูป SKU อยู่แล้ว ตั้งรูปปกได้เลย";
  return SHOP_QUEUES.find((q) => q.key === k)?.why ?? "";
}

export function queueLabel(k: QueueKey): string {
  if (k === "noimg_erp") return "ไม่มีรูปในระบบ";
  return SHOP_QUEUES.find((q) => q.key === k)?.label ?? "";
}
