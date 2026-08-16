/**
 * POST /api/book-library/parse-email — อ่านเนื้อหาอีเมล/ใบเสร็จ แล้วแยกเป็น "รายการหนังสือ"
 *
 * body: { text: string }
 * คืน:  { books: Row[], error: null }
 *
 * ทำไมใช้ AI แทนการเขียนกฎรายร้าน: เจ้าของซื้อหลายที่ปนกัน (มาร์เก็ตเพลส/ร้านหนังสือ/ต่างประเทศ)
 * รูปแบบอีเมลต่างกันหมด — เขียนกฎแยกทุกร้านจะพังทุกครั้งที่ร้านเปลี่ยนเทมเพลต
 *
 * ⚠️ ผลลัพธ์เป็น "ตัวช่วยกรอก" ไม่ใช่ข้อมูลจริง — ผู้ใช้ต้องตรวจ/แก้ในตารางก่อนกดบันทึกเสมอ
 * (ตัว route นี้ไม่เขียนอะไรลงฐานข้อมูล · บันทึกจริงไปผ่าน /api/master-v2/book_library/import ของกลาง)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { chatJson, openAiKey, productDetailModel } from "@/lib/ai-caption";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_CHARS = 20000;   // กันเมลยาวผิดปกติ/ค่า token บาน
const MAX_BOOKS = 60;
const STATUSES = new Set(["owned", "wishlist", "upcoming", "skipped"]);
const CURRENCIES = new Set(["THB", "JPY", "CNY", "USD", "EUR", "GBP", "TWD", "KRW"]);

const SYSTEM = [
  "คุณคือผู้ช่วยแยกรายการหนังสือจากอีเมลสั่งซื้อ/ใบเสร็จ/ใบยืนยันคำสั่งซื้อ",
  "อ่านข้อความที่ผู้ใช้วางมา แล้วดึงเฉพาะ 'รายการหนังสือ/การ์ตูน/นิยาย' ออกมา",
  "ตอบเป็น JSON เท่านั้น รูปแบบ: {\"books\":[{...}]} โดยแต่ละเล่มมีคีย์:",
  "title (ชื่อเรื่องเต็ม ไม่ต้องมีคำว่า 'เล่ม N' ถ้าแยก volume ได้แล้ว),",
  "series (ชื่อชุด ถ้าเป็นหนังสือชุด ไม่ใช่ก็เว้นว่าง),",
  "volume (เลขเล่ม เป็นข้อความ เช่น \"3\" ไม่ใช่ชุดก็เว้นว่าง),",
  "author (ผู้แต่ง ถ้าอีเมลไม่บอกให้เว้นว่าง ห้ามเดา),",
  "category (เช่น การ์ตูน/นิยาย/หนังสือทั่วไป ถ้าไม่แน่ใจให้เว้นว่าง),",
  "isbn, price (ตัวเลขล้วน ราคาต่อเล่ม ถ้ามีแต่ยอดรวมหลายเล่มให้เว้นว่าง),",
  "currency (THB/JPY/CNY/USD ตามสกุลในอีเมล ไม่ระบุ = THB),",
  "store (ชื่อร้าน/แพลตฟอร์มที่ซื้อ),",
  "purchased_at (วันที่สั่งซื้อ รูปแบบ YYYY-MM-DD ถ้าอีเมลเป็น พ.ศ. ให้ลบ 543),",
  "release_date (วันวางขาย ถ้าเป็นสินค้าพรีออเดอร์),",
  "buy_url (ลิงก์สินค้า ถ้ามี),",
  "status: \"owned\" ถ้าซื้อ/ชำระเงินแล้ว, \"upcoming\" ถ้าเป็นพรีออเดอร์หรือยังไม่วางขาย, \"wishlist\" ถ้าเป็นแค่รายการที่สนใจ/ตะกร้า",
  "กฎสำคัญ: ห้ามแต่งข้อมูลที่ไม่มีในข้อความ — ไม่รู้ให้เว้นว่าง",
  "ถ้าหนังสือชุดเดียวกันหลายเล่มในบิลเดียว ให้แยกเป็นหลายรายการ",
  "ถ้าไม่พบหนังสือเลย ให้ตอบ {\"books\":[]}",
].join(" ");

const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

/** วันที่ที่ใช้ได้ต้องเป็น YYYY-MM-DD จริง — AI มักตอบ "ไม่ระบุ"/รูปแบบอื่นปนมา */
function isoDate(v: unknown): string {
  const s = str(v, 40);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return "";
  const y = Number(m[1]);
  if (y < 1900 || y > 2200) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return isFinite(d.getTime()) ? s : "";
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "books.edit"); if (denied) return denied;

  if (!openAiKey()) {
    return NextResponse.json({ books: [], error: "ยังไม่ได้ตั้งค่า AI (OPENAI_API_KEY) — ติดต่อผู้ดูแลระบบ" }, { status: 200 });
  }

  let body: { text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ books: [], error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }

  const text = String(body.text ?? "").trim();
  if (text.length < 20) return NextResponse.json({ books: [], error: "ข้อความสั้นเกินไป — วางเนื้อหาอีเมลให้ครบก่อน" }, { status: 200 });

  try {
    const model = await productDetailModel();
    const out = await chatJson(SYSTEM, [{ type: "text", text: text.slice(0, MAX_CHARS) }], 2000, model);
    const raw = Array.isArray((out as { books?: unknown }).books) ? ((out as { books: unknown[] }).books) : [];

    const books = raw.slice(0, MAX_BOOKS).map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const cur = str(o.currency, 10).toUpperCase();
      const st = str(o.status, 20).toLowerCase();
      return {
        title:        str(o.title, 300),
        series:       str(o.series, 200),
        volume:       str(o.volume, 20),
        author:       str(o.author, 200),
        category:     str(o.category, 100),
        isbn:         str(o.isbn, 40),
        price:        num(o.price),
        currency:     CURRENCIES.has(cur) ? cur : "THB",
        store:        str(o.store, 150),
        purchased_at: isoDate(o.purchased_at),
        release_date: isoDate(o.release_date),
        buy_url:      /^https?:\/\//i.test(str(o.buy_url, 500)) ? str(o.buy_url, 500) : "",
        status:       STATUSES.has(st) ? st : "owned",
      };
    }).filter((b) => b.title);   // ไม่มีชื่อเรื่อง = ใช้ไม่ได้

    return NextResponse.json({ books, error: null });
  } catch (e) {
    return NextResponse.json({ books: [], error: (e as Error).message ?? "อ่านอีเมลไม่สำเร็จ" }, { status: 200 });
  }
}
