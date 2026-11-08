"use client";

/**
 * การ์ดกองงาน (มุมมองหน้าร้าน) — ปัญหาของสินค้าบนร้านที่ต้องมีคนไปทำ แต่ละกองกดแล้วกรองรายการ
 * ใช้การ์ดกลาง StatFilterCards (ไม่ทำการ์ดเอง) · กติกาว่ารายการไหนอยู่กองไหน = lib/platform-listing-health (inShopQueue)
 * โชว์เฉพาะกองที่มีของ (กองว่าง = ไม่ต้องทำ ไม่ต้องรก) · การ์ดใบแรก = "ไม่กรอง" ตามกติกาการ์ดกลาง
 */
import { StatFilterCards, type StatFilterCard } from "@/components/stat-filter-cards";
import { SHOP_QUEUES, inShopQueue, type ShopItem, type ShopParent, type ShopQueue } from "@/lib/platform-listing-health";

/** กองของรายการบนร้าน + กอง "ไม่มีรูปในระบบ" (เป็นสินค้าของเรา) · none = ไม่กรอง */
export type QueueKey = ShopQueue | "noimg_erp" | "none";

export function ShopQueues({ items, noImage, value, onChange }: {
  items: ShopItem[];
  /** สินค้าแบรนด์นี้ที่ไม่มีรูปปก (null = ยังไม่ได้เลือกแบรนด์) */
  noImage: ShopParent[] | null;
  value: QueueKey;
  onChange: (k: QueueKey) => void;
}) {
  const counts = SHOP_QUEUES.map((q) => ({ ...q, n: items.filter((it) => inShopQueue(it, q.key)).length }));
  const noneImg = noImage?.filter((p) => p.image_state === "none").length ?? 0;
  const skuOnly = noImage?.filter((p) => p.image_state === "sku_only").length ?? 0;
  const problemItems = items.filter((it) => SHOP_QUEUES.some((q) => inShopQueue(it, q.key))).length;

  const cards: StatFilterCard[] = [
    { key: "none", label: "งานที่ต้องทำ", value: problemItems + noneImg, hint: "กดการ์ดเพื่อดูรายการ" },
    ...counts.filter((q) => q.n > 0).map((q) => ({ key: q.key, label: q.label, value: q.n, tone: q.tone === "neutral" ? "neutral" as const : q.tone, hint: q.why })),
  ];
  if (noneImg + skuOnly > 0) {
    cards.push({ key: "noimg_erp", label: "ไม่มีรูปในระบบ", value: noneImg, tone: "warning", hint: skuOnly ? `อีก ${skuOnly.toLocaleString()} มีรูป SKU แต่ยังไม่ตั้งปก` : "ลงร้านใหม่ไม่ได้ถ้าไม่มีรูป" });
  }
  return <StatFilterCards cards={cards} value={value} onChange={(k) => onChange(k as QueueKey)} />;
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
