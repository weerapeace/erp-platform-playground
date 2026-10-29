/**
 * 👜 ทรงตัวอย่าง "กระเป๋าโท้ท" ของตัวประกอบสินค้า — ข้อมูลเดียวกับหน้าตัวอย่าง IG Bag Atelier
 * สร้างจากปุ่ม "สร้างทรงตัวอย่าง" ในสตูดิโอ (ปิดไว้ก่อน ลูกค้ายังไม่เห็น) · ทีมแก้ชื่อ/ราคา/สี/กติกาเป็นของจริงได้ทั้งหมด
 * ยังไม่มีรูป — อัปโหลดตามชื่อไฟล์ใน "รายการรูปที่ต้องถ่าย" แล้วพรีวิวจะเปลี่ยนจากกล่องสีเป็นรูปจริง
 */
import type { Blueprint, ConfigView, Condition } from "@/lib/product-configurator";

type Opt = [code: string, name: string, price?: number, extra?: { hex?: string; note?: string; days?: number; def?: boolean; style?: "deboss" | "gold" | "silver" | "ink" }];
const opts = (list: Opt[]) => list.map(([code, name_th, price = 0, x = {}], i) => ({
  code, name_th, name_en: null, note_th: x.note ?? null, price_delta: price, lead_days: x.days ?? 0,
  swatch_hex: x.hex ?? null, swatch_image_key: null, attrs: x.style ? { text_style: x.style } : {},
  is_default: !!x.def, sort_order: (i + 1) * 10, is_active: true,
}));
const slot = (sort: number, code: string, name_th: string, kind: "single" | "multi" | "text", step_view: ConfigView | null, options: ReturnType<typeof opts>, help_th: string | null = null, config: Record<string, unknown> = {}) => ({
  code, name_th, name_en: null, help_th, kind, required: kind === "single", step_view, config, sort_order: sort, is_active: true, options,
});
const when = (slotCode: string, ...options: string[]): Condition[] => [{ slot: slotCode, options }];
const layer = (view: ConfigView, z: number, code: string, name_th: string, depends_on: string[], show_when: Condition[] = []) => ({
  view, z_index: z, code, name_th, depends_on, show_when, recolor_slot: null, text_slot: null, config: {}, is_active: true, images: [],
});

const LEATHER = ["NOIR", "COGNAC", "TAN", "TAUPE", "OLIVE", "NAVY", "BURGUNDY", "IVORY"];

export function sampleToteBlueprint(): Blueprint {
  return {
    model: {
      code: "TOTE", name_th: "กระเป๋าโท้ท", name_en: "Tote", description: "ใส่เอกสาร A4 และโน้ตบุ๊ก 14 นิ้วได้", size_text: "38 × 30 × 14 ซม.",
      base_price: 4900, lead_days: 10, views: ["front", "back", "inside"], canvas: { w: 3000, h: 3000 },
      view_config: { front: { ground_y: 0.88, cm_px: 47.6 }, back: { ground_y: 0.88, cm_px: 47.6 }, inside: { ground_y: 0.97 } },
      cover_image_key: null, sort_order: 10, is_active: false,
    },
    slots: [
      slot(10, "MATERIAL", "วัสดุ", "single", "front", opts([
        ["PEBBLE", "หนังวัวลายเม็ด", 0, { note: "ทนรอยขีดข่วน ใช้ได้ทุกวัน", def: true }],
        ["SMOOTH", "หนังเรียบขัดเงา", 300, { note: "ผิวเนียน เงาสวย ดูเป็นทางการ" }],
        ["SUEDE", "หนังกลับ", 500, { note: "สัมผัสนุ่ม ผิวด้าน ควรเลี่ยงน้ำ", days: 2 }],
        ["CROC", "หนังปั๊มลายจระเข้", 1200, { note: "ลายนูนพรีเมียม", days: 4 }],
      ])),
      slot(20, "COLOR", "สี", "single", "front", opts([
        ["NOIR", "ดำ", 0, { hex: "#1f1d1c", def: true }], ["COGNAC", "น้ำตาลคอนยัค", 0, { hex: "#7d4220" }], ["TAN", "น้ำตาลอ่อน", 0, { hex: "#b07444" }],
        ["TAUPE", "เทาอมน้ำตาล", 0, { hex: "#8b7c6c" }], ["OLIVE", "เขียวมะกอก", 0, { hex: "#5a5d37" }], ["NAVY", "กรมท่า", 0, { hex: "#24314b" }],
        ["BURGUNDY", "แดงเบอร์กันดี", 0, { hex: "#5d1e2b" }], ["IVORY", "ขาวงาช้าง", 0, { hex: "#e7ddcc" }],
        ["SAND", "สีทราย", 0, { hex: "#c1a17b" }], ["TOBACCO", "น้ำตาลยาสูบ", 0, { hex: "#6c4a30" }],
      ]), "สีบนจอใกล้เคียงของจริงแต่ไม่ตรง 100% ขอตัวอย่างหนังได้ฟรี"),
      slot(30, "ZIP", "ซิปและการปิด", "single", "front", opts([
        ["COIL", "ซิปไนลอน", 0, { note: "เรียบ เบา เสียงเงียบ", def: true }],
        ["METAL", "ซิปฟันโลหะ", 200, { note: "ฟันซิปเป็นสีเดียวกับอะไหล่" }],
        ["MAGNET", "ไม่มีซิป · กระดุมแม่เหล็ก", 0, { note: "เปิดปิดเร็ว หยิบของง่าย" }],
      ])),
      slot(40, "STRAP", "สาย", "single", "front", opts([
        ["HANDLES", "หูหิ้วหนัง", 0, { note: "ถือด้วยมือหรือคล้องแขน", def: true }],
        ["SHOULDER", "สายสะพายหนัง ปรับความยาวได้", 600],
        ["WEBBING", "สายผ้าทอลายริ้ว", 450, { note: "กว้าง 4 ซม. สะพายสบายไหล่" }],
      ])),
      slot(50, "METAL", "สีโลหะ", "single", "front", opts([
        ["SILVER", "เงิน", 0, { hex: "#c9ced4", def: true }], ["GOLD", "ทอง", 200, { hex: "#d3a547" }],
        ["BRASS", "ทองเหลืองรมดำ", 200, { hex: "#a6824a" }], ["GUNMETAL", "ดำด้าน", 300, { hex: "#62656b" }],
      ]), "ใช้กับทุกชิ้นพร้อมกัน ทั้งหัวซิป ห่วง ตะขอ หมุด และป้าย"),
      slot(60, "EXTRAS", "ของตกแต่ง", "multi", "front", opts([
        ["FEET", "หมุดรองก้น", 120, { note: "กันก้นกระเป๋าถลอกเวลาวาง" }],
        ["PLATE", "ป้ายโลโก้โลหะ", 250], ["CHARM", "พู่หนังห้อย", 350],
      ])),
      slot(70, "LINING", "ซับใน", "single", "inside", opts([
        ["CREAM", "ครีม", 0, { hex: "#e9dfc8", def: true }], ["STONE", "เทาหิน", 0, { hex: "#a19f95" }], ["NAVY", "กรมท่า", 0, { hex: "#2c3652" }],
        ["WINE", "ไวน์แดง", 0, { hex: "#6b2433" }], ["MUSTARD", "มัสตาร์ด", 0, { hex: "#c4922f" }], ["MONOGRAM", "ลายโมโนแกรม IG", 250, { hex: "#3a2e25", days: 2 }],
      ])),
      slot(80, "INNER", "ช่องเก็บของ", "multi", "inside", opts([
        ["ZIPPOCKET", "ช่องซิปด้านใน", 250], ["CARDS", "ช่องใส่บัตร 3 ช่อง", 200], ["LEASH", "สายคล้องกุญแจ", 150], ["BACKPOCKET", "ช่องเสียบด้านหลัง", 300],
      ]), "มีช่องใส่มือถือให้ทุกใบ"),
      slot(90, "STAMP", "ปั๊มชื่อย่อ", "text", "front", [], "ปั๊มด้านหน้ากระเป๋า ฟรี", { max_chars: 6, charset: "latin", auto_upper: true, placeholder: "เช่น P.K" }),
      slot(100, "STAMP-STYLE", "แบบการปั๊ม", "single", "front", opts([
        ["DEBOSS", "ปั๊มจม", 0, { style: "deboss", def: true }], ["GOLD", "ฟอยล์ทอง", 0, { style: "gold", hex: "#d3a547" }], ["SILVER", "ฟอยล์เงิน", 0, { style: "silver", hex: "#c9ced4" }],
      ])),
    ],
    layers: [
      layer("front", 10, "SHADOW", "เงาพื้น", []),
      layer("front", 20, "HANDLE-FAR", "หูหิ้วชิ้นหลัง", ["COLOR"], when("STRAP", "HANDLES")),
      layer("front", 21, "STRAP-LEATHER", "สายสะพายหนัง", ["COLOR"], when("STRAP", "SHOULDER")),
      layer("front", 22, "STRAP-WEBBING", "สายผ้า", [], when("STRAP", "WEBBING")),
      layer("front", 30, "BODY", "ตัวกระเป๋า", ["MATERIAL", "COLOR"]),
      layer("front", 40, "ZIP", "ซิป / กระดุม", ["ZIP", "METAL"]),
      layer("front", 50, "HANDLE-NEAR", "หูหิ้วชิ้นหน้า", ["COLOR"], when("STRAP", "HANDLES")),
      layer("front", 51, "STRAP-TABS", "หนังหุ้มปลายสาย", ["COLOR"], when("STRAP", "SHOULDER", "WEBBING")),
      layer("front", 60, "RIVETS", "หมุดยึดหูหิ้ว", ["METAL"], when("STRAP", "HANDLES")),
      layer("front", 61, "RINGS", "ห่วงและตะขอสาย", ["METAL"], when("STRAP", "SHOULDER", "WEBBING")),
      layer("front", 62, "FEET", "หมุดรองก้น", ["METAL"], when("EXTRAS", "FEET")),
      layer("front", 63, "PLATE", "ป้ายโลโก้", ["METAL"], when("EXTRAS", "PLATE")),
      layer("front", 64, "CHARM", "ห่วงพู่", ["METAL"], when("EXTRAS", "CHARM")),
      layer("front", 65, "TASSEL", "พู่หนัง", ["COLOR"], when("EXTRAS", "CHARM")),
      { ...layer("front", 90, "STAMP", "ตัวอักษรปั๊ม", []), text_slot: "STAMP", config: { text: { x: 0.5, y: 0.71, size: 0.045, style_slot: "STAMP-STYLE", letter_spacing: 0.16 } } },
      layer("back", 10, "SHADOW", "เงาพื้น", []),
      layer("back", 20, "HANDLE-FAR", "หูหิ้วชิ้นหลัง", ["COLOR"], when("STRAP", "HANDLES")),
      layer("back", 21, "STRAP-LEATHER", "สายสะพายหนัง", ["COLOR"], when("STRAP", "SHOULDER")),
      layer("back", 22, "STRAP-WEBBING", "สายผ้า", [], when("STRAP", "WEBBING")),
      layer("back", 30, "BODY", "ตัวกระเป๋าด้านหลัง", ["MATERIAL", "COLOR"]),
      layer("back", 40, "ZIP", "ซิป / กระดุม", ["ZIP", "METAL"]),
      layer("back", 45, "POCKET", "ช่องเสียบด้านหลัง", ["MATERIAL", "COLOR"], when("INNER", "BACKPOCKET")),
      layer("back", 50, "HANDLE-NEAR", "หูหิ้วชิ้นหน้า", ["COLOR"], when("STRAP", "HANDLES")),
      layer("back", 51, "STRAP-TABS", "หนังหุ้มปลายสาย", ["COLOR"], when("STRAP", "SHOULDER", "WEBBING")),
      layer("back", 60, "RIVETS", "หมุดยึดหูหิ้ว", ["METAL"], when("STRAP", "HANDLES")),
      layer("back", 61, "RINGS", "ห่วงและตะขอสาย", ["METAL"], when("STRAP", "SHOULDER", "WEBBING")),
      layer("back", 62, "FEET", "หมุดรองก้น", ["METAL"], when("EXTRAS", "FEET")),
      layer("inside", 10, "SHADOW", "เงาพื้น", []),
      layer("inside", 20, "SHELL", "ตัวกระเป๋า (มองจากด้านบน)", ["MATERIAL", "COLOR"]),
      layer("inside", 30, "LINING", "ซับใน", ["LINING"]),
      layer("inside", 40, "PHONE-POCKET", "ช่องใส่มือถือ", ["LINING"]),
      layer("inside", 41, "ZIP-POCKET", "ช่องซิปด้านใน", ["LINING"], when("INNER", "ZIPPOCKET")),
      layer("inside", 42, "ZIP-POCKET-PULL", "หัวซิปช่องใน", ["METAL"], when("INNER", "ZIPPOCKET")),
      layer("inside", 43, "CARD-SLOTS", "ช่องใส่บัตร", ["COLOR"], when("INNER", "CARDS")),
      layer("inside", 50, "KEY-LEASH", "สายคล้องกุญแจ", ["COLOR"], when("INNER", "LEASH")),
      layer("inside", 51, "KEY-CLIP", "ตะขอกุญแจ", ["METAL"], when("INNER", "LEASH")),
      layer("inside", 60, "ZIP", "ซิปรอบปากกระเป๋า", ["ZIP", "METAL"]),
    ],
    rules: [
      { kind: "only", if_slot: "MATERIAL", if_options: ["PEBBLE", "SMOOTH"], then_slot: "COLOR", then_options: LEATHER, reason_th: "หนังวัวมี 8 สี", sort_order: 10, is_active: true },
      { kind: "only", if_slot: "MATERIAL", if_options: ["SUEDE"], then_slot: "COLOR", then_options: ["SAND", "TOBACCO", "OLIVE", "NAVY", "BURGUNDY"], reason_th: "หนังกลับมี 5 สี", sort_order: 20, is_active: true },
      { kind: "only", if_slot: "MATERIAL", if_options: ["CROC"], then_slot: "COLOR", then_options: ["NOIR", "BURGUNDY", "COGNAC"], reason_th: "ลายจระเข้มี 3 สี", sort_order: 30, is_active: true },
      { kind: "block", if_slot: "MATERIAL", if_options: ["CROC"], then_slot: "STRAP", then_options: ["WEBBING"], reason_th: "ลายจระเข้ไม่เข้ากับสายผ้า", sort_order: 40, is_active: true },
    ],
  };
}
