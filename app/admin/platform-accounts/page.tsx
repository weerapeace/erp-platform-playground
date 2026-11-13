"use client";

// จัดการร้าน/บัญชีแพลตฟอร์ม ต่อแบรนด์ — แต่ละแบรนด์มีร้านของตัวเองต่อแพลตฟอร์ม
// ตั้งชื่อร้าน + shop id + เปิด/ปิด · ใช้ตอน publish เพื่อเลือกร้านตามแบรนด์ของสินค้า
// หน้าตาแบบ ค. (เจ้าของเลือก 2026-11-05): ซ้าย = รายการแพลตฟอร์ม (แบ่ง เชื่อมต่ออัตโนมัติได้ / ร้านและช่องทางอื่น) · ขวา = รายละเอียดแพลตฟอร์มที่เลือก
//   จอแคบ = เห็นรายการก่อน → กดเข้ารายละเอียด (มีปุ่มย้อนกลับ) · โทนมินิมอล ดำ/เทา/ขาว ใช้สีเฉพาะจุดสถานะ

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { ERPInput } from "@/components/form";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth } from "@/components/auth";
import { AppAccessGate } from "@/components/app-access-gate";
import { PlatformIcon } from "@/components/platform-icon";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { capsOf } from "@/lib/social-publish/capabilities";
import { BackButton } from "@/components/back-button";
import { formatDateTime } from "@/lib/date";
import { platformShopUrl } from "@/lib/platform-links";
import { LazadaAppPanel } from "./lazada-app-panel";

type Platform ={ id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string; color: string | null; hidden?: boolean; shop_count?: number };
type Account = { label: string | null; external_shop_id: string | null; is_active: boolean; tax_invoice_company_id?: string | null };
type Company = { id: string; name: string; company_code: string | null };
type Msg = { text: string; bad?: boolean } | null;
// ร้านขายของที่ออกใบกำกับภาษีจากศูนย์ออเดอร์ได้ (เว็บร้านตั้งบริษัทที่ ข้อมูลร้าน › 🧾 แยกอยู่แล้ว)
const INVOICE_CODES = ["shopee", "lazada", "line_shopping", "tiktok"];
type PostStat = { posted30: number; queued: number; failed: number; next_run_at: string | null; last_posted_at: string | null };

// แพลตฟอร์มที่ระบบเชื่อมบัญชีได้จริง (OAuth / API Key) — ขึ้นกลุ่มบนสุด
const AUTO_CODES = ["facebook", "instagram", "lazada", "tiktok", "shopee", "line_shopping"];

// ลิงก์หน้าร้านจากค่าที่กรอก (ลิงก์เต็ม / @handle) — ของกลาง lib/platform-links (ลิงก์สินค้า/หลังร้านของลิ้นชักสินค้าบนร้านใช้ตัวเดียวกัน)
const shopUrlOf = platformShopUrl;

// ── วิธีตั้งต่อแพลตฟอร์ม (โชว์ในกล่องตอนยังไม่ตั้ง + ปุ่ม "วิธีตั้ง" บนหัวรายละเอียด) ──
// เพิ่มแพลตฟอร์มใหม่ → เพิ่มที่นี่ (ไม่มี = ใช้ GUIDE_DEFAULT)
type Guide = { intro?: ReactNode; steps: ReactNode[]; notes?: ReactNode[]; link?: { href: string; label: string }; shopPh?: string };
const C = ({ children }: { children: ReactNode }) => <span className="font-mono text-[12px] bg-slate-100 px-1 rounded">{children}</span>;
const EDIT_FIRST = <>กด <b>แก้ไขข้อมูลร้าน</b> → ช่อง “ชื่อร้าน” ตั้งชื่อที่ทีมเรียก (ไม่ต้องตรงกับบนแอป)</>;
const SAVE_ON = <>กด <b>บันทึก</b> แล้วเปิดสวิตช์ <b>เปิดใช้งาน</b> → กด “เปิดหน้าร้าน” ด้านบนเช็กว่าไปถูกร้าน</>;
const GUIDE_DEFAULT: Guide = {
  steps: [EDIT_FIRST, <>ช่อง “Shop ID / ลิงก์ร้าน” วาง<b>ลิงก์หน้าร้านเต็ม</b> (ขึ้นต้น https://) หรือ <C>@ชื่อผู้ใช้</C></>, SAVE_ON],
};
const GUIDE: Record<string, Guide> = {
  facebook: {
    intro: "เชื่อมครั้งเดียว — ระบบเติมชื่อร้านและลิงก์เพจให้เอง",
    steps: [
      <>กด <b>เชื่อมต่อ Facebook</b> ในส่วน “การเชื่อมต่อ” ด้านล่าง</>,
      <>เข้าสู่ระบบด้วยบัญชี Facebook ที่เป็น<b>แอดมินเพจ</b>ของแบรนด์นี้</>,
      <>กดอนุญาตทุกข้อ (มี Instagram ให้ติ๊กด้วย) แล้วเลือก<b>เพจของแบรนด์นี้</b></>,
      <>กลับมาหน้านี้ — ชื่อร้าน + ลิงก์เพจขึ้นเอง และโพสต์จากหน้าคอนเทนต์ได้เลย</>,
    ],
    notes: [
      <>บัญชีที่ใช้กดต้องไม่ติด<b>ด่านตรวจสอบ</b>ของ Facebook — ถ้าติด ให้เข้า facebook.com เคลียร์ก่อนแล้วกดเชื่อมใหม่</>,
      <>โพสต์ขึ้นแต่คนอื่นไม่เห็น = แอป Meta ยังอยู่<b>โหมด Development</b> ต้องสลับเป็น Live ที่ developers.facebook.com</>,
    ],
  },
  instagram: {
    intro: "Instagram โพสต์ผ่านเพจ Facebook — ใช้การเชื่อมต่อเดียวกัน",
    steps: [
      <>บัญชี IG ของแบรนด์ต้องเป็น<b>บัญชีมืออาชีพ</b> (ธุรกิจหรือครีเอเตอร์) — ในแอป IG: ตั้งค่า › ประเภทบัญชีและเครื่องมือ</>,
      <>ผูก IG กับ<b>เพจ Facebook ของแบรนด์</b> ใน Meta Business Suite › ตั้งค่า › บัญชี Instagram</>,
      <>ไปที่ <b>Facebook</b> ในหน้านี้แล้วกดเชื่อมต่อ (ตอนอนุญาตให้ติ๊ก Instagram ด้วย)</>,
      <>ระบบเติมชื่อร้าน + ลิงก์ <C>instagram.com/ชื่อผู้ใช้</C> ให้เอง</>,
    ],
  },
  lazada: {
    steps: [
      <>กด <b>เชื่อมต่อ Lazada</b> ในส่วน “การเชื่อมต่อ” ด้านล่าง</>,
      <>เข้าสู่ระบบ <b>Lazada Seller Center</b> ด้วยบัญชีร้านของแบรนด์นี้ แล้วกดอนุญาต</>,
      <>กลับมาหน้านี้ — ระบบเติมชื่อร้านให้เอง</>,
      <>ลิงก์ร้าน: เปิดร้านบนแอป Lazada › แชร์ › คัดลอกลิงก์ → กด <b>แก้ไขข้อมูลร้าน</b> วางในช่อง “Shop ID / ลิงก์ร้าน”</>,
    ],
    notes: [<>Lazada ให้สิทธิ์ทีละ ~30 วัน ระบบต่ออายุให้ทุกวัน — ถ้าขึ้น “หมดอายุ” ให้กดเชื่อมใหม่</>],
    shopPh: "วางลิงก์ร้านจากแอป Lazada",
  },
  line_shopping: {
    steps: [
      EDIT_FIRST,
      <>ช่อง “Shop ID / ลิงก์ร้าน”: เปิดร้านบน LINE SHOPPING แล้วคัดลอกลิงก์ <C>https://shop.line.me/@ไอดีร้าน</C> (ระบบใช้ทำลิงก์สินค้า)</>,
      <>ขอ API Key จาก oaplus.line.biz แล้ววางในส่วน “API Key” ด้านล่าง (กด “วิธีขอ API Key” ดูทีละขั้น)</>,
      <>กด <b>ทดสอบการเชื่อมต่อ</b> ให้ขึ้น “เชื่อมต่อสำเร็จ”</>,
    ],
    shopPh: "https://shop.line.me/@ไอดีร้าน",
  },
  shopee: {
    steps: [
      EDIT_FIRST,
      <>เปิดหน้าร้านของแบรนด์บนแอป Shopee › กด <b>แชร์</b> › <b>คัดลอกลิงก์</b> (หรือเปิดร้านบนเว็บ shopee.co.th แล้วก๊อปลิงก์จากช่องที่อยู่)</>,
      <>วางในช่อง “Shop ID / ลิงก์ร้าน” — ใส่แค่ชื่อผู้ใช้ร้านก็ได้ เช่น <C>louismontini</C> (เชื่อมต่อแล้วระบบเติมรหัสร้านตัวเลขให้เองถ้าช่องว่าง)</>,
      SAVE_ON,
      <>เชื่อมร้านกับระบบ: กด <b>เชื่อมต่อ Shopee</b> ในส่วน “การเชื่อมต่อ” ด้านล่าง → เข้าสู่ระบบด้วย<b>บัญชีหลักของร้าน</b> (ไม่ใช่บัญชีย่อย) + รหัส OTP → เลือกอายุสิทธิ์ <b>365 วัน</b> → Confirm Authorization</>,
    ],
    notes: [
      <>ก่อนกดเชื่อม แอปใน Shopee Open Platform ต้อง <b>Go Live ผ่านแล้ว</b> และใส่ <C>SHOPEE_PARTNER_ID</C> / <C>SHOPEE_PARTNER_KEY</C> / <C>SHOPEE_ENV=live</C> ใน Vercel (Shopee เปิด API ให้เฉพาะร้าน Mall / Managed Seller — ร้าน IG ยังไม่ผ่าน)</>,
      <>กุญแจ Shopee อยู่ได้ 4 ชม. ระบบต่ออายุให้เองตอนใช้งาน + ทุกเช้า 07:30 (ตัวต่ออายุอยู่ได้ 30 วัน) · สิทธิ์ที่ร้านให้อยู่ได้ไม่เกิน 365 วัน ครบแล้วต้องกดเชื่อมใหม่</>,
    ],
    shopPh: "ลิงก์ร้าน หรือ ชื่อผู้ใช้ร้าน",
  },
  tiktok: {
    steps: [
      EDIT_FIRST,
      <>เปิดโปรไฟล์ TikTok ของแบรนด์ › ดู <b>@ชื่อผู้ใช้</b> ใต้รูปโปรไฟล์ (หรือแชร์โปรไฟล์ › คัดลอกลิงก์)</>,
      <>วาง <C>@ชื่อผู้ใช้</C> หรือลิงก์โปรไฟล์ในช่อง “Shop ID / ลิงก์ร้าน”</>,
      SAVE_ON,
      <>ร้าน TikTok Shop: กด <b>เชื่อมต่อ TikTok Shop</b> ในส่วน “การเชื่อมต่อ” ด้านล่าง → เข้าสู่ระบบ Seller Center ด้วยบัญชีร้านของแบรนด์นี้ แล้วกดอนุญาต (เลือกอายุสิทธิ์ยาวที่สุด)</>,
    ],
    notes: [
      <>ก่อนกดเชื่อม แอปใน TikTok Shop Partner Center ต้อง<b>ผ่านการตรวจและกดเผยแพร่แล้ว</b> — แอปที่ยังเป็นฉบับร่าง ร้านจริงกดอนุญาตไม่ได้ (คู่มือ: <C>_exports/คู่มือสมัคร-TikTok-Shop-API.md</C>)</>,
      <>1 แอป = 1 ร้าน · กุญแจ TikTok อยู่ได้ ~7 วัน ระบบต่ออายุให้เองตอนใช้งาน</>,
      <>โพสต์คลิป TikTok อัตโนมัติยังไม่เปิด — อยู่ในแผนคิวโพสต์ก้อนถัดไป</>,
    ],
    shopPh: "@ชื่อผู้ใช้ TikTok",
  },
  website: {
    steps: [
      EDIT_FIRST,
      <>ช่อง “Shop ID / ลิงก์ร้าน” ใส่<b>ลิงก์เต็ม</b>ของเว็บ ขึ้นต้นด้วย <C>https://</C></>,
      SAVE_ON,
    ],
    shopPh: "https://www.ชื่อเว็บ.com",
  },
  line_oa: {
    steps: [
      EDIT_FIRST,
      <>เปิด LINE Official Account Manager (manager.line.biz) › เลือกบัญชีของแบรนด์ › ดู<b>ไอดีบัญชี</b>ที่ขึ้นต้นด้วย @</>,
      <>วาง <C>@ไอดีบัญชี</C> ในช่อง “Shop ID / ลิงก์ร้าน”</>,
      SAVE_ON,
    ],
    link: { href: "https://manager.line.biz", label: "เปิด manager.line.biz" },
    shopPh: "@ไอดีบัญชี LINE OA",
  },
  youtube: {
    steps: [
      EDIT_FIRST,
      <>เปิดช่อง YouTube ของแบรนด์ › ดู <b>@แฮนเดิล</b> ใต้ชื่อช่อง</>,
      <>วาง <C>@แฮนเดิล</C> ในช่อง “Shop ID / ลิงก์ร้าน”</>,
      SAVE_ON,
    ],
    notes: [<>โพสต์ YouTube Shorts อัตโนมัติอยู่ในแผนคิวโพสต์ก้อนถัดไป</>],
    shopPh: "@แฮนเดิลช่อง",
  },
  pinterest: {
    steps: [
      EDIT_FIRST,
      <>เปิดโปรไฟล์ Pinterest ของแบรนด์ — ชื่อผู้ใช้คือคำท้ายลิงก์ <C>pinterest.com/ชื่อผู้ใช้</C></>,
      <>วางชื่อผู้ใช้หรือลิงก์โปรไฟล์ในช่อง “Shop ID / ลิงก์ร้าน”</>,
      SAVE_ON,
    ],
    shopPh: "ชื่อผู้ใช้ Pinterest",
  },
  x: {
    steps: [
      EDIT_FIRST,
      <>เปิดโปรไฟล์ X ของแบรนด์ › ดู <b>@ชื่อผู้ใช้</b> ใต้ชื่อ</>,
      <>วาง <C>@ชื่อผู้ใช้</C> ในช่อง “Shop ID / ลิงก์ร้าน”</>,
      SAVE_ON,
    ],
    notes: [<>X ใช้โพสต์แบบกดเอง — ระบบเตรียมแคปชั่นให้คัดลอก</>],
    shopPh: "@ชื่อผู้ใช้ X",
  },
};
const guideOf = (code: string): Guide => GUIDE[code] ?? GUIDE_DEFAULT;
// คู่มือขอ API Key ของ LINE SHOPPING (เปิดจากส่วน API Key)
const LINE_KEY_GUIDE: Guide = {
  intro: "ทำครั้งเดียวต่อร้าน — คัดลอกคีย์มาวางในช่อง “API Key” แล้วกดบันทึก + ทดสอบการเชื่อมต่อ",
  steps: [
    <>เข้า oaplus.line.biz แล้ว<b>ล็อกอิน</b>ด้วยบัญชี LINE ที่เป็นเจ้าของร้าน (ต้องเป็น<b>แอดมินร้าน</b>)</>,
    <>เลือก<b>ร้าน/บัญชี (Channel)</b> ที่ต้องการ › เมนู <b>“อีคอมเมิร์ซ” (E-Commerce)</b></>,
    <>ไปที่ <b>“ตั้งค่าร้านค้า” (Shop settings)</b> › หัวข้อ <b>“Open API”</b></>,
    <>เข้าเมนู <b>“จัดการ API Keys” (Manage API Keys)</b></>,
    <>กด <b>+ Generate</b> › ตั้งชื่อกำกับ (เช่น <C>ERP</C>) › กด <b>Generate</b></>,
    <><b>คัดลอกคีย์</b>ที่ได้ › กลับมาวางในช่อง “API Key” ที่นี่ › <b>บันทึกคีย์</b> › <b>ทดสอบการเชื่อมต่อ</b></>,
  ],
  notes: [
    <>คีย์จะโชว์ให้<b>คัดลอกทันทีที่สร้าง</b> — ถ้าไม่ได้ก๊อป ต้องสร้างใหม่</>,
    <>สร้างได้สูงสุด <b>10 คีย์</b>ต่อร้าน · ถ้าไม่เจอเมนู Open API อาจต้องเปิดใช้ MyShop/แพ็กเกจร้านก่อน</>,
    <>ระบบเก็บคีย์แบบ<b>เข้ารหัส</b> — ไม่มีใครเห็นค่าคีย์อีก</>,
  ],
  link: { href: "https://oaplus.line.biz", label: "เปิด oaplus.line.biz" },
};

/** ขั้นตอนแบบมีเลขกำกับ + ข้อควรรู้ (ใช้ทั้งกล่องในหน้าและป๊อป) */
function GuideSteps({ g, compact }: { g: Guide; compact?: boolean }) {
  return (
    <div className={`space-y-3 ${compact ? "text-[13px]" : "text-sm"} text-slate-700`}>
      {g.intro && <p className="text-slate-500">{g.intro}</p>}
      <ol className="space-y-2">
        {g.steps.map((li, i) => (
          <li key={i} className="flex gap-3"><span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] flex items-center justify-center">{i + 1}</span><span>{li}</span></li>
        ))}
      </ol>
      {!!g.notes?.length && (
        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[12.5px] text-slate-500">
          {g.notes.map((n, i) => <p key={i}>• {n}</p>)}
        </div>
      )}
    </div>
  );
}

// ── ชิ้นส่วนหน้าตา (ประกาศนอก component หลัก กัน remount ทุก render) ──
type Tone = "ok" | "warn" | "bad" | "on" | "off";
const DOT: Record<Tone, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500", on: "bg-slate-900", off: "bg-slate-300" };
const Dot = ({ tone }: { tone: Tone }) => <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${DOT[tone]}`} />;
const BTN_DARK = "h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40";
const BTN_LINE = "h-9 px-3.5 inline-flex items-center gap-1.5 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40";
const LINK_DANGER = "text-xs text-rose-600 hover:underline";

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{title}</p>
      {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
/** แถบสถานะการเชื่อมต่อ (พื้นเทาอ่อน) — จุดสี + ข้อความ + ปุ่มด้านขวา */
function StatusBar({ tone, children, actions }: { tone: Tone; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Dot tone={tone} />
      <div className="text-sm text-slate-700 min-w-0 flex-1">{children}</div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
/** กล่องเตือน (แดง/เหลือง) แบบเรียบ */
function Note({ tone = "warn", children }: { tone?: "warn" | "bad"; children: ReactNode }) {
  return (
    <p className={`text-xs rounded-xl px-4 py-3 inline-flex items-start gap-2 ${tone === "bad" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
      <Icon name="warning" className="mt-0.5 shrink-0" /><span>{children}</span>
    </p>
  );
}

export default function PlatformAccountsPage() {
  const { can } = useAuth();
  const canManage = can("products.platforms.manage_accounts");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({});   // brand id → โลโก้ (R2 key จาก /api/brands)
  const [brandId, setBrandId] = useState("");
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [keys, setKeys] = useState<Record<string, boolean>>({});   // platform_id → มี API Key ไหม
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<Msg>(null);
  const [guideFor, setGuideFor] = useState<string | null>(null);   // ป๊อปวิธีตั้ง: code แพลตฟอร์ม · "line_key" = วิธีขอ API Key ของ LINE SHOPPING
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, PostStat>>({});   // ภาพรวมการโพสต์ 30 วัน ต่อ code แพลตฟอร์ม
  const [loadedFor, setLoadedFor] = useState("");   // ข้อมูลบนจอเป็นของแบรนด์ไหน (กันใช้ข้อมูลแบรนด์เก่าตอนสลับ)
  const autoTried = useRef<Set<string>>(new Set());   // แบรนด์ที่ลองเติมชื่อร้านจากการเชื่อมต่อแล้ว (ครั้งเดียวต่อการเปิดหน้า)
  const [msg, setMsg] = useState<Msg>(null);
  const [editPlat, setEditPlat] = useState<string | null>(null);   // แพลตฟอร์มที่กำลังแก้ (ชื่อร้าน/Shop ID) — กันเผลอพิมพ์
  const [editKey, setEditKey] = useState<string | null>(null);      // แพลตฟอร์มที่กำลังแก้ API Key (มีคีย์แล้ว = อ่านอย่างเดียวจนกดแก้)
  const [clearKeyFor, setClearKeyFor] = useState<string | null>(null);  // แพลตฟอร์มที่กำลังยืนยัน "ล้างคีย์"
  const [confirmDisc, setConfirmDisc] = useState<"facebook" | "lazada" | "tiktok" | "shopee" | null>(null);   // ยืนยันตัดการเชื่อมต่อ
  const [sel, setSel] = useState<string | null>(null);   // แพลตฟอร์มที่เลือกดูรายละเอียด (platform id)
  const [mobileDetail, setMobileDetail] = useState(false);   // จอแคบ: อยู่หน้ารายละเอียดไหม
  const wantCode = useRef<string | null>(null);   // กลับจาก OAuth → เปิดแพลตฟอร์มนั้นให้เลย
  // สถานะเชื่อมต่อ Facebook (Meta) ต่อแบรนด์
  type FbStatus = { connected: boolean; stage: string; page_name: string | null; pages: { id: string; name: string; ig: boolean }[]; problem?: string | null };
  const [fb, setFb] = useState<FbStatus>({ connected: false, stage: "none", page_name: null, pages: [] });
  const [fbHasIg, setFbHasIg] = useState(false);
  const [metaCfg, setMetaCfg] = useState(true);   // ตั้งค่า META_APP_ID/SECRET ในโฮสต์แล้วไหม
  const [pickPage, setPickPage] = useState("");   // เพจที่เลือก (กรณีมีหลายเพจ)
  // สถานะเชื่อมต่อ Lazada ต่อแบรนด์
  // health: expired = หมดอายุแล้วต้องเชื่อมใหม่ · expiring = เหลือ ≤ 7 วัน (ตัวต่ออายุอัตโนมัติรายวัน /api/cron/lazada-token)
  // own_app = แอป Lazada ที่แบรนด์สมัครเอง (null = แอปกลาง) · app_locked = เชื่อมร้านอยู่ เปลี่ยนแอปไม่ได้
  type LazStatus = { connected: boolean; health?: "none" | "connected" | "expiring" | "expired"; days_left?: number | null; seller_id: string | null; short_code: string | null; country: string | null; configured: boolean; own_app?: { app_key: string; secret_ok: boolean } | null; default_app_ready?: boolean; app_locked?: boolean };
  const [laz, setLaz] = useState<LazStatus>({ connected: false, seller_id: null, short_code: null, country: null, configured: true });
  const [lazSyncing, setLazSyncing] = useState(false);
  // สถานะเชื่อมต่อ TikTok Shop ต่อแบรนด์ (/api/tiktok-shop/status) — problem = ผลจากการกด "ตรวจการเชื่อมต่อ" (ลองกับ TikTok จริง)
  type TtsStatus = { configured: boolean; connected: boolean; health?: "none" | "connected" | "expiring" | "expired"; days_left?: number | null; seller_name: string | null; region: string | null; shops: { name: string; region: string | null; code: string | null }[]; checked?: boolean; problem?: string | null; brand_mismatch?: { seller_name: string; brand_name: string } | null };
  const [tts, setTts] = useState<TtsStatus>({ configured: true, connected: false, seller_name: null, region: null, shops: [] });
  const [ttsChecking, setTtsChecking] = useState(false);
  // สถานะเชื่อมต่อ Shopee ต่อแบรนด์ (/api/shopee/status) — days_left = วันที่ต้องเชื่อมใหม่ (ตัวต่ออายุ 30 วัน หรือสิทธิ์ร้าน ≤365 วัน ตัวไหนหมดก่อน)
  type ShpStatus = { configured: boolean; env?: "live" | "sandbox"; connected: boolean; health?: "none" | "connected" | "expiring" | "expired"; days_left?: number | null; auth_days_left?: number | null; shop_id: string | null; shop_name: string | null; region: string | null; checked?: boolean; problem?: string | null; brand_mismatch?: { shop_name: string; brand_name: string } | null };
  const [shp, setShp] = useState<ShpStatus>({ configured: true, connected: false, shop_id: null, shop_name: null, region: null });
  const [shpChecking, setShpChecking] = useState(false);
  const brandChosen = useRef(false);   // มีการเลือกแบรนด์แล้ว (จาก query/ผู้ใช้) — กัน auto-select ทับ
  const say = (text: string, bad = false) => setMsg({ text, bad });
  const flash = (text: string) => { setMsg({ text }); setTimeout(() => setMsg(null), 1800); };

  const load = useCallback(async (bid: string) => {
    setLoading(true);
    try {
      const [j, kj, mj, lj, sj, tj, pj] = await Promise.all([
        apiFetch(`/api/platform-accounts${bid ? `?brand_id=${encodeURIComponent(bid)}` : ""}`).then((r) => r.json()),
        bid ? apiFetch(`/api/platform-credentials?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve({ keys: {} }),
        bid ? apiFetch(`/api/meta/status?brand_id=${encodeURIComponent(bid)}&check=1`).then((r) => r.json()) : Promise.resolve(null),   // check=1 = ลองกับ Meta จริงว่ายังใช้ได้
        bid ? apiFetch(`/api/lazada/status?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve(null),
        bid ? apiFetch(`/api/social-publish/stats?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()).catch(() => null) : Promise.resolve(null),   // ภาพรวมโหลดไม่ได้ ไม่ให้ทั้งหน้าพัง
        bid ? apiFetch(`/api/tiktok-shop/status?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
        bid ? apiFetch(`/api/shopee/status?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
      ]);
      setStats(((sj as { stats?: Record<string, PostStat> } | null)?.stats ?? {}));
      setPlatforms((j.platforms ?? []) as Platform[]);
      // 🛒 แบรนด์ที่ "ซ่อนในช่องทางขาย" แต่มีร้านผูกอยู่ ยังต้องตั้งค่าร้านได้ → ใช้รายการเต็มแล้วกรองเอง (ไม่มีร้าน = ไม่ต้องโชว์)
      const allBrands = (j.brands_all ?? null) as Brand[] | null;
      setBrands(allBrands ? allBrands.filter((b) => !b.hidden || (b.shop_count ?? 0) > 0) : ((j.brands ?? []) as Brand[]));
      setAccounts((j.accounts ?? {}) as Record<string, Account>);
      setKeys((kj.keys ?? {}) as Record<string, boolean>);
      if (mj) { setFb((mj.facebook ?? { connected: false, stage: "none", page_name: null, pages: [] }) as FbStatus); setFbHasIg(!!mj.instagram?.connected); setMetaCfg(mj.configured !== false); setPickPage(""); }
      if (lj) setLaz(lj as LazStatus);
      if (tj && !tj.error) setTts(tj as TtsStatus);
      if (pj && !pj.error) setShp(pj as ShpStatus);
      setTestMsg(null);
      setLoadedFor(bid);
      if (!bid && !brandChosen.current && j.brands?.[0]) setBrandId(j.brands[0].id);
    } catch (e) { say((e as Error).message, true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(""); }, [load]);
  // บริษัท (เลือกบริษัทที่ออกใบกำกับภาษีของร้าน) — โหลดไม่ได้ = ซ่อนส่วนนี้ ไม่ให้ทั้งหน้าพัง
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((j: { data?: { id: string; name?: string; name_th?: string; company_code?: string | null; status?: string }[] }) =>
        setCompanies((j.data ?? []).filter((c) => c.status !== "inactive").map((c) => ({ id: c.id, name: c.name_th || c.name || c.company_code || "", company_code: c.company_code ?? null }))));
  }, []);
  useEffect(() => { if (brandId) load(brandId); }, [brandId, load]);
  // โลโก้แบรนด์ (โชว์บนปุ่มเลือกแบรนด์) — แหล่งเดียวกับ Design Dashboard
  useEffect(() => {
    let live = true;
    apiFetch("/api/brands").then((r) => r.json()).then((j) => {
      if (!live) return;
      const m: Record<string, string> = {};
      for (const b of (j.data ?? []) as { id?: string; logo_url?: string | null }[]) if (b.id && b.logo_url) m[b.id] = b.logo_url;
      setBrandLogos(m);
    }).catch(() => { /* ไม่มีโลโก้ก็ใช้ตัวอักษรย่อแทน */ });
    return () => { live = false; };
  }, []);
  // กลับมาจากการเชื่อมต่อ Facebook/Lazada (OAuth) — อ่านผลจาก query แล้วล้าง URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const err = sp.get("meta_error"), ok = sp.get("meta_connected"), pick = sp.get("meta_pick"), brand = sp.get("brand");
    const lazErr = sp.get("laz_error"), lazOk = sp.get("laz_connected");
    const ttsErr = sp.get("tts_error"), ttsOk = sp.get("tts_connected"), ttsWarn = sp.get("tts_warn");
    const shpErr = sp.get("shp_error"), shpOk = sp.get("shp_connected"), shpWarn = sp.get("shp_warn");
    if (brand) { brandChosen.current = true; setBrandId(brand); }
    if (err) say(err, true);
    else if (ok) say("เชื่อมต่อ Facebook สำเร็จ");
    else if (pick) say("มีหลายเพจ — เลือกเพจที่จะใช้โพสต์");
    else if (lazErr) say(lazErr, true);
    else if (lazOk) say("เชื่อมต่อ Lazada สำเร็จ");
    else if (ttsErr) say(ttsErr, true);
    else if (ttsOk) say(ttsWarn || "เชื่อมต่อ TikTok Shop สำเร็จ", !!ttsWarn);
    else if (shpErr) say(shpErr, true);
    else if (shpOk) say(shpWarn || "เชื่อมต่อ Shopee สำเร็จ", !!shpWarn);
    if (err || ok || pick) wantCode.current = "facebook";
    if (lazErr || lazOk) wantCode.current = "lazada";
    if (ttsErr || ttsOk) wantCode.current = "tiktok";
    if (shpErr || shpOk) wantCode.current = "shopee";
    if (err || ok || pick || brand || lazErr || lazOk || ttsErr || ttsOk || shpErr || shpOk) window.history.replaceState({}, "", window.location.pathname);
  }, []);
  // เลือกแพลตฟอร์มแรก (หรือที่เพิ่งเชื่อมกลับมา) เมื่อโหลดรายการแล้ว
  useEffect(() => {
    if (!platforms.length) return;
    const want = wantCode.current ? platforms.find((p) => p.code === wantCode.current) : null;
    if (want) { setSel(want.id); setMobileDetail(true); wantCode.current = null; return; }
    if (!sel || !platforms.some((p) => p.id === sel)) setSel((platforms.find((p) => p.code === AUTO_CODES[0]) ?? platforms[0]).id);
  }, [platforms, sel]);

  // เชื่อมแล้วแต่ชื่อร้าน/ลิงก์ยังว่าง → ให้ระบบเติมจากการเชื่อมต่อ (ชื่อเพจ, @IG, ชื่อร้าน Lazada) · เติมเฉพาะช่องว่าง ไม่ทับที่พิมพ์เอง
  useEffect(() => {
    if (!canManage || !brandId || loading || loadedFor !== brandId || autoTried.current.has(brandId)) return;
    const empty = (code: string, shopToo = true) => {
      const p = platforms.find((x) => x.code === code); if (!p) return false;
      const a = accounts[p.id]; return !a?.label || (shopToo && !a?.external_shop_id);
    };
    const need = (fb.connected && !fb.problem && (empty("facebook") || (fbHasIg && empty("instagram")))) || (laz.connected && empty("lazada", false));
    if (!need) return;
    autoTried.current.add(brandId);
    const bid = brandId;
    apiFetch("/api/platform-accounts/autofill", { method: "POST", body: JSON.stringify({ brand_id: bid }) })
      .then((r) => r.json())
      .then((j: { filled?: { code: string }[] }) => {
        if (!j.filled?.length) return;
        flash("เติมชื่อร้าน/ลิงก์จากการเชื่อมต่อให้แล้ว");
        void load(bid);
      })
      .catch(() => { /* เติมไม่ได้ก็ไม่เป็นไร — กรอกเองได้ */ });
  }, [canManage, brandId, loading, loadedFor, platforms, accounts, fb, fbHasIg, laz, load]);

  const connectFb = async () => {
    if (!brandId) return;
    try {
      const r = await apiFetch(`/api/meta/oauth/start?brand_id=${encodeURIComponent(brandId)}`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.auth_url) window.location.href = j.auth_url as string;
    } catch (e) { say((e as Error).message, true); }
  };
  const selectFbPage = async () => {
    if (!pickPage) return;
    try {
      const r = await apiFetch("/api/meta/select-page", { method: "POST", body: JSON.stringify({ brand_id: brandId, page_id: pickPage }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      say("เลือกเพจแล้ว: " + (j.page_name ?? "")); await load(brandId);
    } catch (e) { say((e as Error).message, true); }
  };
  const disconnectFb = async () => {
    try {
      const r = await apiFetch("/api/meta/disconnect", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      say("ตัดการเชื่อมต่อ Facebook แล้ว"); await load(brandId);
    } catch (e) { say((e as Error).message, true); }
  };
  // ---- Lazada ----
  const connectLaz = async () => {
    if (!brandId) return;
    try {
      const r = await apiFetch(`/api/lazada/oauth/start?brand_id=${encodeURIComponent(brandId)}`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.auth_url) window.location.href = j.auth_url as string;
    } catch (e) { say((e as Error).message, true); }
  };
  const disconnectLaz = async () => {
    try {
      const r = await apiFetch("/api/lazada/disconnect", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      say("ตัดการเชื่อมต่อ Lazada แล้ว"); await load(brandId);
    } catch (e) { say((e as Error).message, true); }
  };
  const syncLazOrders = async () => {
    setLazSyncing(true); say("กำลังดึงออเดอร์จาก Lazada...");
    try {
      const r = await apiFetch("/api/lazada/sync-orders", { method: "POST", body: JSON.stringify({ brand_id: brandId, days: 30 }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      say(`ดึงออเดอร์เสร็จ: พบ ${j.fetched} · ใหม่ ${j.created} · อัปเดต ${j.updated} · จับคู่สินค้า ${j.matched}`);
    } catch (e) { say((e as Error).message, true); }
    finally { setLazSyncing(false); }
  };

  // ---- TikTok Shop ----
  const connectTts = async () => {
    if (!brandId) return;
    try {
      const r = await apiFetch(`/api/tiktok-shop/oauth/start?brand_id=${encodeURIComponent(brandId)}`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.auth_url) window.location.href = j.auth_url as string;
    } catch (e) { say((e as Error).message, true); }
  };
  const disconnectTts = async () => {
    try {
      const r = await apiFetch("/api/tiktok-shop/disconnect", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      say("ตัดการเชื่อมต่อ TikTok Shop แล้ว"); await load(brandId);
    } catch (e) { say((e as Error).message, true); }
  };
  // ลองกับ TikTok จริง: ต่ออายุกุญแจถ้าจำเป็น + ดึงรายชื่อร้านใหม่ (อ่านอย่างเดียว ไม่แก้อะไรบนร้าน)
  const checkTts = async () => {
    setTtsChecking(true);
    try {
      const r = await apiFetch(`/api/tiktok-shop/status?brand_id=${encodeURIComponent(brandId)}&check=1`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setTts(j as TtsStatus);
      if (j.problem) say(j.problem as string, true); else say(`การเชื่อมต่อ TikTok Shop ใช้งานได้ — ร้าน ${((j.shops ?? []) as { name: string }[]).map((s) => s.name).join(", ") || "-"}`);
    } catch (e) { say((e as Error).message, true); }
    finally { setTtsChecking(false); }
  };

  // ---- Shopee ----
  const connectShp = async () => {
    if (!brandId) return;
    try {
      const r = await apiFetch(`/api/shopee/oauth/start?brand_id=${encodeURIComponent(brandId)}`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.auth_url) window.location.href = j.auth_url as string;
    } catch (e) { say((e as Error).message, true); }
  };
  const disconnectShp = async () => {
    try {
      const r = await apiFetch("/api/shopee/disconnect", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      say("ตัดการเชื่อมต่อ Shopee แล้ว"); await load(brandId);
    } catch (e) { say((e as Error).message, true); }
  };
  // ลองกับ Shopee จริง: ต่ออายุกุญแจถ้าจำเป็น + ดึงข้อมูลร้านใหม่ (อ่านอย่างเดียว ไม่แก้อะไรบนร้าน)
  const checkShp = async () => {
    setShpChecking(true);
    try {
      const r = await apiFetch(`/api/shopee/status?brand_id=${encodeURIComponent(brandId)}&check=1`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setShp(j as ShpStatus);
      if (j.problem) say(j.problem as string, true); else say(`การเชื่อมต่อ Shopee ใช้งานได้ — ร้าน ${(j.shop_name as string | null) ?? j.shop_id ?? "-"}`);
    } catch (e) { say((e as Error).message, true); }
    finally { setShpChecking(false); }
  };

  const save = async (platform_id: string, patch: Partial<Account>) => {
    setAccounts((a) => { const prev = a[platform_id] ?? { label: null, external_shop_id: null, is_active: true }; return { ...a, [platform_id]: { ...prev, ...patch } }; });
    try {
      const r = await apiFetch("/api/platform-accounts", { method: "PATCH", body: JSON.stringify({ brand_id: brandId, platform_id, ...patch }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      flash("บันทึกแล้ว");
    } catch (e) { say((e as Error).message, true); }
  };

  // บันทึก/ล้าง API Key (ค่าไม่ถูกส่งกลับมาแสดง — เก็บฝั่งเซิร์ฟเวอร์)
  const saveKey = async (platform_id: string, api_key: string) => {
    try {
      const r = await apiFetch("/api/platform-credentials", { method: "PATCH", body: JSON.stringify({ brand_id: brandId, platform_id, api_key }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setKeys((k) => ({ ...k, [platform_id]: !!j.has_key }));
      setKeyDraft((d) => ({ ...d, [platform_id]: "" }));
      flash(j.has_key ? "บันทึก API Key แล้ว" : "ล้าง API Key แล้ว");
    } catch (e) { say((e as Error).message, true); }
  };
  const testConn = async () => {
    setTesting(true); setTestMsg({ text: "กำลังทดสอบ..." });
    try {
      const r = await apiFetch("/api/line-shopping/test", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json();
      setTestMsg(j.ok ? { text: "เชื่อมต่อสำเร็จ — API Key ใช้งานได้" } : { text: j.error ?? "เชื่อมต่อไม่สำเร็จ", bad: true });
    } catch (e) { setTestMsg({ text: (e as Error).message, bad: true }); }
    finally { setTesting(false); }
  };

  // ── สถานะต่อแพลตฟอร์ม (จุดสี + ข้อความ) — ใช้ทั้งรายการซ้ายและหัวรายละเอียด ──
  const accOf = (p: Platform): Account => accounts[p.id] ?? { label: null, external_shop_id: null, is_active: false };
  const statusOf = (p: Platform): { tone: Tone; label: string } => {
    const acc = accOf(p); const hasShop = !!(acc.label || acc.external_shop_id);
    if (p.code === "facebook") {
      if (fb.connected && fb.problem) return { tone: "bad", label: "ต้องเชื่อมใหม่" };
      if (fb.connected) return { tone: "ok", label: "เชื่อมแล้ว" };
      if (fb.stage === "pending" && fb.pages.length) return { tone: "warn", label: "รอเลือกเพจ" };
    }
    if (p.code === "instagram" && fb.connected && fbHasIg) return fb.problem ? { tone: "bad", label: "ต้องเชื่อมใหม่" } : { tone: "ok", label: "เชื่อมแล้ว" };
    if (p.code === "lazada") {
      if (laz.connected) return laz.health === "expiring" ? { tone: "warn", label: `อีก ${laz.days_left ?? 0} วันหมดอายุ` } : { tone: "ok", label: "เชื่อมแล้ว" };
      if (laz.health === "expired") return { tone: "bad", label: "หมดอายุ" };
    }
    if (p.code === "tiktok") {
      if (tts.connected && tts.brand_mismatch) return { tone: "bad", label: "ร้านไม่ตรงแบรนด์" };
      if (tts.connected) return tts.problem ? { tone: "bad", label: "ต้องเชื่อมใหม่" } : tts.health === "expiring" ? { tone: "warn", label: `อีก ${tts.days_left ?? 0} วันหมดอายุ` } : { tone: "ok", label: "เชื่อมแล้ว" };
      if (tts.health === "expired") return { tone: "bad", label: "หมดอายุ" };
    }
    if (p.code === "shopee") {
      if (shp.connected && shp.brand_mismatch) return { tone: "bad", label: "ร้านไม่ตรงแบรนด์" };
      if (shp.connected) return shp.problem ? { tone: "bad", label: "ต้องเชื่อมใหม่" } : shp.health === "expiring" ? { tone: "warn", label: `อีก ${shp.days_left ?? 0} วันหมดอายุ` } : { tone: "ok", label: "เชื่อมแล้ว" };
      if (shp.health === "expired") return { tone: "bad", label: "หมดอายุ" };
    }
    if (p.code === "line_shopping" && keys[p.id]) return { tone: "ok", label: "ตั้งคีย์แล้ว" };
    if (acc.is_active && hasShop) return { tone: "on", label: "ใช้งาน" };
    if (hasShop) return { tone: "off", label: "ปิดอยู่" };
    return { tone: "off", label: AUTO_CODES.includes(p.code) ? "เชื่อมต่อได้" : "ยังไม่ตั้ง" };
  };
  const autoList = platforms.filter((p) => AUTO_CODES.includes(p.code)).sort((a, b) => AUTO_CODES.indexOf(a.code) - AUTO_CODES.indexOf(b.code));   // FB → IG (ใช้การเชื่อมเดียวกัน) → Lazada → LINE
  const otherList = platforms.filter((p) => !AUTO_CODES.includes(p.code));
  const activeCount = platforms.filter((p) => { const a = accOf(p); return a.is_active && !!(a.label || a.external_shop_id); }).length;
  const linkedCount = autoList.filter((p) => statusOf(p).tone === "ok").length;
  const brand = brands.find((b) => b.id === brandId);
  const cur = platforms.find((p) => p.id === sel) ?? null;

  const pick = (id: string) => { setSel(id); setMobileDetail(true); setEditPlat(null); setEditKey(null); setTestMsg(null); };

  // ── รายละเอียดการเชื่อมต่อของแพลตฟอร์มที่เลือก ──
  const connectionOf = (p: Platform): ReactNode => {
    if (p.code === "facebook") {
      if (!metaCfg) return <Note>ยังไม่ได้ตั้ง META_APP_ID / META_APP_SECRET ในโฮสต์ (Vercel) — ตั้งก่อนจึงจะเชื่อมต่อได้</Note>;
      if (fb.connected && fb.problem) return (
        <div className="space-y-3">
          <Note tone="bad"><b className="font-medium">เพจ {fb.page_name}: การเชื่อมต่อใช้ไม่ได้ตอนนี้</b> — {fb.problem}</Note>
          {canManage && <div className="flex flex-wrap items-center gap-4"><button onClick={connectFb} className={BTN_DARK}>เชื่อมต่อ Facebook ใหม่</button><button onClick={() => setConfirmDisc("facebook")} className={LINK_DANGER}>ตัดการเชื่อมต่อ</button></div>}
        </div>
      );
      if (fb.connected) return (
        <StatusBar tone="ok" actions={canManage && <><button onClick={connectFb} className="text-xs text-slate-600 hover:underline">เชื่อมใหม่ / เปลี่ยนเพจ</button><button onClick={() => setConfirmDisc("facebook")} className={LINK_DANGER}>ตัดการเชื่อมต่อ</button></>}>
          เพจ <b className="font-medium text-slate-900">{fb.page_name}</b> — โพสต์อัตโนมัติจากหน้าคอนเทนต์ได้{fbHasIg ? " · มี Instagram ผูกอยู่" : ""}
        </StatusBar>
      );
      if (fb.stage === "pending" && fb.pages.length > 0) return (
        <div className="flex flex-wrap items-center gap-2">
          <select value={pickPage} onChange={(e) => setPickPage(e.target.value)} disabled={!canManage} className="h-9 border border-slate-200 rounded-lg px-3 text-sm bg-white min-w-[220px]">
            <option value="">เลือกเพจที่จะใช้โพสต์</option>
            {fb.pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}{pg.ig ? " (มี IG)" : ""}</option>)}
          </select>
          {canManage && <><button onClick={selectFbPage} disabled={!pickPage} className={BTN_DARK}>ยืนยันเพจ</button><button onClick={connectFb} className="text-xs text-slate-600 hover:underline">เริ่มใหม่</button></>}
        </div>
      );
      return canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={connectFb} disabled={!brandId} className={BTN_DARK}><PlatformIcon code="facebook" size={16} />เชื่อมต่อ Facebook</button>
          <span className="text-xs text-slate-500">เข้าสู่ระบบ Facebook แล้วเลือกเพจ → โพสต์อัตโนมัติจากหน้าคอนเทนต์ได้</span>
        </div>
      ) : <p className="text-sm text-slate-500">ยังไม่ได้เชื่อมต่อ</p>;
    }
    if (p.code === "instagram") {
      if (!metaCfg) return <Note>ยังไม่ได้ตั้ง META_APP_ID / META_APP_SECRET ในโฮสต์</Note>;
      const fbPlat = platforms.find((x) => x.code === "facebook");
      if (!fb.connected) return (
        <StatusBar tone="off" actions={fbPlat && <button onClick={() => pick(fbPlat.id)} className="text-xs text-slate-700 hover:underline">ไปที่ Facebook ›</button>}>
          Instagram โพสต์ผ่านเพจ Facebook — เชื่อมต่อ Facebook ก่อน (ตอนอนุญาตให้เปิดสิทธิ์ Instagram ด้วย)
        </StatusBar>
      );
      if (fbHasIg && fb.problem) return <Note tone="bad">Instagram ใช้การเชื่อมต่อเดียวกับเพจ “{fb.page_name}” ซึ่งตอนนี้ใช้ไม่ได้ — แก้ที่ Facebook ก่อน</Note>;
      if (fbHasIg) return (
        <StatusBar tone="ok" actions={canManage && <button onClick={connectFb} className="text-xs text-slate-600 hover:underline">เชื่อมใหม่</button>}>
          พร้อมโพสต์ผ่านเพจ <b className="font-medium text-slate-900">{fb.page_name}</b>
        </StatusBar>
      );
      return (
        <div className="space-y-3">
          <Note>เพจ “{fb.page_name}” เชื่อมแล้ว แต่ยังไม่เจอ Instagram ที่ผูก — ตรวจว่า IG เป็นบัญชี Business/Professional และผูกกับเพจนี้ใน Meta Business Suite แล้วกดเชื่อมใหม่</Note>
          {canManage && <button onClick={connectFb} className={BTN_DARK}><PlatformIcon code="instagram" size={16} />เชื่อมใหม่ (รับสิทธิ์ Instagram)</button>}
        </div>
      );
    }
    if (p.code === "lazada") {
      // แอป Lazada ที่แบรนด์ใช้ (แอปกลาง / แอปของแบรนด์เอง) — แสดงทุกสถานะ
      const appPanel = brandId && (canManage || laz.own_app) ? (
        <LazadaAppPanel brandId={brandId} brandName={brand?.name ?? "แบรนด์นี้"} ownApp={laz.own_app ?? null} defaultReady={laz.default_app_ready !== false}
          locked={!!laz.app_locked} canManage={canManage} onChanged={() => load(brandId)} say={say} />
      ) : null;
      if (!laz.configured) return (
        <div className="space-y-3">
          <Note>{laz.own_app ? "อ่าน App Secret ของแอปแบรนด์นี้ไม่ได้ — กด แก้ไข ด้านล่างแล้วกรอก App Secret ใหม่" : "ยังไม่ได้ตั้ง LAZADA_APP_KEY / LAZADA_APP_SECRET ในโฮสต์ (Vercel) — หรือใส่กุญแจแอปของแบรนด์เองด้านล่าง"}</Note>
          {appPanel}
        </div>
      );
      if (laz.connected) return (
        <div className="space-y-3">
          <StatusBar tone={laz.health === "expiring" ? "warn" : "ok"} actions={canManage && <><button onClick={connectLaz} className="text-xs text-slate-600 hover:underline">เชื่อมใหม่</button><button onClick={() => setConfirmDisc("lazada")} className={LINK_DANGER}>ตัดการเชื่อมต่อ</button></>}>
            ร้าน <b className="font-medium text-slate-900">{laz.short_code || laz.seller_id}</b>{laz.country ? ` (${laz.country})` : ""}
            {laz.health === "expiring" && <span className="text-amber-700"> · อีก {laz.days_left ?? 0} วันต้องกดเชื่อมใหม่ (Lazada ให้สิทธิ์ทีละ ~30 วัน)</span>}
          </StatusBar>
          {canManage && <button onClick={syncLazOrders} disabled={lazSyncing} className={BTN_LINE}><Icon name="download" />{lazSyncing ? "กำลังดึง..." : "ดึงออเดอร์ 30 วันล่าสุด"}</button>}
          {appPanel}
        </div>
      );
      return (
        <div className="space-y-3">
          {laz.health === "expired" && <Note>การเชื่อมต่อเดิมหมดอายุแล้ว — กดเชื่อมใหม่ (ระบบจะต่ออายุให้อัตโนมัติทุกวันหลังจากนี้)</Note>}
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={connectLaz} disabled={!brandId} className={BTN_DARK}><PlatformIcon code="lazada" size={16} />{laz.health === "expired" ? "เชื่อมต่อ Lazada ใหม่" : "เชื่อมต่อ Lazada"}</button>
              <span className="text-xs text-slate-500">เข้าสู่ระบบ Lazada Seller แล้วอนุญาต → ดึงออเดอร์/สินค้าเข้าระบบได้</span>
            </div>
          ) : <p className="text-sm text-slate-500">ยังไม่ได้เชื่อมต่อ</p>}
          {appPanel}
        </div>
      );
    }
    if (p.code === "tiktok") {
      if (!tts.configured) return <Note>ยังไม่ได้ตั้ง TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET / TIKTOK_SHOP_SERVICE_ID ในโฮสต์ (Vercel)</Note>;
      if (tts.connected) return (
        <div className="space-y-3">
          {tts.brand_mismatch && <Note tone="bad">ร้านที่เชื่อมอยู่ชื่อ “{tts.brand_mismatch.seller_name}” แต่แบรนด์ที่เลือกคือ “{tts.brand_mismatch.brand_name}” — ถ้าเชื่อมผิดแบรนด์ ให้กด <b>ตัดการเชื่อมต่อ</b> แล้วเลือกแบรนด์ที่ถูกด้านบนก่อนกดเชื่อมต่อใหม่</Note>}
          <StatusBar tone={tts.problem || tts.brand_mismatch ? "bad" : tts.health === "expiring" ? "warn" : "ok"} actions={canManage && <><button onClick={connectTts} className="text-xs text-slate-600 hover:underline">เชื่อมใหม่</button><button onClick={() => setConfirmDisc("tiktok")} className={LINK_DANGER}>ตัดการเชื่อมต่อ</button></>}>
            ร้าน <b className="font-medium text-slate-900">{tts.shops.map((s) => s.name).join(", ") || tts.seller_name || "-"}</b>{tts.region ? ` (${tts.region})` : ""}
            {tts.health === "expiring" && <span className="text-amber-700"> · อีก {tts.days_left ?? 0} วันสิทธิ์หมด ต้องกดเชื่อมใหม่</span>}
          </StatusBar>
          {tts.problem && <Note>{tts.problem}</Note>}
          {canManage && <button onClick={checkTts} disabled={ttsChecking} className={BTN_LINE}><Icon name="refresh" />{ttsChecking ? "กำลังตรวจ..." : "ตรวจการเชื่อมต่อ"}</button>}
          <p className="text-xs text-slate-500">ตอนนี้ระบบแค่ถือกุญแจไว้ ยังไม่ดึงหรือแก้อะไรบนร้าน — ดึงสินค้า/ออเดอร์จะเปิดในขั้นถัดไป</p>
        </div>
      );
      return (
        <div className="space-y-3">
          {tts.health === "expired" && <Note>สิทธิ์ที่ร้านให้ไว้หมดอายุแล้ว — กดเชื่อมใหม่</Note>}
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={connectTts} disabled={!brandId} className={BTN_DARK}><PlatformIcon code="tiktok" size={16} />{tts.health === "expired" ? "เชื่อมต่อ TikTok Shop ใหม่" : "เชื่อมต่อ TikTok Shop"}</button>
              <span className="text-xs text-slate-500">เข้าสู่ระบบ TikTok Shop Seller Center แล้วกดอนุญาต (เลือกอายุสิทธิ์ยาวที่สุด)</span>
            </div>
          ) : <p className="text-sm text-slate-500">ยังไม่ได้เชื่อมต่อ</p>}
          <p className="text-xs text-slate-500">แอปใน Partner Center ต้องผ่านการตรวจและกด “เผยแพร่” ก่อน ร้านจริงถึงกดอนุญาตได้</p>
        </div>
      );
    }
    if (p.code === "shopee") {
      if (!shp.configured) return <Note>ยังไม่ได้ตั้ง SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY / SHOPEE_ENV ในโฮสต์ (Vercel) — ใส่ Live Partner ID / Live Key จากหน้าแอปใน Shopee Open Platform หลัง Go Live ผ่าน</Note>;
      if (shp.connected) return (
        <div className="space-y-3">
          {shp.brand_mismatch && <Note tone="bad">ร้านที่เชื่อมอยู่ชื่อ “{shp.brand_mismatch.shop_name}” แต่แบรนด์ที่เลือกคือ “{shp.brand_mismatch.brand_name}” — ถ้าเชื่อมผิดแบรนด์ ให้กด <b>ตัดการเชื่อมต่อ</b> แล้วเลือกแบรนด์ที่ถูกด้านบนก่อนกดเชื่อมต่อใหม่</Note>}
          <StatusBar tone={shp.problem || shp.brand_mismatch ? "bad" : shp.health === "expiring" ? "warn" : "ok"} actions={canManage && <><button onClick={connectShp} className="text-xs text-slate-600 hover:underline">เชื่อมใหม่</button><button onClick={() => setConfirmDisc("shopee")} className={LINK_DANGER}>ตัดการเชื่อมต่อ</button></>}>
            ร้าน <b className="font-medium text-slate-900">{shp.shop_name || "-"}</b>{shp.shop_id ? ` · รหัสร้าน ${shp.shop_id}` : ""}{shp.region ? ` (${shp.region})` : ""}
            {shp.env === "sandbox" && <span className="text-amber-700"> · โหมดทดลอง (sandbox)</span>}
            {shp.health === "expiring" && <span className="text-amber-700"> · อีก {shp.days_left ?? 0} วันต้องกดเชื่อมใหม่</span>}
            {shp.health !== "expiring" && shp.auth_days_left != null && <span className="text-slate-500"> · สิทธิ์ร้านเหลือ {shp.auth_days_left} วัน</span>}
          </StatusBar>
          {shp.problem && <Note>{shp.problem}</Note>}
          {canManage && <button onClick={checkShp} disabled={shpChecking} className={BTN_LINE}><Icon name="refresh" />{shpChecking ? "กำลังตรวจ..." : "ตรวจการเชื่อมต่อ"}</button>}
          <p className="text-xs text-slate-500">ตอนนี้ระบบแค่ถือกุญแจไว้ ยังไม่ดึงหรือแก้อะไรบนร้าน — ดึงสินค้า/ออเดอร์จะเปิดในขั้นถัดไป</p>
        </div>
      );
      return (
        <div className="space-y-3">
          {shp.health === "expired" && <Note>การเชื่อมต่อเดิมหมดอายุแล้ว — กดเชื่อมใหม่ (ระบบต่ออายุกุญแจให้เองทุกวันหลังจากนี้)</Note>}
          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={connectShp} disabled={!brandId} className={BTN_DARK}><PlatformIcon code="shopee" size={16} />{shp.health === "expired" ? "เชื่อมต่อ Shopee ใหม่" : "เชื่อมต่อ Shopee"}</button>
              <span className="text-xs text-slate-500">เข้าสู่ระบบด้วยบัญชีหลักของร้าน + OTP แล้วเลือกอายุสิทธิ์ 365 วัน</span>
            </div>
          ) : <p className="text-sm text-slate-500">ยังไม่ได้เชื่อมต่อ</p>}
          <p className="text-xs text-slate-500">แอปใน Shopee Open Platform ต้อง Go Live ผ่านก่อน ร้านจริงถึงกดอนุญาตได้ (กุญแจชุด Test ใช้ได้แค่ร้านทดลอง)</p>
        </div>
      );
    }
    if (p.code === "line_shopping") {
      const has = keys[p.id];
      return (
        <div className="space-y-3">
          {!canManage ? <p className="text-sm text-slate-500">{has ? "ตั้ง API Key แล้ว" : "ยังไม่ได้ตั้ง API Key"}</p> : (
            <>
              {/* มีคีย์อยู่แล้ว = อ่านอย่างเดียว (กันเผลอพิมพ์ทับ) → กด "เปลี่ยนคีย์" ถึงจะพิมพ์ได้ · ยังไม่มีคีย์ = พิมพ์ได้เลย */}
              <div className="flex flex-wrap items-center gap-2">
                {has && editKey !== p.id ? (
                  <>
                    <input readOnly value="••••••••••••••••" className="h-9 flex-1 min-w-[200px] border border-slate-200 rounded-lg px-3 text-sm font-mono bg-slate-50 text-slate-400" />
                    <button onClick={() => { setEditKey(p.id); setKeyDraft((d) => ({ ...d, [p.id]: "" })); }} className={BTN_LINE}><Icon name="edit" />เปลี่ยนคีย์</button>
                  </>
                ) : (
                  <>
                    <input type="password" autoComplete="off" value={keyDraft[p.id] ?? ""} placeholder={has ? "ใส่คีย์ใหม่เพื่อเปลี่ยน" : "วาง API Key จาก MyShop"}
                      onChange={(e) => setKeyDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                      className="h-9 flex-1 min-w-[200px] border border-slate-200 rounded-lg px-3 text-sm font-mono" />
                    <button onClick={() => { void saveKey(p.id, keyDraft[p.id] ?? ""); setEditKey(null); }} disabled={!(keyDraft[p.id] ?? "").trim()} className={BTN_DARK}>บันทึกคีย์</button>
                    {has && editKey === p.id && <button onClick={() => { setEditKey(null); setKeyDraft((d) => ({ ...d, [p.id]: "" })); }} className={BTN_LINE}>ยกเลิก</button>}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button onClick={testConn} disabled={testing || !has} title={has ? "" : "ใส่ API Key ก่อน"} className={BTN_LINE}><Icon name="plugin" />ทดสอบการเชื่อมต่อ</button>
                {has && <button onClick={() => setClearKeyFor(p.id)} className={LINK_DANGER}>ล้างคีย์</button>}
                <button onClick={() => setGuideFor("line_key")} className="text-xs text-slate-600 hover:underline inline-flex items-center gap-1"><Icon name="guide" />วิธีขอ API Key</button>
              </div>
              {testMsg && <p className={`text-xs ${testMsg.bad ? "text-rose-600" : "text-slate-600"}`}>{testMsg.text}</p>}
            </>
          )}
        </div>
      );
    }
    return null;
  };

  // ── โพสต์ได้แบบไหน / ระบบทำอะไรได้ + ข้อควรรู้ + ภาพรวม 30 วัน (ข้อมูลจากทะเบียนกลาง lib/social-publish/capabilities) ──
  const capsSections = (p: Platform, st: { tone: Tone }): ReactNode => {
    const caps = capsOf(p.code);
    const ps = stats[p.code];
    const showStats = caps?.kind === "social" || !!ps;
    if (!caps && !showStats) return null;
    const live = st.tone === "ok" || st.tone === "warn";   // เชื่อมต่อแล้ว (ระบบทำงานแทนได้จริง)
    const allManual = !!caps && caps.formats.length > 0 && caps.formats.every((x) => x.mode === "manual");
    const capDesc = caps?.kind === "shop" ? "สิ่งที่ระบบทำกับร้านนี้ได้"
      : allManual ? "ระบบเตรียมแคปชั่นให้ แล้วกดโพสต์ในแอปเอง"
      : live ? "ระบบโพสต์ให้เองจากหน้าคอนเทนต์ หรือตั้งคิวตามเวลาได้" : "เชื่อมต่อก่อน แล้วระบบจะโพสต์แบบเหล่านี้ให้เอง";
    const s: PostStat = ps ?? { posted30: 0, queued: 0, failed: 0, next_run_at: null, last_posted_at: null };
    const metric = (label: string, value: ReactNode, sub?: string, bad?: boolean) => (
      <div className="rounded-xl bg-slate-50 px-3 py-2.5 min-w-0">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className={`mt-0.5 text-lg font-semibold leading-tight truncate ${bad ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
        {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
      </div>
    );
    return (
      <>
        {caps && caps.formats.length > 0 && (
          <Section title={caps.kind === "shop" ? "ระบบทำอะไรได้" : "โพสต์ได้แบบไหน"} desc={capDesc}>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
              {caps.formats.map((x) => {
                const tag = x.mode === "manual" ? { t: "กดเอง", c: "bg-slate-100 text-slate-500" }
                  : live ? { t: "อัตโนมัติ", c: "bg-emerald-50 text-emerald-700" } : { t: "เมื่อเชื่อมต่อ", c: "bg-slate-100 text-slate-500" };
                return (
                  <div key={x.key} className="rounded-xl border border-slate-200 px-3 py-2.5 min-w-0">
                    <Icon name={x.icon} className="text-slate-500" />
                    <p className="mt-1 text-sm font-medium text-slate-900 truncate">{x.thShort}</p>
                    <p className="text-[11px] text-slate-500 truncate" title={x.spec}>{x.spec}</p>
                    <span className={`mt-1.5 inline-block text-[10.5px] rounded-md px-1.5 py-0.5 ${tag.c}`}>{tag.t}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {caps && caps.tips.length > 0 && (
          <Section title="ข้อควรรู้">
            <ul className="space-y-1.5">
              {caps.tips.map((tip, i) => <li key={i} className="flex gap-2 text-[13px] text-slate-600"><Icon name="done" className="mt-0.5 shrink-0 text-slate-400" /><span>{tip}</span></li>)}
            </ul>
          </Section>
        )}

        {showStats && (
          <Section title="ภาพรวม 30 วัน" desc="นับจากคอนเทนต์ของแบรนด์นี้ (ทั้งโพสต์อัตโนมัติและที่ติ๊กว่าโพสต์แล้วเอง)">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              {metric("โพสต์แล้ว", s.posted30)}
              {metric("รอในคิว", s.queued, s.next_run_at ? `ถัดไป ${formatDateTime(s.next_run_at)}` : undefined)}
              {metric("ล้ม รอแก้", s.failed, undefined, s.failed > 0)}
              {metric("ล่าสุด", s.last_posted_at ? <span className="text-sm">{formatDateTime(s.last_posted_at)}</span> : "—")}
            </div>
            <a href="/tasks/content-calendar?queue=1" className="mt-3 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 hover:underline">เปิดคิวโพสต์ในปฏิทินคอนเทนต์<Icon name="open" /></a>
          </Section>
        )}
      </>
    );
  };

  const listItem = (p: Platform) => {
    const st = statusOf(p); const acc = accOf(p); const on = p.id === sel;
    return (
      <button key={p.id} type="button" onClick={() => pick(p.id)}
        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${on ? "bg-slate-100" : "hover:bg-slate-50"}`}>
        <span className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center shrink-0"><PlatformIcon code={p.code} iconKey={p.icon_key} size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm truncate ${on ? "font-medium text-slate-900" : "text-slate-700"}`}>{p.name_th}</span>
          <span className="block text-[11px] text-slate-400 truncate">{acc.label || acc.external_shop_id || st.label}</span>
        </span>
        <Dot tone={st.tone} />
      </button>
    );
  };

  return (
    <AppAccessGate appKey="master">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* ── หัวหน้า: ชื่อ + สรุป · ขวา = เลือกแบรนด์ ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <BackButton fallback="/" className="mb-2" />
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">ตั้งค่าร้านค้า</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">บัญชีแพลตฟอร์ม</h1>
          <p className="mt-1 text-sm text-slate-500">
            {brand ? <>{brand.name} · เปิดใช้ {activeCount} จาก {platforms.length} · เชื่อมต่ออัตโนมัติ {linkedCount}</> : "แต่ละแบรนด์มีร้านของตัวเองในแต่ละแพลตฟอร์ม"}
          </p>
        </div>
        {/* เลือกแบรนด์ — แถบปุ่มพร้อมโลโก้ (จอกว้าง) · จอแคบ = dropdown */}
        <div className="hidden sm:flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
          {brands.map((b) => {
            const on = b.id === brandId; const logo = brandLogos[b.id];
            return (
              <button key={b.id} type="button" onClick={() => { brandChosen.current = true; setBrandId(b.id); }} title={b.name}
                className={`h-9 pl-1.5 pr-3 inline-flex items-center gap-2 rounded-lg text-sm transition-colors ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/r2-image?key=${encodeURIComponent(logo)}&w=48`} alt="" className="h-6 w-6 rounded-md object-contain bg-white" />
                  : <span className="h-6 w-6 rounded-md flex items-center justify-center text-white text-[10px] font-semibold" style={{ background: b.color || "#94a3b8" }}>{(b.name || "?").slice(0, 1)}</span>}
                {b.name}{b.hidden && <span className="rounded bg-slate-200 px-1 text-[10px] text-slate-500" title="ตั้ง ซ่อนในช่องทางขาย ไว้ที่หน้าแบรนด์ — ไม่โชว์ในตัวเลือกของหน้าแพลตฟอร์ม แต่ตั้งค่าร้านได้">ซ่อนอยู่</span>}
              </button>
            );
          })}
        </div>
        <select value={brandId} onChange={(e) => { brandChosen.current = true; setBrandId(e.target.value); }} className="sm:hidden h-10 w-full border border-slate-200 rounded-lg px-3 text-sm bg-white">
          {brands.length === 0 && <option value="">—</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.hidden ? " (ซ่อนอยู่)" : ""}</option>)}
        </select>
      </div>

      {(msg || !canManage) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {!canManage && <span className="inline-flex items-center gap-1 text-slate-500"><Icon name="lock" />ดูได้อย่างเดียว — คุณไม่มีสิทธิ์แก้ไข</span>}
          {msg && <span className={msg.bad ? "text-rose-600" : "text-slate-600"}>{msg.text}</span>}
        </div>
      )}

      {/* ── ซ้ายรายการ · ขวารายละเอียด ── */}
      <div className="mt-6 grid gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className={`${mobileDetail ? "hidden md:block" : ""} rounded-2xl border border-slate-200 bg-white p-2 self-start`}>
          {loading && !platforms.length ? <p className="text-slate-400 text-sm py-8 text-center">กำลังโหลด...</p> : (
            <>
              {autoList.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">เชื่อมต่ออัตโนมัติได้</p>}
              {autoList.map(listItem)}
              {otherList.length > 0 && <p className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">ร้านและช่องทางอื่น</p>}
              {otherList.map(listItem)}
              {platforms.length === 0 && <p className="text-slate-400 text-sm p-3">ยังไม่มีแพลตฟอร์ม</p>}
            </>
          )}
        </aside>

        <section className={`${mobileDetail ? "" : "hidden md:block"} rounded-2xl border border-slate-200 bg-white min-w-0`}>
          {!cur ? <p className="text-slate-400 text-sm py-16 text-center">เลือกแพลตฟอร์มทางซ้าย</p> : (() => {
            const acc = accOf(cur); const st = statusOf(cur); const url = shopUrlOf(cur.code, acc.external_shop_id);
            const editing = editPlat === cur.id; const conn = connectionOf(cur); const g = guideOf(cur.code);
            const notSetUp = st.tone === "off" && !acc.label && !acc.external_shop_id;   // ยังไม่ได้ตั้งอะไรเลย → โชว์วิธีตั้งในหน้าเลย
            return (
              <>
                <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-5 border-b border-slate-100">
                  <button type="button" onClick={() => setMobileDetail(false)} className="md:hidden -ml-2 h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50" aria-label="กลับไปรายการแพลตฟอร์ม"><Icon name="back" /></button>
                  <span className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl border border-slate-200 flex items-center justify-center shrink-0"><PlatformIcon code={cur.code} iconKey={cur.icon_key} size={24} /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold tracking-tight text-slate-900 truncate">{cur.name_th}</h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Dot tone={st.tone} />{st.label}</span>
                      {url && !editing && <a href={url} target="_blank" rel="noopener noreferrer" title={url} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline"><Icon name="open" />เปิดหน้าร้าน</a>}
                      {!notSetUp && <button type="button" onClick={() => setGuideFor(cur.code)} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline"><Icon name="guide" />วิธีตั้ง</button>}
                    </p>
                  </div>
                  <ToggleSwitch on={acc.is_active} onChange={(v) => void save(cur.id, { is_active: v })} disabled={!canManage} label={<span className="hidden sm:inline text-xs text-slate-500">เปิดใช้งาน</span>} title="เปิดใช้ร้านนี้" />
                </div>

                <div className="px-4 sm:px-6 py-6 space-y-8">
                  {notSetUp && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <p className="text-sm font-medium text-slate-900 inline-flex items-center gap-1.5"><Icon name="guide" />วิธีตั้ง {cur.name_th}</p>
                        {g.link && <a href={g.link.href} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-600 hover:underline inline-flex items-center gap-1">{g.link.label}<Icon name="open" /></a>}
                      </div>
                      <GuideSteps g={g} compact />
                    </div>
                  )}
                  <Section title="ร้าน" desc="ใช้ตอนลงขายและทำลิงก์สินค้าตามแบรนด์ของสินค้า">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">ชื่อร้าน</span>
                        <ERPInput value={acc.label ?? ""} disabled={!canManage || !editing} placeholder={`เช่น ${cur.name_th} – ${brand?.name ?? "แบรนด์"}`} onChange={(e) => setAccounts((a) => ({ ...a, [cur.id]: { ...acc, label: e.target.value } }))} />
                      </label>
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">Shop ID / ลิงก์ร้าน</span>
                        <ERPInput value={acc.external_shop_id ?? ""} disabled={!canManage || !editing} placeholder={g.shopPh ?? "ลิงก์ร้าน หรือ @ชื่อผู้ใช้"} title="ใช้สร้างลิงก์สินค้าบนร้าน เช่น LINE: https://shop.line.me/@Shop ID/product/..." onChange={(e) => setAccounts((a) => ({ ...a, [cur.id]: { ...acc, external_shop_id: e.target.value } }))} />
                      </label>
                    </div>
                    {canManage && (
                      <div className="mt-3 flex items-center gap-2">
                        {editing ? (
                          <>
                            <button onClick={() => { void save(cur.id, { label: acc.label, external_shop_id: acc.external_shop_id }); setEditPlat(null); }} className={BTN_DARK}><Icon name="save" />บันทึก</button>
                            <button onClick={() => { setEditPlat(null); void load(brandId); }} className={BTN_LINE}>ยกเลิก</button>
                          </>
                        ) : (
                          <button onClick={() => setEditPlat(cur.id)} className={BTN_LINE}><Icon name="edit" />แก้ไขข้อมูลร้าน</button>
                        )}
                      </div>
                    )}
                  </Section>

                  {INVOICE_CODES.includes(cur.code) && companies.length > 0 && (
                    <Section title="ใบกำกับภาษี" desc="บริษัทที่ออกใบกำกับภาษีให้ลูกค้าของร้านนี้ (ศูนย์ออเดอร์ออนไลน์ › ออกใบกำกับ) — ออกผ่านใบขาย ใช้เลขชุดของบริษัทนี้ และเข้ารายงานภาษีขายเอง">
                      <div className="max-w-sm">
                        <select value={acc.tax_invoice_company_id ?? ""} disabled={!canManage}
                          onChange={(e) => void save(cur.id, { tax_invoice_company_id: e.target.value || null })}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 disabled:bg-slate-50">
                          <option value="">— ยังไม่เลือก (ออกใบกำกับไม่ได้) —</option>
                          {companies.map((c) => <option key={c.id} value={c.id}>{c.company_code ? `${c.company_code} · ` : ""}{c.name}</option>)}
                        </select>
                        {!acc.tax_invoice_company_id && <p className="mt-1.5 text-xs text-slate-500">ระบบไม่เดาบริษัทให้ — ใบกำกับผิดบริษัทเป็นปัญหาภาษี</p>}
                      </div>
                    </Section>
                  )}

                  {conn && (
                    <Section title={cur.code === "line_shopping" ? "API Key" : "การเชื่อมต่อ"}
                      desc={cur.code === "facebook" || cur.code === "instagram" ? "ให้ระบบโพสต์คอนเทนต์ขึ้นเพจให้อัตโนมัติ" : cur.code === "lazada" ? "ดึงออเดอร์และสินค้าเข้าระบบอัตโนมัติ" : cur.code === "tiktok" ? "เชื่อมร้าน TikTok Shop กับระบบผ่าน Open API" : cur.code === "shopee" ? "เชื่อมร้าน Shopee กับระบบผ่าน Shopee Open Platform" : "เชื่อมร้านกับระบบผ่าน Open API ของ LINE SHOPPING"}>
                      {conn}
                    </Section>
                  )}

                  {capsSections(cur, st)}
                </div>
              </>
            );
          })()}
        </section>
      </div>

      {/* ป๊อปวิธีตั้ง — ต่อแพลตฟอร์ม (GUIDE) หรือวิธีขอ API Key ของ LINE SHOPPING */}
      {(() => {
        const gp = guideFor && guideFor !== "line_key" ? platforms.find((x) => x.code === guideFor) : null;
        const gg = guideFor === "line_key" ? LINE_KEY_GUIDE : guideFor ? guideOf(guideFor) : null;
        return (
          <ERPModal open={!!gg} onClose={() => setGuideFor(null)} size="md"
            title={guideFor === "line_key" ? "วิธีขอ API Key จาก LINE SHOPPING" : `วิธีตั้ง ${gp?.name_th ?? ""}`}
            footer={gg?.link ? <a href={gg.link.href} target="_blank" rel="noopener noreferrer" className={BTN_DARK}>{gg.link.label}<Icon name="open" /></a> : undefined}>
            {gg && <GuideSteps g={gg} />}
          </ERPModal>
        );
      })()}

      {/* ยืนยันก่อนล้าง API Key (ลบแล้วต้องไปขอ/คัดลอกมาใหม่) */}
      <ConfirmDialog open={!!clearKeyFor} onClose={() => setClearKeyFor(null)} variant="danger" title="ล้าง API Key?" confirmText="ล้างคีย์"
        message={`คีย์ของ ${platforms.find((x) => x.id === clearKeyFor)?.name_th ?? ""} จะถูกลบออกจากระบบ — การเชื่อมต่อจะหยุดทำงาน และต้องไปคัดลอกคีย์มาใส่ใหม่เอง`}
        onConfirm={() => { const id = clearKeyFor; setClearKeyFor(null); setEditKey(null); if (id) void saveKey(id, ""); }} />

      {/* ยืนยันก่อนตัดการเชื่อมต่อ Facebook / Lazada */}
      <ConfirmDialog open={!!confirmDisc} onClose={() => setConfirmDisc(null)} variant="danger"
        title={confirmDisc === "lazada" ? "ตัดการเชื่อมต่อ Lazada?" : confirmDisc === "tiktok" ? "ตัดการเชื่อมต่อ TikTok Shop?" : confirmDisc === "shopee" ? "ตัดการเชื่อมต่อ Shopee?" : "ตัดการเชื่อมต่อ Facebook?"} confirmText="ตัดการเชื่อมต่อ"
        message={confirmDisc === "lazada"
          ? `${brand?.name ?? "แบรนด์นี้"} จะหยุดดึงออเดอร์จาก Lazada จนกว่าจะเชื่อมใหม่`
          : confirmDisc === "tiktok"
            ? `ระบบจะลบกุญแจ TikTok Shop ของ ${brand?.name ?? "แบรนด์นี้"} — ต้องกดเชื่อมต่อใหม่ถึงจะใช้ได้อีก (ยกเลิกสิทธิ์ฝั่งร้านได้ที่ Seller Center › App Store › My apps)`
            : confirmDisc === "shopee"
              ? `ระบบจะลบกุญแจ Shopee ของ ${brand?.name ?? "แบรนด์นี้"} — ไม่แตะอะไรบนร้าน · ต้องกดเชื่อมต่อใหม่ (เข้าสู่ระบบร้าน + OTP) ถึงจะใช้ได้อีก`
              : `${brand?.name ?? "แบรนด์นี้"} จะโพสต์ Facebook/Instagram อัตโนมัติไม่ได้ (คิวโพสต์ที่รออยู่จะล้ม) จนกว่าจะเชื่อมใหม่`}
        onConfirm={() => { const d = confirmDisc; setConfirmDisc(null); if (d === "lazada") void disconnectLaz(); else if (d === "tiktok") void disconnectTts(); else if (d === "shopee") void disconnectShp(); else void disconnectFb(); }} />
    </div>
    </AppAccessGate>
  );
}
