import type { LineColumnConfig } from "@/components/line-item-columns";

export type OfferTemplateKey = "price_list" | "catalog_grid" | "line_mobile";
export type OfferPublicView = "table" | "grid" | "mobile";

export type OfferTemplate = {
  key: OfferTemplateKey;
  label: string;
  description: string;
  bestFor: string;
  publicView: OfferPublicView;
  columns: LineColumnConfig;
};

export const DEFAULT_OFFER_TEMPLATE_KEY: OfferTemplateKey = "price_list";

export const OFFER_TEMPLATES: OfferTemplate[] = [
  {
    key: "price_list",
    label: "ตารางราคา",
    description: "เหมาะกับส่งราคาหลายรายการให้ลูกค้าดูเร็ว อ่านง่ายเหมือนใบเสนอเดิม",
    bestFor: "ขายส่ง / B2B",
    publicView: "table",
    columns: {
      order: ["image", "product", "qty", "uom", "unit_price", "total", "note", "color", "category"],
      hidden: ["color", "category"],
      groupBy: null,
    },
  },
  {
    key: "catalog_grid",
    label: "แคตตาล็อกรูป",
    description: "เน้นรูปสินค้าและราคาต่อชิ้น ลูกค้าเปิดบนมือถือแล้วดูง่าย",
    bestFor: "เสนอสินค้าใหม่ / Lookbook",
    publicView: "grid",
    columns: {
      order: ["image", "product", "color", "qty", "unit_price", "total", "note", "category", "uom"],
      hidden: ["category", "uom"],
      groupBy: null,
    },
  },
  {
    key: "line_mobile",
    label: "LINE mobile",
    description: "หน้าแคบ กระชับ เหมาะกับส่งลิงก์ใน LINE ให้ลูกค้าไถดู",
    bestFor: "คุยขายรายวัน",
    publicView: "mobile",
    columns: {
      order: ["image", "product", "qty", "unit_price", "total", "color", "note", "category", "uom"],
      hidden: ["category", "uom", "note"],
      groupBy: null,
    },
  },
];

export const normalizeOfferTemplateKey = (value: unknown): OfferTemplateKey => {
  return OFFER_TEMPLATES.some((template) => template.key === value)
    ? (value as OfferTemplateKey)
    : DEFAULT_OFFER_TEMPLATE_KEY;
};

export const getOfferTemplate = (value: unknown): OfferTemplate => {
  const key = normalizeOfferTemplateKey(value);
  return OFFER_TEMPLATES.find((template) => template.key === key) ?? OFFER_TEMPLATES[0];
};
