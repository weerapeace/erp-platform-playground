/**
 * ⚠️ ตัวตรวจ "ตั้งค่าวิธีส่งขัดกัน" ของแท็บ 🚚 การจัดส่ง (pure · ใช้แค่ใน ERP ไม่ต้องมิเรอร์ไปเว็บร้าน)
 *
 * ไม่แตะสูตรคิดค่าส่ง (lib/website-shipping) — แค่ดูค่าที่ตั้งไว้แล้วบอกจุดที่น่าจะพลาด ก่อนลูกค้าเจอเอง
 * เจ้าของขอ (2026-10-28) ตอนจัดหน้าแท็บการจัดส่งใหม่เป็น 2-3 ช่อง
 */
import { tr } from "@/lib/lang";
import type { ShippingConfig, ShippingMethod } from "@/lib/website-shipping";

/** error = ลูกค้าสั่งไม่ได้/เห็นผิดแน่ · warn = น่าจะพลาด · info = ยังไม่มีผล · tip = แนะนำ */
export type ShippingIssueLevel = "error" | "warn" | "info" | "tip";
/** กลุ่มช่องในหน้ารายละเอียดที่ต้องไปแก้ · all = ภาพรวมทุกวิธี */
export type ShippingIssueGroup = "customer" | "fee" | "area" | "cod" | "time" | "all";
export interface ShippingIssue {
  level: ShippingIssueLevel;
  group: ShippingIssueGroup;
  text: string;
}

/** normalizeShipping เก็บแค่ 10 วิธีแรก — หน้าตั้งค่าจึงไม่ให้เพิ่มเกินนี้ (กันวิธีที่ 11 หายเงียบตอนบันทึก) */
export const MAX_SHIPPING_METHODS = 10;

export const isSeriousIssue = (i: ShippingIssue) => i.level === "error" || i.level === "warn";

export type ShippingCheckOpts = {
  /** ร้านเปิด "รับเก็บเงินปลายทาง" (แท็บ 🏪 ข้อมูลร้าน) */
  shopCod: boolean;
  /** มีกล่องมาตรฐานให้เลือกไหม (ไม่มี = ไม่ต้องเตือนเรื่องเลือกกล่อง) */
  hasBoxes?: boolean;
};

const maxFee = (m: ShippingMethod) => (m.fee.kind === "flat" ? m.fee.amount : Math.max(0, ...m.fee.tiers.map((t) => t.fee)));

/** จุดที่ควรดูของวิธีส่ง 1 วิธี */
export function methodIssues(m: ShippingMethod, cfg: Pick<ShippingConfig, "methods" | "remotePostals">, opts: ShippingCheckOpts): ShippingIssue[] {
  const out: ShippingIssue[] = [];
  const name = m.name.trim();
  if (!name) out.push({ level: "warn", group: "customer", text: tr(`ยังไม่มีชื่อ — บันทึกแล้วระบบจะตั้งเป็น “${m.kind === "pickup" ? "รับเองที่ร้าน" : "ส่งมาตรฐาน"}” ให้`, `No name yet — on save it will be set to “${m.kind === "pickup" ? "รับเองที่ร้าน" : "ส่งมาตรฐาน"}”`) });
  else if (cfg.methods.some((x) => x.id !== m.id && x.name.trim().toLowerCase() === name.toLowerCase()))
    out.push({ level: "warn", group: "customer", text: tr("ชื่อซ้ำกับอีกวิธี — ลูกค้าแยกไม่ออกว่าต่างกันยังไง", "Same name as another method — customers can't tell them apart") });
  if (m.kind === "pickup" && !m.note.trim()) out.push({ level: "warn", group: "customer", text: tr("ยังไม่ได้บอกที่อยู่/เวลารับของ — ลูกค้าไม่รู้ว่าต้องไปรับที่ไหน", "No pickup address/time yet — customers won't know where to collect") });

  if (m.fee.kind === "tiers") {
    const t = m.fee.tiers;
    for (let i = 1; i < t.length; i++)
      if (t[i].fee < t[i - 1].fee) {
        out.push({ level: "warn", group: "fee", text: tr(`ขั้นที่ ${i + 1} ถูกกว่าขั้นก่อนหน้า — ซื้อมากขึ้นแต่ค่าส่งลดลง`, `Tier ${i + 1} is cheaper than the one before — buying more lowers the fee`) });
        break;
      }
    if (opts.hasBoxes !== false && t.some((x) => !x.box)) out.push({ level: "tip", group: "fee", text: tr("บางขั้นยังไม่ได้เลือกกล่อง — คนแพ็กจะไม่เห็นกล่องแนะนำ", "Some tiers have no box — packers won't see a suggested box") });
  }
  if (m.freeMin > 0 && maxFee(m) === 0) out.push({ level: "tip", group: "fee", text: tr("ค่าส่งเป็น 0 อยู่แล้ว ช่อง “ส่งฟรีเมื่อยอดถึง” จึงไม่มีผล", "Fee is already 0, so “Free shipping from” has no effect") });

  if (m.kind === "ship" && m.remoteFee > 0 && !cfg.remotePostals.length)
    out.push({ level: "warn", group: "area", text: tr("ตั้งบวกพื้นที่ห่างไกลไว้ แต่ยังไม่มีรหัสไปรษณีย์ในรายการ — ยังไม่บวกให้ใคร", "Remote-area surcharge is set but the postcode list is empty — no one is charged yet") });

  if (m.codAllowed && !opts.shopCod)
    out.push({ level: "info", group: "cod", text: tr("ติ๊กเก็บเงินปลายทางไว้ แต่ร้านปิด “รับเก็บเงินปลายทาง” อยู่ (แท็บ 🏪 ข้อมูลร้าน) — ยังไม่มีผล", "COD is ticked but the shop has “Accept COD” off (🏪 Shop info tab) — no effect yet") });

  if (m.kind === "ship" && m.area !== "all" && !m.cutoff)
    out.push({ level: "tip", group: "time", text: tr("ส่งเฉพาะในเมือง ลองตั้งรอบตัดส่ง — ลูกค้าจะเห็น “สั่งก่อน … ส่งวันนี้”", "City-only delivery — try a cut-off time so customers see “Order before … ships today”") });
  return out;
}

/** จุดที่ควรดูของภาพรวม (ทุกวิธีรวมกัน) */
export function shippingIssues(cfg: Pick<ShippingConfig, "methods">, opts: ShippingCheckOpts): ShippingIssue[] {
  const on = cfg.methods.filter((m) => m.enabled);
  if (!on.length) return [{ level: "error", group: "all", text: tr("ไม่มีวิธีส่งที่เปิดอยู่เลย — ลูกค้าจะสั่งซื้อไม่ได้", "No shipping method is on — customers can't order") }];
  const out: ShippingIssue[] = [];
  if (!on.some((m) => m.kind === "pickup" || m.area === "all"))
    out.push({ level: "warn", group: "all", text: tr("ทุกวิธีที่เปิดอยู่ส่งได้แค่ กทม./ปริมณฑล — ลูกค้าต่างจังหวัดจะเลือกไม่ได้", "All active methods only serve the Bangkok area — upcountry customers can't pick one") });
  if (opts.shopCod && !on.some((m) => m.codAllowed))
    out.push({ level: "warn", group: "all", text: tr("ร้านเปิดเก็บเงินปลายทาง แต่ไม่มีวิธีส่งไหนรับ — ลูกค้าจะเลือกเก็บปลายทางไม่ได้", "Shop accepts COD but no method allows it — customers can't choose COD") });
  return out;
}
