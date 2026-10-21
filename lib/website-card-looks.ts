/**
 * 🃏 ชุดหน้าตาการ์ดสินค้าสำเร็จรูป — กดทีเดียวตั้งหลายช่อง แล้วปรับต่อเองทีละช่องได้ (ของกลาง · pure · ไม่มี import)
 * ใช้ 2 ที่ (ค่าชุดเดียวกัน):
 *   - ดีไซน์ → การ์ดสินค้า (ทั้งร้าน · theme.card) — components/website-theme-panel.tsx
 *   - Section ตารางสินค้า → 🃏 การ์ดในส่วนนี้ (card* ของ Section) — lib/website-schema.ts (cardLookToSection)
 * ช่องที่ชุดตั้ง: ชื่อ-ราคาบรรทัดเดียว (infoLayout) · ช่องสีข้างชื่อ (swatchPos/swatchShape) · ความหนาราคา (priceWeight) + ช่องเดิม
 */
export type CardLookKey = "editorial" | "gallery";

export const CARD_LOOKS: { key: CardLookKey; label: string; hint: string; card: Record<string, unknown> }[] = [
  {
    key: "editorial",
    label: "ชุด A · เรียบหรู บรรทัดเดียว",
    hint: "ชื่อตัวพิมพ์ใหญ่ชิดซ้าย · ราคาชิดขวาบรรทัดเดียวกัน · พื้นรูปเทาอ่อน · ไม่มีป้าย/สต๊อก/หมวด",
    card: {
      preset: "minimal",
      infoLayout: "split",
      priceWeight: 400,
      nameUpper: true,
      nameWeight: 400,
      nameTracking: 4,
      nameSize: 85,
      priceSize: 85,
      titleLines: 1,
      align: "left",
      showBadge: false,
      showStock: false,
      showCategory: false,
      showUnit: false,
      showSwatches: false,
      showColorCount: false,
      imageBg: "#F7F7F7",
      imageFit: "contain",
      imagePad: 6,
      hover: "none",
      quickAdd: "none",
    },
  },
  {
    key: "gallery",
    label: "ชุด B · แกลเลอรี + ช่องสี",
    hint: "ลูกศรเลื่อนรูปบนการ์ด · ชื่อ + ช่องสีสี่เหลี่ยม 1 ช่อง +N · ราคาบรรทัดถัดไป · ไม่มีป้าย/สต๊อก/หมวด",
    card: {
      preset: "minimal",
      infoLayout: "stack",
      priceWeight: 400,
      nameUpper: false,
      nameWeight: 400,
      nameTracking: 0,
      nameSize: 105,
      priceSize: 100,
      titleLines: 1,
      align: "left",
      showBadge: false,
      showStock: false,
      showCategory: false,
      showUnit: false,
      showSwatches: true,
      swatchPos: "name",
      swatchShape: "square",
      swatchSwap: true,
      showColorCount: false,
      imageBg: "",
      imageFit: "cover",
      hover: "slide",
      quickAdd: "none",
    },
  },
];

/** ชุดหน้าตา (ค่าการ์ดของร้าน) → ช่อง "การ์ดในส่วนนี้" ของ Section ตารางสินค้า (เฉพาะช่องที่ Section ตั้งได้) */
export function cardLookToSection(card: Record<string, unknown>): Record<string, unknown> {
  return {
    cardUseShop: false,
    cardName: true,
    cardPrice: true,
    cardBadge: card.showBadge !== false,
    cardStock: card.showStock !== false,
    cardCategory: card.showCategory !== false,
    cardUnit: card.showUnit !== false,
    cardSwatches: card.showSwatches === true,
    cardColorCount: card.showColorCount === true,
    cardQuickAdd: card.quickAdd !== "none",
    cardTitleLines: String(card.titleLines ?? 2),
    cardAlign: card.align === "center" ? "center" : "left",
    cardInfo: card.infoLayout === "split" ? "split" : "stack",
    cardSwatchPos: card.swatchPos === "name" ? "name" : "below",
    cardSwatchShape: ["square", "rounded"].includes(String(card.swatchShape)) ? String(card.swatchShape) : "circle",
    cardPriceWeight: String(card.priceWeight ?? 600),
    cardNameUpper: card.nameUpper === true,
  };
}
