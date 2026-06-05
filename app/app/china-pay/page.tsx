"use client";

/**
 * แอปเดี่ยว (standalone) "โอนเงินจีน" — mobile-first สำหรับมือถือ/iPad
 * เปิดผ่าน /app/china-pay · เห็นแค่โมดูลนี้ ไม่มี sidebar/โมดูลอื่น
 * reuse data layer กลาง: /api/master-v2/china-bills + RelationPicker + FileInput + toast
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth, roleLabel } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { FileMultiInput } from "@/components/file-multi-input";

const SUPPLIER_CFG: RelationConfig = {
  target_table: "partners_v2", target_module_key: "partners-v2",
  target_label_field: "name_th", target_search_fields: ["name_th", "name_en"], allow_create: false,
  filter: { column: "shop_country", value: "จีน" },   // โชว์เฉพาะร้านจีน
} as RelationConfig;

// บริษัทสำหรับบิล CTW — เฉพาะที่ติ๊ก "ซื้อบิล" (buy_bill = true)
const CTW_PARTNER_CFG: RelationConfig = {
  target_table: "partners_v2", target_module_key: "partners-v2",
  target_label_field: "name_th", target_search_fields: ["name_th", "name_en"], allow_create: false,
  filter: { column: "buy_bill", value: "true" },
} as RelationConfig;

// ---------------- Portal (ของกลาง) — แปะ popup ที่ body ให้ลอยกลางจอเสมอ (พ้น transform ของหน้า) ----------------
function Portal({ children }: { children: React.ReactNode }) {
  const [el] = useState<HTMLDivElement | null>(() => (typeof document !== "undefined" ? document.createElement("div") : null));
  useEffect(() => {
    if (!el) return;
    document.body.appendChild(el);
    return () => { try { document.body.removeChild(el); } catch { /* noop */ } };
  }, [el]);
  if (!el) return null;
  return createPortal(children, el);
}

// ---------------- Animation "บันทึกสำเร็จ" (ของกลางใน china-pay) ----------------
type CelebrateFn = (msg?: string, opts?: { confetti?: boolean }) => void;
const CelebrateCtx = createContext<CelebrateFn>(() => {});
const useCelebrate = () => useContext(CelebrateCtx);

function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ id: number; msg: string; confetti: boolean } | null>(null);
  const fire = useCallback<CelebrateFn>((msg = "บันทึกสำเร็จ", opts) => {
    setState(s => ({ id: (s?.id ?? 0) + 1, msg, confetti: !!opts?.confetti }));
  }, []);
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), state.confetti ? 1900 : 1300);
    return () => clearTimeout(t);
  }, [state]);
  // กระดาษโปรย (สุ่มตำแหน่ง/สี ครั้งเดียวต่อการแสดง)
  const pieces = useMemo(() => {
    if (!state?.confetti) return [];
    const colors = ["#fb923c", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#a78bfa"];
    return Array.from({ length: 30 }, (_, i) => ({
      left: ((i * 37) % 100),
      delay: (i % 8) * 55,
      dur: 1100 + (i % 5) * 200,
      color: colors[i % colors.length],
    }));
  }, [state?.id, state?.confetti]);

  return (
    <CelebrateCtx.Provider value={fire}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/10 cpok-bg" />
          <div className="cpok-card relative flex flex-col items-center gap-3">
            <svg viewBox="0 0 80 80" className="w-24 h-24 drop-shadow-lg">
              <circle cx="40" cy="40" r="37" fill="#10b981" />
              <path d="M24 41 L35 53 L57 28" className="cpok-check" />
            </svg>
            <div className="text-white font-semibold text-lg drop-shadow">{state.msg}</div>
          </div>
          {state.confetti && (
            <div className="absolute inset-0 overflow-hidden">
              {pieces.map((p, i) => (
                <span key={i} className="cpok-confetti"
                  style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}ms`, animationDuration: `${p.dur}ms` }} />
              ))}
            </div>
          )}
        </div>
      )}
    </CelebrateCtx.Provider>
  );
}

const VAT_RATE = 0.07;   // ภาษี 7%

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 4 });
// วันที่ "วันนี้" อิงเวลาเครื่อง (ไทย) — ห้ามใช้ toISOString (UTC) เพราะช่วงเช้าไทยจะกลายเป็นเมื่อวาน
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// ค่าโอน (¥) ตามชั้นยอด
const FEE_TABLE = [
  { label: "1 – 4,999", fee: 3 }, { label: "5,000 – 9,999", fee: 5 },
  { label: "10,000 – 29,999", fee: 10 }, { label: "30,000 – 49,999", fee: 30 },
  { label: "50,000 ขึ้นไป", fee: 50 },
];
function feeFor(amt: number): number {
  if (amt <= 0) return 0;
  if (amt <= 4999) return 3;
  if (amt <= 9999) return 5;
  if (amt <= 29999) return 10;
  if (amt <= 49999) return 30;
  return 50;
}
// เรทตามชั้นยอด — กรอกแค่ R1, R2-R4 = R1 ลบส่วนต่างคงที่
const RATE_OFFSET = { r2: 0.035, r3: 0.075, r4: 0.08 };
const RATE_TABLE = [
  { tier: "R1", label: "1 – 5,000", off: 0 }, { tier: "R2", label: "5,001 – 99,999", off: RATE_OFFSET.r2 },
  { tier: "R3", label: "100,000 – 399,999", off: RATE_OFFSET.r3 }, { tier: "R4", label: "400,000 ขึ้นไป", off: RATE_OFFSET.r4 },
];
function rateFor(amt: number, r1: number): number {
  if (!r1) return 0;
  if (amt <= 5000) return r1;
  if (amt <= 99999) return +(r1 - RATE_OFFSET.r2).toFixed(4);
  if (amt <= 399999) return +(r1 - RATE_OFFSET.r3).toFixed(4);
  return +(r1 - RATE_OFFSET.r4).toFixed(4);
}

type Tab = "dashboard" | "bill" | "transfer" | "transfers" | "all" | "rate" | "ctw" | "automation" | "menusettings";

// บันทึกรูปลงเครื่อง — บน iPhone ใช้ share sheet (Save Image เข้า Photos, ไม่เปิดแท็บใหม่)
// บน desktop ใช้ <a download> ปกติ (โหลดไฟล์ลงเครื่อง ไม่เปิดแท็บใหม่)
async function downloadOrSaveImage(blob: Blob, filename: string): Promise<void> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iP(hone|ad|od)/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && (navigator as Navigator).maxTouchPoints > 1);
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (isIOS && nav.canShare) {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (nav.canShare({ files: [file] })) { await nav.share({ files: [file] }); return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ขอเรท — ส่งข้อความเข้า LINE กลุ่มอัตโนมัติ (fallback เป็น share ถ้ายังไม่ตั้งค่า LINE)
async function requestRateViaLine(): Promise<void> {
  const text = "ขอเรทเงินด้วยค่ะ";
  try {
    const res = await apiFetch("/api/china-pay/line-push", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) { toast.success("ส่งขอเรทเข้ากลุ่มแล้ว"); return; }
    const j = await res.json().catch(() => ({} as { needConfig?: boolean; error?: string }));
    if (j?.needConfig) { window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank"); return; }
    toast.error(j?.error ?? "ส่งขอเรทไม่สำเร็จ");
  } catch {
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
  }
}

const STATUS_STYLE: Record<string, string> = {
  "รอโอน": "bg-amber-100 text-amber-700", "โอนแล้ว": "bg-emerald-100 text-emerald-700", "ยกเลิก": "bg-slate-100 text-slate-500",
  "โอนแล้วบางส่วน": "bg-sky-100 text-sky-700", "โอนครบแล้ว": "bg-emerald-100 text-emerald-700",
};

// ---- สลิปการโอน (หลายใบ) — เก็บ ธนาคาร/ยอด/เวลา/ผูกบิล CTW ----
type TxSlip = { key: string; bank: string; amount: number; at: string; bill_id?: string };
// แปลงข้อความวันเวลาที่ AI อ่านได้ → format ของ <input type="datetime-local"> (YYYY-MM-DDThh:mm) · อ่านไม่ออก = ""
function toDatetimeLocal(text: string): string {
  if (!text) return "";
  const d = new Date(text);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- สถานะบิลจีน 3 ระดับ (คิดจากยอดรวมสลิปเทียบยอดบิล) ----
type Slip = { key: string; amount_rmb: number; at?: string };
const billSlips = (b: Record<string, unknown>): Slip[] =>
  Array.isArray(b.slips) ? (b.slips as Record<string, unknown>[]).map((s) => ({ key: String(s.key ?? ""), amount_rmb: num(s.amount_rmb), at: s.at ? String(s.at) : undefined })) : [];
const billTotalRmb = (b: Record<string, unknown>) => num(b.amount_rmb) + num(b.fee_rmb);
const slipSumRmb = (b: Record<string, unknown>) => billSlips(b).reduce((a, s) => a + s.amount_rmb, 0);
// บิลแบบบาท (ค่าส่ง/VAT) — ยอดเป็น ฿ ตรง ไม่ใช้เรท ไม่มีสลิป ¥
const isThbBill = (b: Record<string, unknown>): boolean => !!b.is_shipping || !!b.vat_type;
const billTypeLabel = (b: Record<string, unknown>): string =>
  b.is_shipping ? "ค่าส่ง" : b.vat_type ? `VAT ${String(b.vat_type)}` : "";
// ชื่อที่โชว์ในรายการ: ประเภท (ค่าส่ง/VAT) หรือชื่อร้าน
const billDisplayName = (b: Record<string, unknown>): string =>
  billTypeLabel(b) || String(b.supplier_label ?? b.supplier_id ?? "—");
// คืนสถานะ: ยกเลิก / รอโอน / โอนแล้วบางส่วน / โอนครบแล้ว
function billStatus3(b: Record<string, unknown>): string {
  if (String(b.status ?? "") === "ยกเลิก") return "ยกเลิก";
  if (isThbBill(b)) return String(b.status ?? "") === "โอนแล้ว" ? "โอนครบแล้ว" : "รอโอน";
  const total = billTotalRmb(b), sum = slipSumRmb(b);
  if (total > 0 && sum >= total - 0.001) return "โอนครบแล้ว";
  if (sum > 0) return "โอนแล้วบางส่วน";
  return "รอโอน";
}

const MENU: { k: Tab; icon: string; label: string }[] = [
  { k: "dashboard", icon: "📊", label: "Dashboard" },
  { k: "bill", icon: "💴", label: "ลงบิล" },
  { k: "transfer", icon: "💰", label: "โอนเข้าจีน" },
  { k: "transfers", icon: "🧾", label: "รายการโอน" },
  { k: "all", icon: "📋", label: "บิลจีนทั้งหมด" },
  { k: "rate", icon: "💱", label: "เรท" },
  { k: "ctw", icon: "📑", label: "บิลจาก CTW" },
  { k: "automation", icon: "🤖", label: "กฎอัตโนมัติ" },
];
const ALL_TAB_KEYS = MENU.map(m => m.k);

// บทบาทที่ตั้งสิทธิ์เมนูได้ (admin เห็นทุกเมนูเสมอ)
const ROLE_OPTS: { key: string; label: string }[] = [
  { key: "manager", label: "ผู้จัดการ" },
  { key: "ops", label: "ฝ่ายปฏิบัติการ" },
  { key: "staff", label: "พนักงาน" },
  { key: "editor", label: "ผู้แก้ไข" },
  { key: "viewer", label: "ดูอย่างเดียว" },
  { key: "marketplace", label: "มาร์เก็ตเพลส" },
];

export default function ChinaPayApp() {
  const { user, ready, logout } = useAuth();
  const [acctOpen, setAcctOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCfg, setMenuCfg] = useState<Record<string, string[]>>({});
  const [preselect, setPreselect] = useState<string[]>([]);   // บิลจีนที่เลือกจากหน้า "ทั้งหมด" → ส่งไปหน้าโอน
  const [deepBill, setDeepBill] = useState<Record<string, unknown> | null>(null);   // เปิดบิลจากลิงก์ ?bill=id
  const [deepTransfer, setDeepTransfer] = useState<Record<string, unknown> | null>(null);   // เปิดใบสรุปการโอนจากลิงก์ ?transfer=id
  const [rateMissing, setRateMissing] = useState(false);   // วันนี้ยังไม่มีเรท → โชว์ badge เตือน

  // เช็คว่าวันนี้มีเรทหรือยัง (badge เตือนบนเมนูเรท)
  useEffect(() => {
    const td = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    apiFetch("/api/master-v2/daily-rates?limit=10&sort_by=rate_date&sort_dir=desc").then(r => r.json())
      .then(j => setRateMissing(!(j.data ?? []).some((x: Record<string, unknown>) => String(x.rate_date) === td)))
      .catch(() => {});
  }, [tab]);

  // โหลดสิทธิ์เมนูตาม role
  useEffect(() => {
    apiFetch("/api/master-v2/china-app-settings?limit=5").then(r => r.json()).then(j => {
      const row = (j.data ?? []).find((x: Record<string, unknown>) => x.skey === "menu_roles");
      if (row && row.sval && typeof row.sval === "object") setMenuCfg(row.sval as Record<string, string[]>);
    }).catch(() => {});
  }, []);

  // ลิงก์ ?bill=id → เปิดรายละเอียดบิล / ?transfer=id → เปิดใบสรุปการโอน
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const billId = p.get("bill"), txId = p.get("transfer");
    if (billId) {
      apiFetch(`/api/master-v2/china-bills/${billId}`).then(r => r.json()).then(j => { if (j.data) setDeepBill(j.data); }).catch(() => {});
    }
    if (txId) {
      Promise.all([
        apiFetch(`/api/master-v2/china-transfers/${txId}`).then(r => r.json()).catch(() => ({})),
        apiFetch(`/api/master-v2/partners?limit=500`).then(r => r.json()).catch(() => ({ data: [] })),
      ]).then(([tr, pn]) => {
        const row = tr.data; if (!row) return;
        const pmap: Record<string, Record<string, unknown>> = {};
        (pn.data ?? []).forEach((x: Record<string, unknown>) => { const k = String(x.name_th ?? "").trim(); if (k) pmap[k] = x; });
        const lines = (Array.isArray(row.lines) ? row.lines : []).map((l: Record<string, unknown>) => {
          if (l.kind !== "china") return l;
          const sp = pmap[String(l.label ?? "").trim()] ?? {};
          return { ...l, sup: { name_en: sp.name_en ?? "", phone: sp.phone ?? "", bank_account_name: sp.bank_account_name ?? "", account_number: sp.account_number ?? "", bank_name_brief: sp.bank_name_brief ?? "" } };
        });
        const lo = Number(String(row.leftover_rmb ?? "0").replace(/,/g, "")) || 0;
        setDeepTransfer({ transfer_id: String(row.id ?? ""), transfer_no: row.transfer_no, date: row.transfer_date, ref_no: row.ref_no, rate: row.rate, transferred: row.amount_transferred_thb, chinaInRmb: Math.max(0, lo), lines, attachments: Array.isArray(row.attachments) ? row.attachments.map(String) : [] });
      }).catch(() => {});
    }
    if (billId || txId) window.history.replaceState({}, "", "/app/china-pay");
  }, []);

  if (!ready) return <Center>กำลังโหลด…</Center>;
  if (!user) return (
    <Center>
      <div className="text-slate-500 mb-3">กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
      <Link href="/login?next=/app/china-pay" className="h-10 px-5 leading-10 bg-blue-600 text-white rounded-lg font-medium">เข้าสู่ระบบ</Link>
    </Center>
  );

  const isAdmin = user.role === "admin";
  const allowed = isAdmin ? ALL_TAB_KEYS : (menuCfg[user.role] ?? ALL_TAB_KEYS);
  const navMenu: { k: Tab; icon: string; label: string }[] = MENU.filter(m => allowed.includes(m.k));
  if (isAdmin) navMenu.push({ k: "menusettings", icon: "⚙️", label: "ตั้งค่าเมนู" });

  const renderTab: Tab = navMenu.some(m => m.k === tab) ? tab : (navMenu[0]?.k ?? "dashboard");
  const current = navMenu.find(m => m.k === renderTab);
  const go = (k: Tab) => { setTab(k); setMenuOpen(false); };

  // แถบล่าง: โชว์ไม่เกิน 4 + ปุ่ม "⋯ เพิ่มเติม" ถ้ามีมากกว่า
  const bottomItems = navMenu.slice(0, 4);
  const hasMore = navMenu.length > bottomItems.length;
  const cols = bottomItems.length + (hasMore ? 1 : 0);

  return (
    <CelebrateProvider>
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @keyframes cpRise{from{opacity:0}to{opacity:1}}
        .cp-anim{animation:cpRise .35s ease both}
        @keyframes cpSpin{to{transform:rotate(360deg)}}
        .cp-spin{display:inline-block;animation:cpSpin 1.1s linear infinite}
        @keyframes cpFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(18px,-22px) scale(1.08)}66%{transform:translate(-16px,12px) scale(.95)}}
        .cp-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
        .cp-bg i{position:absolute;border-radius:50%;filter:blur(34px);opacity:.45;animation:cpFloat 14s ease-in-out infinite}
        .cp-bg .b1{width:200px;height:200px;background:#fdba74;top:18%;left:-50px;animation-delay:0s}
        .cp-bg .b2{width:240px;height:240px;background:#fed7aa;top:45%;right:-70px;animation-delay:-4s}
        .cp-bg .b3{width:180px;height:180px;background:#fcd34d;bottom:8%;left:30%;animation-delay:-8s;opacity:.3}
        /* กันเครื่อง dark mode ทำให้ตัวอักษรในช่องกรอก/วันที่ขาวจนอ่านไม่ออก */
        input,textarea,select{color-scheme:light;color:#1e293b}
        /* บันทึกสำเร็จ */
        @keyframes cpokIn{0%{opacity:0;transform:scale(.6)}55%{opacity:1;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}
        .cpok-card{animation:cpokIn .4s cubic-bezier(.2,.8,.3,1.5) both}
        @keyframes cpokFade{from{opacity:0}to{opacity:1}}
        .cpok-bg{animation:cpokFade .25s ease both}
        .cpok-check{fill:none;stroke:#fff;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:64;stroke-dashoffset:64;animation:cpokDraw .45s .2s ease forwards}
        @keyframes cpokDraw{to{stroke-dashoffset:0}}
        @keyframes cpokFall{0%{transform:translateY(-12vh) rotate(0);opacity:1}100%{transform:translateY(112vh) rotate(560deg);opacity:.85}}
        .cpok-confetti{position:absolute;top:0;width:9px;height:14px;border-radius:2px;animation-name:cpokFall;animation-timing-function:linear;animation-fill-mode:forwards}
        @media print {
          body * { visibility:hidden !important }
          #tx-receipt, #tx-receipt * { visibility:visible !important }
          /* เผื่อขอบกระดาษ (เครื่องพิมพ์มี non-printable margin) กันค่าตัวขวาสุดโดนตัด */
          #tx-receipt { position:absolute; left:0; top:0; width:100%; padding:24px 48px !important; box-sizing:border-box; overflow:visible !important; }
          @page { margin:10mm; }
        }
      `}</style>
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-sm relative overflow-hidden">
        <div className="cp-bg" aria-hidden><i className="b1"></i><i className="b2"></i><i className="b3"></i></div>
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-gradient-to-br from-orange-400 to-orange-600 text-white px-4 pt-3 pb-5 rounded-b-3xl shadow-lg shadow-orange-500/20 overflow-hidden">
          <div className="pointer-events-none absolute -right-8 -top-10 w-40 h-40 bg-white/10 rounded-full" />
          <div className="pointer-events-none absolute right-10 top-6 w-20 h-20 bg-white/10 rounded-full" />
          <div className="relative flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} aria-label="เมนู"
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/20 hover:bg-white/30 text-xl active:scale-95 transition">☰</button>
            <div className="font-bold text-lg flex-1 truncate">{current ? `${current.icon} ${current.label}` : "💸 โอนเงินจีน"}</div>
            <button onClick={() => setAcctOpen(true)}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 active:scale-95 transition rounded-full pl-1 pr-3 py-1 text-xs">
              <span className="w-6 h-6 rounded-full bg-white text-orange-600 flex items-center justify-center font-bold">{(user.name || "?").slice(0, 1).toUpperCase()}</span>
              <span className="truncate max-w-[90px]">{user.name}</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main key={renderTab} className="cp-anim relative z-10 flex-1 overflow-y-auto p-4 pb-28">
          {rateMissing && renderTab !== "rate" && (
            <button onClick={() => go("rate")}
              className="w-full mb-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-sm text-left animate-pulse">
              <span className="text-lg">⚠️</span>
              <span className="flex-1">วันนี้ยังไม่ได้ใส่เรท — แตะเพื่อใส่เรทก่อนโอน</span>
              <span className="text-xs font-semibold">ใส่เรท →</span>
            </button>
          )}
          {renderTab === "dashboard" && <Dashboard onGo={go} />}
          {renderTab === "bill" && <BillForm />}
          {renderTab === "all" && <AllList canDelete={isAdmin} />}
          {renderTab === "rate" && <RateTab />}
          {renderTab === "ctw" && <CtwList canDelete={isAdmin} />}
          {renderTab === "transfer" && <TransferPage preselect={preselect} onConsumePreselect={() => setPreselect([])} />}
          {renderTab === "transfers" && <TransferList canDelete={isAdmin} />}
          {renderTab === "automation" && <AutomationPage />}
          {renderTab === "menusettings" && isAdmin && <MenuSettings onSaved={setMenuCfg} />}
        </main>

        {/* แถบเมนูล่าง — ซ่อนตอนอยู่หน้าโอน (ใช้ ☰ สลับแทน) เพื่อให้ปุ่มบันทึกติดล่างสุดไม่ซ้อน */}
        {cols > 0 && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 grid z-20 px-1 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.06)]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {bottomItems.map(m => {
              const on = renderTab === m.k;
              return (
                <button key={m.k} onClick={() => go(m.k)}
                  className={`py-1.5 flex flex-col items-center gap-1 text-[10px] transition ${on ? "text-orange-600 font-semibold" : "text-slate-400"}`}>
                  <span className={`text-lg leading-none px-3 py-1 rounded-2xl transition ${on ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/40" : ""}`}>{m.icon}</span>{m.label}
                </button>
              );
            })}
            {hasMore && (
              <button onClick={() => setMenuOpen(true)}
                className="py-1.5 flex flex-col items-center gap-1 text-[10px] text-slate-400">
                <span className="text-lg leading-none px-3 py-1">⋯</span>เพิ่มเติม
              </button>
            )}
          </nav>
        )}
      </div>

      {/* เมนูทั้งหมด (เด้งจากปุ่ม ☰) */}
      {menuOpen && (
        <div className="fixed inset-0 z-[120] bg-black/40" onClick={() => setMenuOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-72 max-w-[80%] bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white px-4 py-4">
              <div className="font-semibold text-lg">💸 โอนเงินจีน</div>
              <div className="text-xs opacity-90 mt-0.5">{user.name}</div>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {navMenu.map(m => (
                <button key={m.k} onClick={() => go(m.k)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left ${renderTab === m.k ? "bg-orange-50 text-orange-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                  <span className="text-xl w-7 text-center">{m.icon}</span>
                  <span className="flex-1">{m.label}</span>
                  {m.k === "rate" && rateMissing && (
                    <span className="flex-shrink-0 text-[10px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5 animate-pulse">ยังไม่ใส่เรท</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* เมนูบัญชีพนักงาน (กดชื่อมุมขวาบน) */}
      {acctOpen && (
        <div className="fixed inset-0 z-[130] bg-black/40 flex items-start justify-end p-3" onClick={() => setAcctOpen(false)}>
          <div className="mt-14 w-72 max-w-[88%] bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 text-white px-4 py-4 flex items-center gap-3">
              <span className="w-12 h-12 rounded-full bg-white text-orange-600 flex items-center justify-center font-bold text-xl">{(user.name || "?").slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{user.name}</div>
                <div className="text-xs opacity-90">{roleLabel(user.role)}</div>
              </div>
            </div>
            <div className="p-3 space-y-1">
              <div className="px-2 py-1.5 text-xs text-slate-400">{user.email}</div>
              <Link href="/payroll/employees" onClick={() => setAcctOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50">👤 หน้าพนักงาน</Link>
              <button onClick={async () => { setAcctOpen(false); await logout(); window.location.href = "/login?next=/app/china-pay"; }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 font-medium">🚪 ออกจากระบบ (Logout)</button>
            </div>
          </div>
        </div>
      )}

      {/* เปิดบิล/ใบสรุปจากลิงก์ */}
      {deepBill && <BillDetail bill={deepBill} onClose={() => setDeepBill(null)} />}
      {deepTransfer && <TransferReceiptPopup t={deepTransfer} onClose={() => setDeepTransfer(null)} />}
    </div>
    </CelebrateProvider>
  );
}

// ---------------- ตั้งค่าเมนูตาม role (เฉพาะแอดมิน) ----------------
function MenuSettings({ onSaved }: { onSaved: (c: Record<string, string[]>) => void }) {
  const toast = useToast();
  const [local, setLocal] = useState<Record<string, string[]>>({});
  const [rowId, setRowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // ตั้งค่า LINE Bot (ส่งเข้ากลุ่มอัตโนมัติ)
  const [lineRowId, setLineRowId] = useState<string | null>(null);
  const [lineToken, setLineToken] = useState("");
  const [lineGroup, setLineGroup] = useState("");
  const [lineShareBase, setLineShareBase] = useState("");   // R2 public base URL (สำหรับส่งรูปเข้า LINE)
  const [lineSaving, setLineSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/master-v2/china-app-settings?limit=20").then(r => r.json()).then(j => {
      const rows = j.data ?? [];
      const row = rows.find((x: Record<string, unknown>) => x.skey === "menu_roles");
      if (row) { setRowId(String(row.id)); if (row.sval && typeof row.sval === "object") setLocal(row.sval as Record<string, string[]>); }
      const lrow = rows.find((x: Record<string, unknown>) => x.skey === "line_config");
      if (lrow) { setLineRowId(String(lrow.id)); const v = (lrow.sval ?? {}) as Record<string, string>; setLineToken(String(v.token ?? "")); setLineGroup(String(v.group_id ?? "")); setLineShareBase(String(v.share_base ?? "")); }
    }).catch(() => {});
  }, []);

  const saveLine = async () => {
    setLineSaving(true);
    try {
      const sval = { token: lineToken.trim(), group_id: lineGroup.trim(), share_base: lineShareBase.trim().replace(/\/$/, "") };
      const res = lineRowId
        ? await apiFetch(`/api/master-v2/china-app-settings/${lineRowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sval, actor: "china-app" }) })
        : await apiFetch(`/api/master-v2/china-app-settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skey: "line_config", sval, actor: "china-app" }) });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      if (!lineRowId && j.data?.id) setLineRowId(String(j.data.id));
      toast.success("บันทึกตั้งค่า LINE แล้ว");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setLineSaving(false); }
  };

  // ดึง Group ID ที่ webhook จับได้ (โหลด line_config ใหม่)
  const reloadLineCfg = async () => {
    try {
      const j = await apiFetch("/api/master-v2/china-app-settings?limit=20").then(r => r.json());
      const lrow = (j.data ?? []).find((x: Record<string, unknown>) => x.skey === "line_config");
      const v = (lrow?.sval ?? {}) as Record<string, string>;
      if (v.group_id) { setLineGroup(String(v.group_id)); toast.success(`ได้ Group ID แล้ว: ${v.group_id}`); }
      else toast.error("ยังไม่พบ Group ID — เชิญบอทเข้ากลุ่ม + พิมพ์ในกลุ่ม 1 ครั้งก่อน");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
  };
  const webhookUrl = "https://cyivhkecxeoonlowcvaz.supabase.co/functions/v1/line-webhook";

  const isOn = (role: string, k: string) => (local[role] ?? ALL_TAB_KEYS).includes(k);
  const toggle = (role: string, k: string) => setLocal(prev => {
    const cur = prev[role] ?? ALL_TAB_KEYS;
    const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
    return { ...prev, [role]: next };
  });
  const save = async () => {
    if (!rowId) { toast.error("ยังโหลดไม่เสร็จ ลองใหม่"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/china-app-settings/${rowId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sval: local, actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("บันทึกสิทธิ์เมนูแล้ว"); onSaved(local);
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-500">เลือกว่าแต่ละบทบาทเห็นเมนูไหนได้บ้าง — แอดมินเห็นทุกเมนูเสมอ</div>
      {ROLE_OPTS.map(role => (
        <Card key={role.key}>
          <div className="font-semibold text-slate-800 mb-2">{role.label} <span className="text-xs text-slate-400">({role.key})</span></div>
          <div className="grid grid-cols-2 gap-2">
            {MENU.map(m => {
              const on = isOn(role.key, m.k);
              return (
                <button key={m.k} onClick={() => toggle(role.key, m.k)}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border text-sm ${on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400"}`}>
                  <span>{on ? "✓" : "○"}</span><span className="truncate">{m.icon} {m.label}</span>
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      <button onClick={save} disabled={saving}
        className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50">
        {saving ? "กำลังบันทึก…" : "บันทึกสิทธิ์เมนู"}
      </button>

      {/* ตั้งค่า LINE Bot (ส่งเข้ากลุ่มอัตโนมัติ) */}
      <Card>
        <div className="font-semibold text-slate-800 mb-1">📩 ตั้งค่า LINE (ส่งเข้ากลุ่มอัตโนมัติ)</div>
        <div className="text-[11px] text-slate-400 mb-3">วางค่าจาก LINE Official Account · ถ้าเว้นว่าง ระบบจะใช้แบบเลือกกลุ่มเอง (share)</div>
        <Label>Channel Access Token</Label>
        <input value={lineToken} onChange={e => setLineToken(e.target.value)} placeholder="วาง token ยาว ๆ ที่นี่"
          className="w-full h-11 px-3 text-sm border border-slate-200 rounded-lg" />
        <div className="mt-3"><Label>Group ID</Label>
          <div className="flex gap-2">
            <input value={lineGroup} onChange={e => setLineGroup(e.target.value)} placeholder="เช่น Cxxxxxxxx"
              className="flex-1 h-11 px-3 text-sm border border-slate-200 rounded-lg" />
            <button type="button" onClick={reloadLineCfg} className="flex-shrink-0 h-11 px-3 rounded-lg bg-slate-700 text-white text-xs font-medium">🔄 ดึงอัตโนมัติ</button>
          </div>
        </div>
        <div className="mt-3"><Label>R2 Public URL (สำหรับส่งรูปเข้า LINE)</Label>
          <input value={lineShareBase} onChange={e => setLineShareBase(e.target.value)} placeholder="https://pub-xxxx.r2.dev"
            className="w-full h-11 px-3 text-sm border border-slate-200 rounded-lg" />
          <div className="text-[11px] text-slate-400 mt-1">เปิด Public access ของ bucket “china-pay-share” ใน Cloudflare → เอา URL r2.dev มาวาง (เว้นว่าง = ส่งเป็นข้อความ)</div>
        </div>
        <button onClick={saveLine} disabled={lineSaving}
          className="mt-3 w-full h-11 bg-[#06C755] text-white rounded-lg font-semibold disabled:opacity-50">
          {lineSaving ? "กำลังบันทึก…" : "บันทึกตั้งค่า LINE"}
        </button>
        {/* Webhook URL สำหรับดึง Group ID */}
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-2.5">
          <div className="text-[11px] text-slate-500 mb-1">เอา URL นี้ไปวางใน LINE Developers → Messaging API → Webhook URL (เปิด Use webhook)</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-slate-700 break-all">{webhookUrl}</code>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(webhookUrl); toast.success("คัดลอก URL แล้ว"); }}
              className="flex-shrink-0 h-8 px-2 rounded-lg bg-slate-700 text-white text-[11px]">📋</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">{children}</div>;
}

// ---------------- Dashboard ----------------
// ---------------- การ์ดยอดเงินคงเหลือที่จีน (¥) + จัดการ (ตั้งต้น/เติม/ปรับ) ----------------
type BalAdj = { id: string; kind: string; amount_rmb: number; amount_thb: number; note: string | null; actor: string | null; created_at: string };
function ChinaBalanceCard() {
  const toast = useToast();
  const [bal, setBal] = useState<{ rmb: number; thb: number }>({ rmb: 0, thb: 0 });
  const [hist, setHist] = useState<BalAdj[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"set" | "topup" | "adjust">("topup");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [r1, setR1] = useState(0);   // เรทล่าสุด สำหรับคำนวณ ฿ ของรายการปรับมือ

  const load = useCallback(() => {
    apiFetch("/api/china-pay/balance").then(r => r.json()).then(j => {
      if (!j.error) { setBal({ rmb: num(j.rmb), thb: num(j.thb) }); setHist(j.adjustments ?? []); }
    }).catch(() => {});
    apiFetch("/api/master-v2/daily-rates?limit=1&sort_by=rate_date&sort_dir=desc").then(r => r.json())
      .then(j => setR1(num((j.data ?? [])[0]?.rate))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const x = num(amt);
    if (mode !== "adjust" && x <= 0) { toast.error("กรอกจำนวนเงิน"); return; }
    if (mode === "adjust" && x === 0) { toast.error("กรอกจำนวน (+ เพิ่ม / − ลด)"); return; }
    // คำนวณ delta ¥ ที่จะบันทึก
    const deltaRmb = mode === "set" ? +(x - bal.rmb).toFixed(2) : x;   // set = ตั้งให้เท่ากับ x
    const deltaThb = r1 ? +(deltaRmb * r1).toFixed(2) : 0;
    setBusy(true);
    try {
      const res = await apiFetch("/api/china-pay/balance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: mode, amount_rmb: deltaRmb, amount_thb: deltaThb, note: note.trim() || null, actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      setBal({ rmb: num(j.rmb), thb: num(j.thb) });
      toast.success("อัปเดตยอดแล้ว");
      setAmt(""); setNote(""); load();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const kindLabel: Record<string, string> = { set: "ตั้งยอด", topup: "เติมเงิน", adjust: "ปรับยอด" };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="block w-full text-left rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white p-4 shadow-sm active:scale-[0.99] transition-transform">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-90">🏦 ยอดเงินคงเหลือที่จีน</div>
          <span className="text-[11px] opacity-90">กดเพื่อจัดการ ›</span>
        </div>
        <div className="flex items-end justify-between mt-1">
          <div className="text-3xl font-bold">¥{fmt(bal.rmb)}</div>
          <div className="text-base font-medium opacity-95">≈ ฿{fmt(bal.thb)}</div>
        </div>
      </button>

      {open && (
        <Portal>
        <div className="fixed inset-0 z-[9999] bg-black/40 overflow-y-auto overscroll-contain" onClick={() => !busy && setOpen(false)}>
          <div className="min-h-full flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-slate-800">จัดการยอดเงินที่จีน</span>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-xl leading-none">×</button>
            </div>
            <div className="p-4 space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-700">ยอดคงเหลือปัจจุบัน</div>
                <div className="text-2xl font-bold text-emerald-800">¥{fmt(bal.rmb)}</div>
                <div className="text-xs text-emerald-600">≈ ฿{fmt(bal.thb)}</div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(["topup", "adjust", "set"] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`h-9 rounded-lg text-xs font-medium border ${mode === m ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 text-slate-600"}`}>
                    {m === "topup" ? "เติมเงิน" : m === "adjust" ? "ปรับ +/−" : "ตั้งยอด"}
                  </button>
                ))}
              </div>

              <div>
                <div className="text-[11px] text-slate-400 mb-1">
                  {mode === "set" ? "ตั้งยอดให้เท่ากับ (¥)" : mode === "topup" ? "เติมเข้า (¥)" : "ปรับ (ใส่ − เพื่อลด) (¥)"}
                </div>
                <Num value={amt} onChange={setAmt} placeholder={mode === "adjust" ? "เช่น -500" : "เช่น 5000"} />
                {num(amt) !== 0 && r1 > 0 && <div className="text-[11px] text-slate-400 mt-1">≈ ฿{fmt(num(amt) * r1)} (เรท {fmt(r1)})</div>}
              </div>
              <div>
                <div className="text-[11px] text-slate-400 mb-1">หมายเหตุ (ไม่บังคับ)</div>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น เติมเงินเข้าบัญชีจีน"
                  className="w-full h-11 px-3 text-sm border border-slate-200 rounded-lg" />
              </div>
              <button onClick={submit} disabled={busy}
                className="w-full h-11 bg-emerald-600 text-white rounded-lg font-semibold disabled:opacity-50">
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>

              {hist.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-xs text-slate-400 mb-1">ประวัติปรับยอดล่าสุด</div>
                  <div className="space-y-1">
                    {hist.slice(0, 8).map(h => (
                      <div key={h.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">{kindLabel[h.kind] ?? h.kind} · {String(h.created_at).slice(0, 10)}{h.note ? ` · ${h.note}` : ""}</span>
                        <span className={`font-medium ${num(h.amount_rmb) < 0 ? "text-red-500" : "text-emerald-700"}`}>{num(h.amount_rmb) > 0 ? "+" : ""}¥{fmt(num(h.amount_rmb))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}

function Dashboard({ onGo }: { onGo: (k: Tab) => void }) {
  const [pending, setPending] = useState<Record<string, unknown>[]>([]);
  const [doneMonth, setDoneMonth] = useState<{ count: number; thb: number }>({ count: 0, thb: 0 });
  const [rate, setRate] = useState<Record<string, unknown> | null>(null);
  const [ctwCount, setCtwCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ym = today().slice(0, 7); // YYYY-MM
    const fPending = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "รอโอน" } }));
    const fDone = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "โอนแล้ว" } }));
    Promise.all([
      apiFetch(`/api/master-v2/china-bills?limit=200&filters=${fPending}`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/china-bills?limit=500&filters=${fDone}`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/daily-rates?limit=1&sort_by=rate_date&sort_dir=desc`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/ctw-bills?limit=500`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([p, d, rt, c]) => {
      setPending(p.data ?? []);
      const doneRows = (d.data ?? []).filter((r: Record<string, unknown>) => String(r.transfer_date ?? "").slice(0, 7) === ym);
      setDoneMonth({
        count: doneRows.length,
        thb: doneRows.reduce((a: number, r: Record<string, unknown>) => a + (num(r.amount_rmb) + num(r.fee_rmb)) * num(r.rate), 0),
      });
      setRate((rt.data ?? [])[0] ?? null);
      setCtwCount((c.data ?? []).length);
    }).finally(() => setLoading(false));
  }, []);

  const pendingRmb = pending.reduce((a, r) => a + num(r.amount_rmb) + num(r.fee_rmb), 0);
  const r1 = num(rate?.rate);

  if (loading) return <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>;

  return (
    <div className="space-y-4">
      {/* บิลรอโอน */}
      <button onClick={() => onGo("all")} className="block w-full text-left rounded-2xl bg-gradient-to-br from-orange-500 to-orange-500 text-white p-4 shadow-sm active:scale-[0.99] transition-transform">
        <div className="text-sm opacity-90">บิลจีนรอโอน</div>
        <div className="flex items-end justify-between mt-1">
          <div className="text-3xl font-bold">{pending.length} <span className="text-base font-normal opacity-90">บิล</span></div>
          <div className="text-xl font-semibold">¥{fmt(pendingRmb)}</div>
        </div>
      </button>

      {/* ยอดเงินคงเหลือที่จีน (จัดการ/ปรับยอดได้) */}
      <ChinaBalanceCard />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="โอนแล้วเดือนนี้" main={`${doneMonth.count} บิล`} sub={`฿${fmt(doneMonth.thb)}`} onClick={() => onGo("all")} />
        <StatCard label="เรทล่าสุด (R1)" main={r1 ? fmt(r1) : "—"} sub={r1 ? `R4 ${fmt(+(r1 - RATE_OFFSET.r4).toFixed(4))}` : "ยังไม่ตั้ง"} onClick={() => onGo("rate")} />
      </div>

      <StatCard label="บิลจาก CTW" main={`${ctwCount} บิล`} sub="ดูรายการ" onClick={() => onGo("ctw")} wide />

      {/* ปุ่มลัด */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button onClick={() => onGo("bill")} className="h-12 bg-orange-600 text-white rounded-xl font-semibold">+ ลงบิล</button>
        <button onClick={() => onGo("ctw")} className="h-12 border border-slate-300 text-slate-700 rounded-xl font-semibold">+ บิล CTW</button>
      </div>
    </div>
  );
}

function StatCard({ label, main, sub, onClick, wide }: { label: string; main: string; sub?: string; onClick?: () => void; wide?: boolean }) {
  return (
    <button onClick={onClick} className={`text-left bg-white rounded-xl border border-slate-200 p-3 active:scale-[0.99] transition-transform ${wide ? "w-full flex items-center justify-between" : ""}`}>
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-bold text-slate-800 mt-0.5">{main}</div>
      </div>
      {sub && <div className={`text-xs text-slate-500 ${wide ? "" : "mt-0.5"}`}>{sub}</div>}
    </button>
  );
}

// ---------------- ลงบิล (ไม่ใส่เรท — เรทมาตอนโอน) ----------------
function BillForm() {
  const toast = useToast();
  const celebrate = useCelebrate();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [sup, setSup] = useState<Record<string, unknown> | null>(null);
  const [isShipping, setIsShipping] = useState(false);              // บิลค่าส่ง (บาท)
  const [vatType, setVatType] = useState<"" | "ISG" | "IG">("");    // บิล VAT (บาท)
  const [amountThb, setAmountThb] = useState("");                   // ยอดบาท (ค่าส่ง/VAT)
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [billDate, setBillDate] = useState(today());   // วันที่ลงบิล (default วันนี้)
  const [files, setFiles] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feeInfo, setFeeInfo] = useState(false);
  const [savedBill, setSavedBill] = useState<Record<string, unknown> | null>(null);   // หลังบันทึก → popup พิมพ์
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  // ค่าโอนอัตโนมัติตามยอด (แก้มือทับได้)
  useEffect(() => {
    const a = num(amount);
    setFee(a > 0 ? String(feeFor(a)) : "");
  }, [amount]);

  // ดึงข้อมูลร้านเมื่อเลือก
  useEffect(() => {
    if (!supplierId) { setSup(null); return; }
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => setSup(null));
  }, [supplierId]);

  const totalRmb = num(amount) + num(fee);
  const thbMode = isShipping || !!vatType;                      // โหมดบาท (ค่าส่ง/VAT) — กรอกบาทตรง ไม่ใช้เรท
  const thbLabel = isShipping ? "ค่าส่ง" : vatType ? `VAT ${vatType}` : "";

  const save = async () => {
    setSaving(true);
    try {
      let payload: Record<string, unknown>;
      if (thbMode) {
        if (num(amountThb) <= 0) { toast.error("กรอกยอดรวม (฿)"); setSaving(false); return; }
        payload = {
          supplier_id: null, amount_rmb: 0, fee_rmb: 0,
          is_shipping: isShipping, vat_type: vatType || null, amount_thb: num(amountThb),
          transfer_date: transferDate || null, bill_date: billDate || null, note: note || null,
          attachments: files, status: "รอโอน", actor: "china-app",
        };
      } else {
        if (!supplierId) { toast.error("เลือกร้านค้า หรือเลือกประเภทบิล (ค่าส่ง/VAT)"); setSaving(false); return; }
        if (num(amount) <= 0) { toast.error("กรอกยอดรวม (¥)"); setSaving(false); return; }
        payload = {
          supplier_id: supplierId, amount_rmb: num(amount), fee_rmb: num(fee),
          is_shipping: false, vat_type: null, amount_thb: 0,
          transfer_date: transferDate || null, bill_date: billDate || null, note: note || null,
          attachments: files, status: "รอโอน", actor: "china-app",
        };
      }
      const res = await apiFetch("/api/master-v2/china-bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      celebrate("บันทึกบิลแล้ว 🎉", { confetti: true });
      // เก็บบิลที่เพิ่งบันทึก ไว้ทำ popup พิมพ์ (label = ร้าน หรือ ค่าส่ง/VAT)
      setSavedBill({ ...(j.data ?? {}), _sup: thbMode ? null : sup, supplier_label: thbMode ? thbLabel : (sup?.name_th ?? sup?.name_en) });
      // reset ฟอร์ม
      setSupplierId(null); setSup(null); setIsShipping(false); setVatType(""); setAmountThb("");
      setAmount(""); setFee(""); setTransferDate(today()); setBillDate(today());
      setFiles([]); setNote("");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        {/* ร้านค้า (จีน) — มีตัวเลือกพิเศษบนสุด: ค่าส่ง / VAT ISG / VAT IG */}
        <Label>ร้านค้า (จีน)</Label>
        <RelationPicker
          value={isShipping ? "__ship__" : vatType ? `__vat_${vatType}__` : supplierId}
          onChange={(id) => {
            if (id === "__ship__") { setIsShipping(true); setVatType(""); setSupplierId(null); }
            else if (id === "__vat_ISG__") { setVatType("ISG"); setIsShipping(false); setSupplierId(null); }
            else if (id === "__vat_IG__") { setVatType("IG"); setIsShipping(false); setSupplierId(null); }
            else { setSupplierId(id); setIsShipping(false); setVatType(""); }
          }}
          config={SUPPLIER_CFG}
          pinnedOptions={[
            { id: "__ship__", label: "🚚 ค่าส่ง", accentClass: "text-purple-700" },
            { id: "__vat_ISG__", label: "🧾 VAT ISG", accentClass: "text-rose-700" },
            { id: "__vat_IG__", label: "🧾 VAT IG", accentClass: "text-rose-700" },
          ]}
        />
        {/* ข้อมูลร้าน (เฉพาะเลือกร้านจริง) */}
        {supplierId && sup && (
          <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            {!!sup.name_en && <div className="text-slate-700 font-medium">{String(sup.name_en)}</div>}
            <Row label="ธนาคาร" v={sup.bank_name_brief} />
            <Row label="เลขบัญชี" v={sup.account_number} />
            <Row label="ชื่อบัญชี" v={sup.bank_account_name} />
            <Row label="โทร" v={sup.phone} />
          </div>
        )}
      </Card>

      <Card>
        {thbMode ? (
          /* โหมดบาท: ค่าส่ง/VAT — กรอกยอดบาทตรง */
          <div>
            <Label>ยอดรวม ({thbLabel}) (฿)</Label>
            <Num value={amountThb} onChange={setAmountThb} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>ยอดรวม (¥)</Label><Num value={amount} onChange={setAmount} /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-500">ค่าโอน (¥)</span>
                <button type="button" onClick={() => setFeeInfo(v => !v)} className="text-[11px] text-blue-500">ⓘ ตาราง</button>
              </div>
              <Num value={fee} onChange={setFee} />
            </div>
          </div>
        )}
        {!thbMode && feeInfo && (
          <div className="mt-2 rounded-lg bg-pink-50 border border-pink-200 p-3 text-xs">
            <div className="font-semibold text-slate-700 mb-1">ค่าธรรมเนียมการโอน</div>
            {FEE_TABLE.map(t => <div key={t.label} className="flex justify-between"><span className="text-slate-500">{t.label}</span><span className="text-slate-700">{t.fee} หยวน</span></div>)}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><Label>วันที่วางบิล</Label>
            <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
          <div><Label>วันที่ลงบิล</Label>
            <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
        </div>
        {/* สรุปยอด — บาทตรง (ค่าส่ง/VAT) หรือ ¥ (ร้านค้าจีน เรทมาตอนโอน) */}
        <div className="mt-3 rounded-lg bg-orange-50 border border-orange-100 p-3 flex justify-between items-center">
          <div className="text-sm text-slate-600">ยอดโอนรวม</div>
          {thbMode
            ? <div className="text-lg font-bold text-orange-600">฿{fmt(num(amountThb))}</div>
            : <div className="text-lg font-bold text-orange-600">¥{fmt(totalRmb)}</div>}
        </div>
        <div className="mt-1 text-[11px] text-slate-400 text-center">
          {thbMode ? "* บิลค่าส่ง/VAT เป็นยอดบาท ไม่ใช้เรท" : "* เรท/ยอดเงินบาทจะคำนวณตอน “โอนเข้าจีน”"}
        </div>
      </Card>

      <Card>
        <FileMultiInput label="📎 ไฟล์แนบ (ใบรับ/บิล, สลิป WeChat ฯลฯ)" value={files} onChange={setFiles} folder="china-bills" />
        <div className="mt-3"><Label>หมายเหตุ</Label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="เช่น รายละเอียดเพิ่มเติม / ออเดอร์"
            className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg resize-none" /></div>
      </Card>

      <button onClick={save} disabled={saving}
        className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold text-base disabled:opacity-50 active:scale-[0.99] transition-transform">
        {saving ? "กำลังบันทึก…" : "บันทึกบิล"}
      </button>

      {/* popup หลังบันทึก: พิมพ์ / ส่งไลน์ */}
      {savedBill && !report && (
        <Portal><div className="fixed inset-0 z-[210] bg-black/40 cpok-bg flex items-center justify-center p-4" onClick={() => setSavedBill(null)}>
          <div className="relative bg-white rounded-2xl w-full max-w-xs p-5 pt-7 text-center cpok-card" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSavedBill(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mb-2">
              <svg viewBox="0 0 52 52" className="w-9 h-9"><path className="cpok-check" d="M14 27l8 8 16-18" /></svg>
            </div>
            <div className="text-lg font-semibold text-slate-800">บันทึกบิลแล้ว</div>
            <div className="mt-1 text-sm text-slate-500">{String(savedBill.supplier_label ?? "")} · {isThbBill(savedBill) ? `฿${fmt(num(savedBill.amount_thb))}` : `¥${fmt(num(savedBill.amount_rmb) + num(savedBill.fee_rmb))}`}</div>
            <div className="mt-4 space-y-2">
              <button onClick={() => setReport(savedBill)} className="w-full h-11 bg-slate-700 text-white rounded-lg font-medium">🖨️ พิมพ์ / ใบสรุป</button>
              <button onClick={() => setSavedBill(null)} className="w-full h-10 text-slate-500 text-sm">ปิด</button>
            </div>
          </div>
        </div></Portal>
      )}
      {report && <ReportPopup bill={report} onClose={() => setReport(null)} onPrinted={() => {}} />}
    </div>
  );
}

// ---------------- บิลจีนทั้งหมด (รวมหน้ารอโอนเดิม) ----------------
const ALL_FILTERS = ["ค้างโอน", "ทั้งหมด", "รอโอน", "โอนแล้วบางส่วน", "โอนครบแล้ว", "ยกเลิก"] as const;
function AllList({ canDelete }: { canDelete: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ค้างโอน");   // default = ค้างโอน (รอโอน + บางส่วน)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());          // เลือกหลายบิล
  const [attachOpen, setAttachOpen] = useState(false);             // popup เลือกบิลเพื่อแนบสลิป (แมนนวล)
  const [wizardOpen, setWizardOpen] = useState(false);             // wizard AI จับคู่สลิป
  const [sendingCombined, setSendingCombined] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch("/api/master-v2/china-bills?limit=300&sort_by=bill_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (filter === "ทั้งหมด") return rows;
    if (filter === "ค้างโอน") return rows.filter(r => { const s = billStatus3(r); return s === "รอโอน" || s === "โอนแล้วบางส่วน"; });
    return rows.filter(r => billStatus3(r) === filter);
  }, [rows, filter]);
  const total = useMemo(() => shown.reduce((a, r) => a + billTotalRmb(r), 0), [shown]);
  const onPrinted = (id: string, at: string) => setRows(p => p.map(r => String(r.id) === id ? { ...r, printed_at: at } : r));
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selRows = rows.filter(r => sel.has(String(r.id)));
  // แนบสลิป ¥ ใช้เฉพาะบิลร้านค้าจีน — ค่าส่ง/VAT (บาท) ไม่มีสลิป ¥
  const openBills = rows.filter(r => !isThbBill(r) && (() => { const s = billStatus3(r); return s === "รอโอน" || s === "โอนแล้วบางส่วน"; })());

  const sendCombined = async () => {
    if (!selRows.length) return;
    setSendingCombined(true);
    try {
      let tot = 0;
      const lines = selRows.map(r => { const rem = Math.max(0, billTotalRmb(r) - slipSumRmb(r)); tot += rem; return `• ${String(r.supplier_label ?? r.supplier_id ?? "—")} · ค้าง ¥${fmt(rem)} · ${billStatus3(r)}`; });
      const text = `🧾 บิลจีน (${selRows.length} รายการ)\n` + lines.join("\n") + `\n\nรวมค้าง ¥${fmt(tot)}`;
      const res = await apiFetch("/api/china-pay/line-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("ส่งเข้า LINE กลุ่มแล้ว"); setSel(new Set()); }
      else if (j.needConfig) toast.error("ยังไม่ได้ตั้งค่า LINE Bot");
      else toast.error(j.error ?? "ส่งไม่ได้");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSendingCombined(false); }
  };

  return (
    <div className="space-y-3">
      {/* ปุ่มแนบสลิป: AI จับคู่ (หลัก) + เลือกบิลเอง */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setWizardOpen(true)}
          className="h-11 bg-emerald-600 text-white rounded-xl font-semibold shadow-sm active:scale-[0.99] transition text-sm">🤖 แนบสลิป (AI จับคู่)</button>
        <button onClick={() => setAttachOpen(true)}
          className="h-11 border border-emerald-600 text-emerald-700 rounded-xl font-semibold active:scale-[0.99] transition text-sm">📎 เลือกบิลเอง</button>
      </div>

      {/* ตัวกรองสถานะ */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {ALL_FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 h-8 px-3 rounded-full text-sm border ${filter === f ? "bg-orange-600 text-white border-orange-600 font-medium" : "bg-white text-slate-500 border-slate-200"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* สรุปยอด */}
      {!loading && shown.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-3 flex justify-between items-center">
          <span className="text-sm text-slate-500">{filter} {shown.length} บิล</span>
          <span className="font-bold text-orange-600">¥{fmt(total)}</span>
        </div>
      )}

      {/* แถบเลือกหลายบิล → ส่งไลน์รวม */}
      {sel.size > 0 && (
        <div className="sticky top-0 z-10 rounded-xl bg-emerald-600 text-white p-2.5 flex items-center justify-between gap-2 shadow">
          <span className="text-sm font-medium pl-1">เลือก {sel.size} บิล</span>
          <div className="flex gap-2">
            <button onClick={sendCombined} disabled={sendingCombined} className="h-9 px-3 bg-white text-emerald-700 rounded-lg text-sm font-medium disabled:opacity-50">{sendingCombined ? "กำลังส่ง…" : "📩 ส่งไลน์รวม"}</button>
            <button onClick={() => setSel(new Set())} className="h-9 px-3 bg-emerald-700/40 rounded-lg text-sm">ล้าง</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>
      ) : shown.length === 0 ? (
        <div className="text-center text-slate-300 py-10">— ไม่มีรายการ —</div>
      ) : (
        shown.map((r) => {
          const id = String(r.id), rate = num(r.rate);
          const s3 = billStatus3(r);
          const fullRmb = billTotalRmb(r);
          const remainRmb = Math.max(0, fullRmb - slipSumRmb(r));
          const on = sel.has(id);
          return (
            <Card key={id}>
              <div className="flex items-start gap-2">
                <button onClick={() => toggle(id)}
                  className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${on ? "bg-emerald-600 text-white" : "border border-slate-300"}`}>{on ? "✓" : ""}</button>
                <button onClick={() => setDetail(r)} className="flex-1 min-w-0 text-left flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate flex items-center gap-1.5">
                      {isThbBill(r) && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.is_shipping ? "bg-purple-100 text-purple-700" : "bg-rose-100 text-rose-700"}`}>{billTypeLabel(r)}</span>}
                      <span className="truncate">{billDisplayName(r)}</span>
                    </div>
                    <div className="text-xs text-slate-400">{String(r.transfer_date ?? r.bill_date ?? "—")}</div>
                    {r.printed_at ? <PrintedBadge /> : null}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {isThbBill(r) ? (
                      <div className="text-lg font-bold text-orange-600">฿{fmt(num(r.amount_thb))}</div>
                    ) : (
                      <>
                        <div className="text-lg font-bold text-orange-600">¥{fmt(remainRmb)}</div>
                        <div className="text-[11px] text-slate-400">เต็ม ¥{fmt(fullRmb)}{rate > 0 ? ` · ฿${fmt(remainRmb * rate)}` : ""}</div>
                      </>
                    )}
                    <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[s3] ?? "bg-slate-100 text-slate-500"}`}>{s3}</span>
                  </div>
                </button>
              </div>
            </Card>
          );
        })
      )}
      {detail && <BillDetail bill={detail} onClose={() => setDetail(null)} onPrinted={onPrinted} onChanged={load} canDelete={canDelete} />}
      {report && <ReportPopup bill={report} onClose={() => setReport(null)} onPrinted={onPrinted} />}
      {wizardOpen && <SlipWizard openBills={openBills} onClose={() => setWizardOpen(false)} onDone={() => { setWizardOpen(false); load(); }} />}

      {/* popup เลือกบิลเพื่อแนบสลิป (แมนนวล) */}
      {attachOpen && (
        <Portal><div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setAttachOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <div className="font-semibold text-slate-800">เลือกบิลที่จะแนบสลิป</div>
              <button onClick={() => setAttachOpen(false)} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
            </div>
            <div className="p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2">
              <div className="text-xs text-slate-400 px-1">แสดงเฉพาะบิลที่ยังไม่ครบ (รอโอน / บางส่วน)</div>
              {openBills.length === 0 ? <div className="text-center text-slate-300 py-8">— ไม่มีบิลค้าง —</div>
                : openBills.map((r) => {
                  const rem = Math.max(0, billTotalRmb(r) - slipSumRmb(r));
                  return (
                    <button key={String(r.id)} onClick={() => { setAttachOpen(false); setDetail(r); }}
                      className="w-full flex justify-between items-center gap-2 text-left rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{String(r.supplier_label ?? r.supplier_id ?? "—")}</div>
                        <div className="text-xs text-slate-400">{String(r.transfer_date ?? r.bill_date ?? "—")} · {billStatus3(r)}</div>
                      </div>
                      <div className="text-right flex-shrink-0"><div className="font-bold text-orange-600">¥{fmt(rem)}</div><div className="text-[10px] text-slate-400">ยังขาด</div></div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}

// ---------------- เฟส C: Wizard อัปโหลดสลิปหลายใบ → AI จับคู่บิล → ตรวจ/แก้ → ยืนยัน ----------------
type WizRow = { key: string; ex: { amount: number | null; account: string; name: string }; billId: string; amount: number; conf: "high" | "low" | "none" };
function SlipWizard({ openBills, onClose, onDone }: { openBills: Record<string, unknown>[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [pmap, setPmap] = useState<Record<string, Record<string, unknown>>>({});
  const [stage, setStage] = useState<"upload" | "review">("upload");
  const [working, setWorking] = useState(false);
  const [rows, setRows] = useState<WizRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const r2Url = (k: string) => `/api/r2-image?key=${encodeURIComponent(k)}`;

  useEffect(() => {
    apiFetch("/api/master-v2/partners?limit=500").then(r => r.json())
      .then(j => { const m: Record<string, Record<string, unknown>> = {}; (j.data ?? []).forEach((p: Record<string, unknown>) => { m[String(p.id)] = p; }); setPmap(m); })
      .catch(() => {});
  }, []);

  const billLabel = (b: Record<string, unknown>) => String(b.supplier_label ?? (pmap[String(b.supplier_id)]?.name_th) ?? b.supplier_id ?? "—");
  const remainOf = (b: Record<string, unknown>) => Math.max(0, billTotalRmb(b) - slipSumRmb(b));

  // จับคู่สลิป → บิล โดยให้คะแนน (เลขบัญชี > ชื่อ > ยอด)
  const matchBill = (ex: { amount: number | null; account: string; name: string }): { billId: string; conf: "high" | "low" | "none" } => {
    let best = ""; let bestScore = 0;
    for (const b of openBills) {
      const p = pmap[String(b.supplier_id)] ?? {};
      let score = 0;
      const acc = String(p.account_number ?? "").replace(/[^0-9]/g, "");
      if (ex.account && acc && ex.account.length >= 4) { const a = ex.account.slice(-6), c = acc.slice(-6); if (acc.includes(ex.account) || ex.account.includes(acc) || a === c) score += 3; }
      const nm = `${String(p.bank_account_name ?? "")} ${String(p.name_th ?? "")} ${String(p.name_en ?? "")}`.toLowerCase();
      if (ex.name && nm && nm.includes(ex.name.toLowerCase())) score += 2;
      const rem = remainOf(b);
      if (ex.amount != null && rem > 0) { if (Math.abs(ex.amount - rem) <= 1) score += 2; else if (ex.amount <= rem + 1) score += 1; }
      if (score > bestScore) { bestScore = score; best = String(b.id); }
    }
    return { billId: best, conf: bestScore >= 3 ? "high" : bestScore > 0 ? "low" : "none" };
  };

  const onPick = async (files: FileList) => {
    setWorking(true);
    try {
      const next: WizRow[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append("file", f); fd.append("folder", "china-slips");
        const up = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then(r => r.json()).catch(() => ({}));
        if (!up.r2_key) { if (up.error) toast.error(up.error); continue; }
        const ex = await apiFetch("/api/china-pay/ocr-slip-extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: up.r2_key }) }).then(r => r.json()).catch(() => ({ amount: null, account: "", name: "" }));
        const exObj = { amount: ex.amount ?? null, account: String(ex.account ?? ""), name: String(ex.name ?? "") };
        const m = matchBill(exObj);
        const matched = openBills.find(b => String(b.id) === m.billId);
        const amount = exObj.amount != null ? exObj.amount : (matched ? remainOf(matched) : 0);
        next.push({ key: up.r2_key, ex: exObj, billId: m.billId, amount, conf: m.conf });
      }
      if (next.length === 0) { toast.error("อ่านสลิปไม่ได้ ลองใหม่หรือเลือกบิลเอง"); return; }
      setRows(next); setStage("review");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setWorking(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const setRow = (i: number, patch: Partial<WizRow>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const confirmAll = async () => {
    const valid = rows.filter(r => r.billId && r.amount > 0);
    if (!valid.length) { toast.error("ยังไม่มีรายการที่จับคู่บิล"); return; }
    setWorking(true);
    try {
      // รวมสลิปตามบิล แล้ว PATCH ทีละบิล (ต่อท้ายสลิปเดิม)
      const byBill: Record<string, { key: string; amount_rmb: number; at: string }[]> = {};
      const now = new Date().toISOString();
      for (const r of valid) { (byBill[r.billId] = byBill[r.billId] || []).push({ key: r.key, amount_rmb: +r.amount.toFixed(2), at: now }); }
      let okCount = 0;
      for (const [billId, newSlips] of Object.entries(byBill)) {
        const b = openBills.find(x => String(x.id) === billId);
        const existing = b ? billSlips(b) : [];
        const res = await apiFetch(`/api/master-v2/china-bills/${billId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slips: [...existing, ...newSlips], actor: "china-app" }),
        });
        const j = await res.json().catch(() => ({}));
        if (!j.error) okCount += newSlips.length;
      }
      toast.success(`บันทึกสลิป ${okCount} ใบเข้าบิลแล้ว`);
      onDone();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setWorking(false); }
  };

  return (
    <Portal><div className="fixed inset-0 z-[210] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => !working && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">🤖 แนบสลิป + AI จับคู่บิล</div>
          <button onClick={() => !working && onClose()} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
          {stage === "upload" ? (
            <>
              <div className="text-sm text-slate-500">อัปโหลดสลิปได้หลายใบพร้อมกัน ระบบจะอ่านยอด/เลขบัญชี/ชื่อผู้รับ แล้วเดาว่าเป็นของบิลไหน — ตรวจ/แก้ก่อนยืนยันได้</div>
              <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                onChange={(e) => { const fs = e.target.files; if (fs && fs.length) onPick(fs); }} />
              <button onClick={() => fileRef.current?.click()} disabled={working}
                className="w-full h-24 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-700 disabled:opacity-50">
                <span className="text-3xl">{working ? "⏳" : "📎"}</span>
                <span className="text-sm font-medium">{working ? "กำลังอ่านสลิปด้วย AI…" : "เลือกสลิป (หลายใบได้)"}</span>
              </button>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-500">ตรวจการจับคู่ — แตะเปลี่ยนบิล/แก้ยอดได้ แล้วกดยืนยัน</div>
              {rows.map((r, i) => (
                <div key={r.key} className="rounded-lg border border-slate-200 p-2.5 flex gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r2Url(r.key)} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0 border border-slate-200" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="text-[11px] text-slate-400">
                      AI อ่าน: ยอด {r.ex.amount != null ? `¥${fmt(r.ex.amount)}` : "—"} · บัญชี {r.ex.account || "—"} · {r.ex.name || "—"}
                      <span className={`ml-1 px-1.5 rounded ${r.conf === "high" ? "bg-emerald-100 text-emerald-700" : r.conf === "low" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"}`}>{r.conf === "high" ? "มั่นใจ" : r.conf === "low" ? "ไม่แน่ใจ" : "ไม่เจอ"}</span>
                    </div>
                    <select value={r.billId} onChange={(e) => setRow(i, { billId: e.target.value })}
                      className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                      <option value="">— เลือกบิล —</option>
                      {openBills.map(b => <option key={String(b.id)} value={String(b.id)}>{billLabel(b)} · ค้าง ¥{fmt(remainOf(b))}</option>)}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 flex-shrink-0">ยอดสลิป (¥)</span>
                      <div className="flex-1"><Num value={r.amount ? String(r.amount) : ""} onChange={(v) => setRow(i, { amount: num(v) })} /></div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => { setStage("upload"); setRows([]); }} disabled={working} className="h-11 border border-slate-200 text-slate-600 rounded-lg text-sm disabled:opacity-50">+ เพิ่มสลิปอีก</button>
                <button onClick={confirmAll} disabled={working} className="h-11 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{working ? "กำลังบันทึก…" : "✓ ยืนยันทั้งหมด"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div></Portal>
  );
}

// ---------------- ประวัติการตัด/โอน (ดึงจาก china_transfers.lines) — แก้ไข/ลบได้ (คืนยอด) ----------------
function TransferHistory({ bill, kind, onChanged }: { bill: Record<string, unknown>; kind: "china" | "ctw"; onChanged?: () => void }) {
  const toast = useToast();
  const billId = String(bill.id);
  const billTotal = kind === "china" ? num(bill.amount_rmb) + num(bill.fee_rmb) : num(bill.net_amount);
  const curStatus = String(bill.status ?? "");
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);   // tid ที่กำลังแก้จำนวน
  const [editVal, setEditVal] = useState("");
  const [delId, setDelId] = useState<string | null>(null);     // tid ที่กำลังยืนยันลบ
  const [viewId, setViewId] = useState<string | null>(null);   // tid ที่กำลังกางดู (สลิป)
  const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");

  const load = useCallback(() => {
    apiFetch("/api/master-v2/china-transfers?limit=500&sort_by=transfer_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRaw(j.data ?? [])).catch(() => setRaw([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const linesOf = (t: Record<string, unknown>) => Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : [];

  // รายการประวัติของบิลนี้
  const items = raw.flatMap((t) => {
    const lines = linesOf(t);
    const idx = lines.findIndex(l => String(l.bill_id) === billId && l.kind === kind);
    const no = t.transfer_no ? String(t.transfer_no) : (t.ref_no ? String(t.ref_no) : "—");
    const date = String(t.transfer_date ?? "");
    const atts = Array.isArray(t.attachments) ? (t.attachments as unknown[]).map(String) : [];
    const refNo = t.ref_no ? String(t.ref_no) : "";
    if (idx >= 0) {
      const mine = lines[idx];
      // ดูบิลจีน → โชว์เลขบิล CTW ที่ตัดพร้อมกันในการโอนนั้น
      const ctwDocs = kind === "china" ? lines.filter(l => l.kind === "ctw").map(l => String(l.doc_number ?? "")).filter(Boolean) : [];
      return [{
        tid: String(t.id), no, date, editable: true, atts, refNo,
        amt: kind === "china" ? num(mine.paid_rmb) : num(mine.paid_thb),
        cur: kind === "china" ? "¥" : "฿",
        note: ctwDocs.length ? `ตัดพร้อม CTW: ${ctwDocs.join(", ")}` : "",
      }];
    }
    if (kind === "china" && Array.isArray(t.bill_ids) && (t.bill_ids as unknown[]).map(String).includes(billId)) {
      return [{ tid: String(t.id), no, date, editable: false, atts, refNo, amt: 0, cur: "¥", note: "(รายการเก่า)" }];
    }
    return [];
  });

  // คำนวณยอดจ่ายรวมของบิลนี้ใหม่จากทุกการโอน (= source of truth)
  const recomputeBillPaid = (transfers: Record<string, unknown>[]) =>
    transfers.reduce((sum, t) => {
      const mine = linesOf(t).find(l => String(l.bill_id) === billId && l.kind === kind);
      return mine ? sum + (kind === "china" ? num(mine.paid_rmb) : num(mine.paid_thb)) : sum;
    }, 0);

  // แก้ไข (newVal != null) หรือ ลบ (newVal == null) รายการในการโอน tid
  const apply = async (tid: string, newVal: number | null) => {
    const t = raw.find(x => String(x.id) === tid);
    if (!t) return;
    setBusy(true);
    try {
      const rate = num(t.rate);
      const lines = linesOf(t).map(l => ({ ...l }));
      const idx = lines.findIndex(l => String(l.bill_id) === billId && l.kind === kind);
      if (idx < 0) throw new Error("ไม่พบรายการ");

      if (newVal == null) lines.splice(idx, 1);                       // ลบรายการ
      else if (kind === "china") { lines[idx].paid_rmb = +newVal.toFixed(2); lines[idx].paid_thb = +(newVal * rate).toFixed(2); }
      else lines[idx].paid_thb = +newVal.toFixed(2);

      // ---- จัดการ record การโอน (คง leftover เดิม → ยอดคงเหลือบัญชีจีนไม่เพี้ยน) ----
      const chinaThb = lines.filter(l => l.kind === "china").reduce((a, l) => a + num(l.paid_thb), 0);
      const leftoverThb = num(t.leftover_thb);
      if (lines.length === 0) {
        await apiFetch(`/api/master-v2/china-transfers/${tid}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false, actor: "china-app" }),     // ไม่เหลือรายการ → ปิดการโอนนี้
        });
      } else {
        await apiFetch(`/api/master-v2/china-transfers/${tid}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, bills_total_thb: +chinaThb.toFixed(2), amount_transferred_thb: +(chinaThb + leftoverThb).toFixed(2), actor: "china-app" }),
        });
      }

      // ---- คืนยอดบิล: คำนวณ paid รวมใหม่จากสถานะหลังแก้ ----
      const after = raw
        .map(x => String(x.id) === tid ? { ...x, lines, is_active: lines.length === 0 ? false : x.is_active } : x)
        .filter(x => x.is_active !== false);
      const paidSum = recomputeBillPaid(after);

      if (kind === "china") {
        const body: Record<string, unknown> = { paid_rmb: +paidSum.toFixed(2), actor: "china-app" };
        if (curStatus !== "ยกเลิก") body.status = paidSum >= billTotal - 0.001 ? "โอนแล้ว" : "รอโอน";
        await apiFetch(`/api/master-v2/china-bills/${billId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        const cleared = Math.min(billTotal, paidSum);
        await apiFetch(`/api/master-v2/ctw-bills/${billId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleared_amount: +cleared.toFixed(2), cleared_at: cleared >= billTotal - 0.001 ? new Date().toISOString() : null, actor: "china-app" }),
        });
      }

      toast.success(newVal == null ? "ลบรายการ + คืนยอดแล้ว" : "แก้ไขรายการแล้ว");
      setEditId(null); setDelId(null);
      load(); onChanged?.();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  if (items.length === 0) return null;
  return (
    <div>
      <Label>ประวัติการตัด/โอน ({items.length})</Label>
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-2">
        {items.map((it) => (
          <div key={it.tid} className="border-b border-slate-100 last:border-0 pb-2 last:pb-0">
            <div className="flex justify-between gap-2 items-start">
              <button onClick={() => setViewId(v => v === it.tid ? null : it.tid)} className="text-left text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <span className={`text-[10px] transition-transform ${viewId === it.tid ? "rotate-90" : ""}`}>▶</span>
                {it.date} · เลขโอน {it.no}
              </button>
              <div className="flex items-center gap-2 flex-shrink-0">
                {it.amt > 0 && <span className="font-medium text-slate-700">{it.cur}{fmt(it.amt)}</span>}
                {it.editable && (
                  <>
                    <button onClick={() => { setEditId(it.tid); setEditVal(String(it.amt)); setDelId(null); }} className="text-slate-400 hover:text-blue-500" title="แก้ไขจำนวน">✎</button>
                    <button onClick={() => { setDelId(it.tid); setEditId(null); }} className="text-slate-400 hover:text-red-500" title="ลบ (คืนยอด)">🗑</button>
                  </>
                )}
              </div>
            </div>
            {it.note && <div className="text-[11px] text-slate-400 mt-0.5">{it.note}</div>}
            {viewId === it.tid && (
              <div className="mt-2 rounded-lg bg-white border border-slate-200 p-2.5 text-xs space-y-2">
                {it.refNo && <div className="text-slate-500">เลขอ้างอิงสลิป: <span className="text-slate-700 font-medium">{it.refNo}</span></div>}
                {it.atts.length > 0 ? (
                  <div>
                    <div className="text-slate-500 mb-1">สลิปที่แนบ ({it.atts.length})</div>
                    <div className="grid grid-cols-3 gap-2">
                      {it.atts.map((k) => (
                        <a key={k} href={r2Url(k)} target="_blank" rel="noreferrer" className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                          {isPdf(k)
                            ? <div className="flex flex-col items-center justify-center h-20 text-slate-600"><span className="text-2xl">📄</span><span className="text-[9px] truncate w-full px-1 text-center">{k.split("/").pop()}</span></div>
                            /* eslint-disable-next-line @next/next/no-img-element */
                            : <img src={r2Url(k)} alt="" className="w-full h-20 object-cover" />}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : <div className="text-slate-400">— ไม่มีสลิปแนบ —</div>}
              </div>
            )}
            {editId === it.tid && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">{it.cur}</span>
                <div className="flex-1"><Money value={editVal} onChange={setEditVal} /></div>
                <button disabled={busy} onClick={() => apply(it.tid, num(editVal))} className="h-9 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">บันทึก</button>
                <button disabled={busy} onClick={() => setEditId(null)} className="h-9 px-3 border border-slate-200 rounded-lg text-xs">ยกเลิก</button>
              </div>
            )}
            {delId === it.tid && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-100 p-2 text-xs">
                <div className="text-red-600 mb-2">ลบรายการนี้? ระบบจะคืนยอดบิลกลับ (ยอดคงเหลือบัญชีจีนไม่เปลี่ยน)</div>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => apply(it.tid, null)} className="h-9 px-3 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50">ลบ + คืนยอด</button>
                  <button disabled={busy} onClick={() => setDelId(null)} className="h-9 px-3 border border-slate-200 rounded-lg">ยกเลิก</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- สลิปจ่ายร้าน (หลายรอบ + ยอดต่อสลิป) → สถานะ 3 ระดับ ----------------
function SlipSection({ bill, onChanged }: { bill: Record<string, unknown>; onChanged?: () => void }) {
  const toast = useToast();
  const totalRmb = billTotalRmb(bill);
  const [slips, setSlips] = useState<Slip[]>(() => billSlips(bill));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);   // สลิปที่กำลังแก้ยอด
  const fileRef = useRef<HTMLInputElement>(null);
  const r2Url = (k: string) => `/api/r2-image?key=${encodeURIComponent(k)}`;
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");

  const sum = slips.reduce((a, s) => a + num(s.amount_rmb), 0);
  const remain = Math.max(0, totalRmb - sum);
  const status = String(bill.status ?? "") === "ยกเลิก" ? "ยกเลิก"
    : (totalRmb > 0 && sum >= totalRmb - 0.001) ? "โอนครบแล้ว" : sum > 0 ? "โอนแล้วบางส่วน" : "รอโอน";

  const onPick = async (files: FileList) => {
    setBusy(true);
    try {
      const added: Slip[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append("file", f); fd.append("folder", "china-slips");
        const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (j.r2_key) added.push({ key: j.r2_key, amount_rmb: 0, at: new Date().toISOString() });
        else if (j.error) toast.error(j.error);
      }
      if (added.length) {
        if (added[0] && remain > 0) added[0].amount_rmb = +remain.toFixed(2);   // ใบแรกเดายอด = ยอดคงเหลือ
        setSlips(s => [...s, ...added]); setDirty(true);
      }
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const setAmt = (i: number, v: string) => { setSlips(s => s.map((x, idx) => idx === i ? { ...x, amount_rmb: num(v) } : x)); setDirty(true); };
  const removeAt = (i: number) => { setSlips(s => s.filter((_, idx) => idx !== i)); setDirty(true); };
  const save = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slips, actor: "china-app" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }
      setDirty(false); toast.success("บันทึกสลิปแล้ว"); onChanged?.();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>สลิปจ่ายร้าน (แนบเป็นรอบได้)</Label>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-500"}`}>{status}</span>
      </div>
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-2">
        <div className="flex justify-between text-xs"><span className="text-slate-500">ยอดบิล</span><span className="text-slate-700">¥{fmt(totalRmb)}</span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-500">รวมสลิปแล้ว</span><span className="font-medium text-emerald-700">¥{fmt(sum)}</span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-500">ยังขาด</span><span className={`font-medium ${remain > 0.001 ? "text-amber-600" : "text-emerald-700"}`}>¥{fmt(remain)}</span></div>

        {slips.length > 0 && (
          <div className="space-y-2 pt-1">
            {slips.map((s, i) => (
              <div key={s.key + i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                {isPdf(s.key)
                  ? <a href={r2Url(s.key)} target="_blank" rel="noreferrer" className="w-12 h-12 flex-shrink-0 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-xl">📄</a>
                  : <button type="button" onClick={() => setLightbox(r2Url(s.key))} className="w-12 h-12 flex-shrink-0 rounded overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2Url(s.key)} alt="" className="w-full h-full object-cover" /></button>}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-400 mb-0.5">ยอดสลิป (¥)</div>
                  {editIdx === i
                    ? <Num value={s.amount_rmb ? String(s.amount_rmb) : ""} onChange={(v) => setAmt(i, v)} />
                    : <div className="h-11 flex items-center font-semibold text-slate-800">¥{fmt(num(s.amount_rmb))}</div>}
                </div>
                {editIdx === i
                  ? <button type="button" onClick={() => setEditIdx(null)} className="h-9 px-3 flex-shrink-0 bg-emerald-600 text-white rounded-lg text-xs font-medium">เสร็จ</button>
                  : <button type="button" onClick={() => setEditIdx(i)} className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-blue-500 hover:bg-blue-50 rounded-full" title="แก้ยอด">✎</button>}
                <button type="button" onClick={() => { removeAt(i); setEditIdx(null); }} className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full" title="ลบสลิป">🗑</button>
              </div>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="hidden"
          onChange={(e) => { const fs = e.target.files; if (fs && fs.length) onPick(fs); }} />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="h-10 border-2 border-dashed border-slate-300 text-slate-600 rounded-lg text-sm hover:border-orange-300 hover:text-orange-600 disabled:opacity-50">📎 เพิ่มสลิป</button>
          <button type="button" onClick={save} disabled={busy || !dirty}
            className="h-10 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{busy ? "กำลังบันทึก…" : dirty ? "💾 บันทึกสลิป" : "บันทึกแล้ว"}</button>
        </div>
        {dirty && <div className="text-[11px] text-amber-600 text-center">* มีการเปลี่ยนแปลง ยังไม่บันทึก</div>}
      </div>
      {lightbox && (
        <Portal><div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white text-2xl leading-none">×</button>
        </div></Portal>
      )}
    </div>
  );
}

// ---------------- แก้ไขบิล (ร้าน/ยอด/ค่าโอน/วันที่/หมายเหตุ) ----------------
function EditBillPopup({ bill, sup, onClose, onSaved }: { bill: Record<string, unknown>; sup: Record<string, unknown> | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState<string | null>(bill.supplier_id ? String(bill.supplier_id) : null);
  const [amount, setAmount] = useState(String(num(bill.amount_rmb) || ""));
  const [fee, setFee] = useState(String(num(bill.fee_rmb) || ""));
  const [transferDate, setTransferDate] = useState(bill.transfer_date ? String(bill.transfer_date) : "");
  const [billDate, setBillDate] = useState(bill.bill_date ? String(bill.bill_date) : "");
  const [note, setNote] = useState(bill.note ? String(bill.note) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!supplierId) { toast.error("เลือกร้านค้าก่อน"); return; }
    if (num(amount) <= 0) { toast.error("กรอกยอดรวม (¥)"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, amount_rmb: num(amount), fee_rmb: num(fee), transfer_date: transferDate || null, bill_date: billDate || null, note: note || null, actor: "china-app" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }
      toast.success("แก้ไขบิลแล้ว"); onSaved();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <Portal><div className="fixed inset-0 z-[210] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">✎ แก้ไขบิล</div>
          <button onClick={() => !saving && onClose()} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
          <div><Label>ร้านค้า (จีน)</Label>
            <RelationPicker value={supplierId} onChange={(id) => setSupplierId(id)} config={SUPPLIER_CFG} />
            {!!sup?.name_en && <div className="mt-1 text-xs text-slate-400">{String(sup.name_en)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>ยอดรวม (¥)</Label><Num value={amount} onChange={setAmount} /></div>
            <div><Label>ค่าโอน (¥)</Label><Num value={fee} onChange={setFee} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>วันที่วางบิล</Label>
              <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
            <div><Label>วันที่ลงบิล</Label>
              <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
          </div>
          <div><Label>หมายเหตุ</Label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg resize-none" /></div>
          <button onClick={save} disabled={saving} className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
        </div>
      </div>
    </div></Portal>
  );
}

// ---------------- รายละเอียดบิล ----------------
function BillDetail({ bill, onClose, onPrinted, onChanged, canDelete }: { bill: Record<string, unknown>; onClose: () => void; onPrinted?: (id: string, at: string) => void; onChanged?: () => void; canDelete?: boolean }) {
  const toast = useToast();
  const [sup, setSup] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingLine, setSendingLine] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);   // รูปที่กดดูเต็มจอ
  const supplierId = bill.supplier_id ? String(bill.supplier_id) : null;
  useEffect(() => {
    if (!supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => setSup(null));
  }, [supplierId]);

  const amount = num(bill.amount_rmb), fee = num(bill.fee_rmb), totalRmb = amount + fee, rate = num(bill.rate);
  const thb = totalRmb * rate;
  const st = String(bill.status ?? "—");
  const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
  // ไฟล์แนบใหม่ (array) + รวมไฟล์เก่า bill_image/wechat_image ของบิลเดิม
  const atts = Array.isArray(bill.attachments) ? (bill.attachments as unknown[]).map(String) : [];
  const legacy = [bill.bill_image, bill.wechat_image].filter(Boolean).map(String);
  const allFiles = [...atts, ...legacy.filter((k) => !atts.includes(k))];
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");
  const canPrint = rate > 0;                       // พิมพ์ได้เมื่อมีเรทแล้ว
  const canCancel = st !== "ยกเลิก" && st !== "โอนแล้ว";

  // ส่งบิลเข้า LINE (ข้อความ Flex + ปุ่มเปิดบิล)
  const sendLine = async () => {
    const total = num(bill.amount_rmb) + num(bill.fee_rmb);
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/app/china-pay?bill=${String(bill.id)}`;
    let text: string;
    if (isThbBill(bill)) {
      text = `🧾 บิล${billTypeLabel(bill)}\nยอดโอนรวม: ฿${fmt(num(bill.amount_thb))}\nวันที่วางบิล: ${String(bill.transfer_date ?? bill.bill_date ?? "—")}`;
    } else {
      text = `🧾 บิลจีน\nร้าน: ${String(bill.supplier_label ?? sup?.name_th ?? "—")}\nยอดโอนรวม: ¥${fmt(total)}\nวันที่วางบิล: ${String(bill.transfer_date ?? "—")}\nเลขบัญชี: ${String(sup?.account_number ?? "—")}`;
    }
    if (bill.note) text += `\nหมายเหตุ: ${String(bill.note)}`;
    setSendingLine(true);
    try {
      const res = await apiFetch("/api/china-pay/line-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, button: { label: "เปิดใบสรุปบิลจีน", url: link } }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("ส่งเข้า LINE กลุ่มแล้ว"); return; }
      if (j.needConfig) toast.error("ยังไม่ได้ตั้งค่า LINE Bot — เปิดให้เลือกกลุ่มเอง");
      else toast.error(j.error ?? "ส่ง LINE ไม่ได้ — เปิดให้เลือกกลุ่มเอง");
      window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
    } catch { window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank"); }
    finally { setSendingLine(false); }
  };

  const cancelBill = async () => {
    setBusy(true); setAskCancel(false);
    try {
      const res = await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ยกเลิก", actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("ยกเลิกบิลแล้ว"); onChanged?.(); onClose();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const paidRmb = num(bill.paid_rmb);
  const deleteBill = async () => {
    setBusy(true); setAskDelete(false);
    try {
      const res = await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}?hard=1`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }
      toast.success("ลบบิลถาวรแล้ว"); onChanged?.(); onClose();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">รายละเอียดบิล</div>
          <div className="flex items-center gap-2">
            {(() => { const s3 = billStatus3(bill); return <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[s3] ?? "bg-slate-100 text-slate-500"}`}>{s3}</span>; })()}
            <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
          </div>
        </div>

        <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
          {isThbBill(bill) ? (
            /* บิลค่าส่ง / VAT — ยอดบาทตรง ไม่มีร้าน/เรท/สลิป */
            <>
              <div>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${bill.is_shipping ? "bg-purple-100 text-purple-700" : "bg-rose-100 text-rose-700"}`}>{billTypeLabel(bill)}</span>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">ยอดโอนรวม</span><span className="font-bold text-orange-600 text-base">฿{fmt(num(bill.amount_thb))}</span></div>
                <div className="text-[11px] text-slate-400 mt-1">* เป็นยอดบาท ไม่ใช้เรท</div>
              </div>
            </>
          ) : (
            <>
              {/* ร้านค้า + ธนาคาร */}
              <div>
                <div className="font-medium text-slate-800">{String(bill.supplier_label ?? sup?.name_th ?? bill.supplier_id ?? "—")}</div>
                {!!sup?.name_en && <div className="text-sm text-slate-500">{String(sup.name_en)}</div>}
                <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
                  <Row label="ธนาคาร" v={sup?.bank_name_brief} />
                  <Row label="เลขบัญชี" v={sup?.account_number} />
                  <Row label="ชื่อบัญชี" v={sup?.bank_account_name} />
                  <Row label="โทร" v={sup?.phone} />
                </div>
              </div>

              {/* ยอดเงิน */}
              <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm space-y-1">
                <Row label="ยอด (¥)" v={fmt(amount)} />
                <Row label="ค่าโอน (¥)" v={fmt(fee)} />
                <div className="flex justify-between border-t border-orange-200/60 pt-1 mt-1"><span className="text-slate-500">ยอดโอนรวม</span><span className="font-semibold text-slate-800">¥{fmt(totalRmb)}</span></div>
                <Row label="เรท" v={rate ? fmt(rate) : "—"} />
                <div className="flex justify-between"><span className="text-slate-500">เป็นเงินบาท</span>
                  {canPrint
                    ? <span className="font-bold text-orange-600">฿{fmt(thb)}</span>
                    : <span className="font-medium text-amber-600">รอเรทเงิน</span>}
                </div>
              </div>
            </>
          )}

          {/* วันที่ */}
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            <Row label="วันที่โอน" v={bill.transfer_date} />
            <Row label="วันที่ลงบิล" v={bill.bill_date} />
            {bill.printed_at ? <Row label="พิมพ์เมื่อ" v={String(bill.printed_at).slice(0, 16).replace("T", " ")} /> : null}
          </div>

          {!isThbBill(bill) && <SlipSection bill={bill} onChanged={() => onChanged?.()} />}

          <TransferHistory bill={bill} kind="china" onChanged={() => onChanged?.()} />

          {/* แก้ไขบิล */}
          {canCancel && (
            <button onClick={() => setEditing(true)} disabled={busy}
              className="w-full h-11 border border-blue-300 text-blue-700 bg-blue-50 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-50">
              ✎ แก้ไขบิล
            </button>
          )}

          {/* ปุ่มพิมพ์/ใบสรุป + ส่งไลน์ (ส่งได้แม้ยังไม่มีเรท) */}
          <button onClick={() => setReport(true)}
            className="w-full h-11 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
            🖨️ พิมพ์ / ใบสรุป
          </button>
          {!canPrint && <div className="-mt-2 text-[11px] text-slate-400 text-center">* ยังไม่มีเรท — ใบสรุปจะแสดง “รอเรทเงิน” (เรทจะมาตอนตัดโอนเข้าจีน)</div>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setReport(true)}
              className="h-11 bg-[#06C755] text-white rounded-lg text-sm font-medium">📩 ส่งไลน์ (รูป)</button>
            <button onClick={sendLine} disabled={sendingLine}
              className="h-11 border border-[#06C755] text-[#06C755] rounded-lg text-sm font-medium disabled:opacity-50">{sendingLine ? "กำลังส่ง…" : "📩 ส่งไลน์ (ข้อความ)"}</button>
          </div>

          {/* แนบไฟล์ — กดดูเต็มจอ (กดอีกครั้งปิด) */}
          {allFiles.length > 0 && (
            <div>
              <Label>ไฟล์แนบ ({allFiles.length})</Label>
              <div className="grid grid-cols-3 gap-2">
                {allFiles.map((k) => (
                  isPdf(k) ? (
                    <a key={k} href={r2Url(k)} target="_blank" rel="noreferrer"
                      className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50 flex flex-col items-center justify-center h-24 text-slate-600">
                      <span className="text-3xl">📄</span>
                      <span className="text-[10px] truncate w-full px-1 text-center">{k.split("/").pop()}</span>
                    </a>
                  ) : (
                    <button key={k} type="button" onClick={() => setLightbox(r2Url(k))}
                      className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2Url(k)} alt="" className="w-full h-24 object-cover" />
                    </button>
                  )
                ))}
              </div>
            </div>
          )}

          {/* ยกเลิกบิล */}
          {canCancel && (
            <button onClick={() => setAskCancel(true)} disabled={busy}
              className="w-full h-11 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">
              ✕ ยกเลิกบิลนี้
            </button>
          )}

          {/* ลบบิลถาวร — เฉพาะแอดมิน (พนักงานไม่เห็น) */}
          {canDelete && (
            <button
              onClick={() => paidRmb > 0
                ? toast.error("บิลนี้มีการโอนแล้ว ลบไม่ได้ — ให้ลบรายการโอนก่อน (จะคืนยอดให้)")
                : setAskDelete(true)}
              disabled={busy}
              className="w-full h-11 border border-red-300 text-red-700 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50">
              🗑 ลบบิลถาวร
            </button>
          )}
        </div>
      </div>
      {report && <ReportPopup bill={{ ...bill, _sup: sup }} onClose={() => setReport(false)} onPrinted={onPrinted} />}
      {askCancel && (
        <ConfirmPopup title="ยกเลิกบิลนี้?" message={`${String(bill.supplier_label ?? bill.supplier_id ?? "บิลนี้")} · ¥${fmt(totalRmb)}`}
          confirmText="ยกเลิกบิล" tone="rose" onCancel={() => setAskCancel(false)} onConfirm={cancelBill} />
      )}
      {askDelete && (
        <ConfirmPopup title="ลบบิลนี้ถาวร?" message={`${String(bill.supplier_label ?? bill.supplier_id ?? "บิลนี้")} · ¥${fmt(totalRmb)} — ลบแล้วกู้คืนไม่ได้`}
          confirmText="ลบถาวร" tone="rose" onCancel={() => setAskDelete(false)} onConfirm={deleteBill} />
      )}
      {editing && <EditBillPopup bill={bill} sup={sup} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged?.(); onClose(); }} />}
      {lightbox && (
        <Portal><div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white text-2xl leading-none">×</button>
        </div></Portal>
      )}
    </div>
    </Portal>
  );
}

// ---------------- เรท ----------------
function RateTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [delRow, setDelRow] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    apiFetch("/api/master-v2/daily-rates?limit=20&sort_by=rate_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async (id: string) => {
    if (num(editVal) <= 0) { toast.error("กรอกเรท R1"); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/daily-rates/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: num(editVal), actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("แก้ไขเรทแล้ว");
      setRows(p => p.map(r => String(r.id) === id ? { ...r, rate: num(editVal) } : r));
      setEditId(null);
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const doDelete = async (id: string) => {
    setBusy(true); setDelRow(null);
    try {
      const res = await apiFetch(`/api/master-v2/daily-rates/${id}?hard=1`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }
      toast.success("ลบเรทแล้ว");
      setRows(p => p.filter(r => String(r.id) !== id));
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (num(rate) <= 0) { toast.error("กรอกเรท"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/daily-rates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_date: date, rate: num(rate), actor: "china-app" }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      toast.success("บันทึกเรทแล้ว"); setRate(""); load();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  const todayRate = rows.find(r => String(r.rate_date) === today());
  const hasToday = !!todayRate;

  return (
    <div className="space-y-4">
      {/* เรทวันนี้ + ปุ่มขอเรท (ส่ง LINE กลุ่ม) */}
      <div className="flex justify-end items-center gap-2">
        <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${hasToday ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
          {hasToday ? `เรทวันนี้ ${fmt(num(todayRate?.rate))}` : "ยังไม่มีเรทวันนี้"}
        </span>
        <button type="button" onClick={() => void requestRateViaLine()} className="text-xs font-semibold text-white bg-[#06C755] rounded-full px-2.5 py-1.5 active:scale-95 transition">📩 ขอเรท</button>
      </div>
      <Card>
        <Label>เพิ่มเรท R1 ของวัน (กรอกแค่ R1 — R2-R4 คำนวณให้)</Label>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" />
          <Num value={rate} onChange={setRate} placeholder="R1 เช่น 4.97" />
        </div>
        {num(rate) > 0 && (
          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs space-y-1">
            {RATE_TABLE.map(t => <div key={t.tier} className="flex justify-between"><span className="text-slate-500">{t.tier} · {t.label}</span><span className="font-medium text-slate-700">{fmt(+(num(rate) - t.off).toFixed(4))}</span></div>)}
          </div>
        )}
        <button onClick={save} disabled={saving} className="mt-3 w-full h-11 bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : "บันทึกเรท"}
        </button>
      </Card>
      <div className="space-y-2">
        {rows.map((r) => {
          const id = String(r.id);
          const editing = editId === id;
          return (
            <div key={id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500 flex-shrink-0">{String(r.rate_date)}</span>
              {editing ? (
                <div className="flex items-center gap-1.5 flex-1 justify-end">
                  <span className="text-slate-400 text-xs">R1</span>
                  <input type="number" inputMode="decimal" step="any" value={editVal} autoFocus
                    onChange={e => setEditVal(e.target.value)}
                    className="w-24 h-9 px-2 text-base text-right border border-orange-300 rounded-lg" />
                  <button onClick={() => saveEdit(id)} disabled={busy}
                    className="w-9 h-9 rounded-lg bg-emerald-600 text-white disabled:opacity-50">✓</button>
                  <button onClick={() => setEditId(null)} disabled={busy}
                    className="w-9 h-9 rounded-lg border border-slate-200 text-slate-500">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <span className="text-slate-700">R1 <b>{fmt(num(r.rate))}</b> <span className="text-slate-400">· R4 {fmt(+(num(r.rate) - RATE_OFFSET.r4).toFixed(4))}</span></span>
                  <button onClick={() => { setEditId(id); setEditVal(String(num(r.rate))); }}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">✎</button>
                  <button onClick={() => setDelRow(r)}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50">🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {delRow && (
        <ConfirmPopup
          title="ลบเรทนี้?"
          message={`${String(delRow.rate_date)} · R1 ${fmt(num(delRow.rate))}`}
          confirmText="ลบ" tone="rose"
          onCancel={() => setDelRow(null)} onConfirm={() => doDelete(String(delRow.id))}
        />
      )}
    </div>
  );
}

// ---------------- บิลจาก CTW ----------------
function CtwList({ canDelete }: { canDelete?: boolean }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch("/api/master-v2/ctw-bills?limit=200&sort_by=doc_date&sort_dir=desc")
      .then(r => r.json()).then(j => setRows(j.data ?? [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (mode === "form") return <CtwForm onCancel={() => setMode("list")} onSaved={() => { setMode("list"); load(); }} />;

  const ctwRemain = (r: Record<string, unknown>) => Math.max(0, num(r.net_amount) - num(r.cleared_amount));
  const unpaid = rows.filter(r => !r.cleared_at);
  const unclearedTotal = unpaid.reduce((a, r) => a + ctwRemain(r), 0);

  return (
    <div className="space-y-3">
      <button onClick={() => setMode("form")} className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold active:scale-[0.99] transition-transform">+ เพิ่มบิล CTW</button>
      {!loading && rows.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-4 shadow-sm">
          <div className="text-sm opacity-90">ยอดคงเหลือยังไม่ตัด ({unpaid.length} บิล)</div>
          <div className="text-3xl font-bold mt-1">฿{fmt(unclearedTotal)}</div>
        </div>
      )}
      {loading ? (
        <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-slate-300 py-10">— ยังไม่มีบิล CTW —</div>
      ) : (
        rows.map((r) => {
          const paid = num(r.cleared_amount), cleared = !!r.cleared_at;
          return (
          <Card key={String(r.id)}>
            <button onClick={() => setDetail(r)} className="w-full text-left flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{String(r.company_name ?? "—")}</div>
                <div className="text-xs text-slate-400">เลขที่ {String(r.doc_number ?? "—")} · {String(r.doc_date ?? "—")}{paid > 0 && !cleared ? ` · จ่ายแล้ว ฿${fmt(paid)}` : ""}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-semibold text-slate-800">฿{fmt(cleared ? num(r.net_amount) : ctwRemain(r))}</div>
                {cleared
                  ? <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ตัดแล้ว</span>
                  : <div className="text-[11px] text-slate-400">เต็ม ฿{fmt(num(r.net_amount))}</div>}
              </div>
            </button>
          </Card>
          );
        })
      )}
      {detail && <CtwDetail bill={detail} onClose={() => setDetail(null)} onChanged={load} canDelete={canDelete} onDeleted={(id) => { setRows(p => p.filter(r => String(r.id) !== id)); setDetail(null); }} />}
    </div>
  );
}

function CtwForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const toast = useToast();
  const celebrate = useCelebrate();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [docNo, setDocNo] = useState("");
  const [docDate, setDocDate] = useState(today());
  const [beforeTax, setBeforeTax] = useState("");
  const [net, setNet] = useState("");
  const [account, setAccount] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // เลือกบริษัท → ดึงชื่อ + เลขบัญชีจาก Partners
  useEffect(() => {
    if (!supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => {
      const p = j.data ?? {};
      setCompany(String(p.name_th ?? p.display_name ?? ""));
      setAccount(String(p.account_number ?? ""));
    }).catch(() => {});
  }, [supplierId]);

  // ยอดสุทธิ = ยอดก่อนภาษี + 7% (เติมอัตโนมัติ แก้ทับได้)
  useEffect(() => {
    const b = num(beforeTax);
    setNet(b > 0 ? String(+(b * (1 + VAT_RATE)).toFixed(2)) : "");
  }, [beforeTax]);

  const save = async () => {
    if (!supplierId || !company.trim()) { toast.error("เลือกบริษัทก่อน"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/ctw-bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company, doc_number: docNo || null, doc_date: docDate || null,
          amount_before_tax: num(beforeTax) || null, net_amount: num(net) || null,
          account_number: account || null, attachments: files, actor: "china-app",
        }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); return; }
      celebrate("บันทึกบิล CTW แล้ว"); onSaved();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <Label>ชื่อบริษัท (เลือกจากที่ติ๊ก “ซื้อบิล”)</Label>
        <RelationPicker value={supplierId} onChange={(id) => setSupplierId(id)} config={CTW_PARTNER_CFG} />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div><Label>เลขที่เอกสาร</Label>
            <input value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="เช่น IV260410015"
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
          <div><Label>วันที่เอกสาร</Label>
            <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)}
              className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>ยอดรวมก่อนภาษี</Label><Num value={beforeTax} onChange={setBeforeTax} /></div>
          <div><Label>ยอดเงินสุทธิ (+7%)</Label><Num value={net} onChange={setNet} /></div>
        </div>
        <div className="mt-3"><Label>เลขที่บัญชี (ดึงจาก Partners)</Label>
          <input value={account} onChange={e => setAccount(e.target.value)} placeholder="เลือกบริษัทแล้วเติมให้อัตโนมัติ"
            className="w-full h-11 px-3 text-base border border-slate-200 rounded-lg" /></div>
      </Card>

      <Card>
        <FileMultiInput label="📎 ไฟล์แนบ (PDF บิล ฯลฯ)" value={files} onChange={setFiles} folder="ctw-bills" />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onCancel} disabled={saving} className="h-12 border border-slate-200 text-slate-700 rounded-xl font-medium">ยกเลิก</button>
        <button onClick={save} disabled={saving} className="h-12 bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกบิล"}</button>
      </div>
    </div>
  );
}

function CtwDetail({ bill, onClose, onDeleted, onChanged, canDelete }: { bill: Record<string, unknown>; onClose: () => void; onDeleted: (id: string) => void; onChanged?: () => void; canDelete?: boolean }) {
  const toast = useToast();
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
  const atts = Array.isArray(bill.attachments) ? (bill.attachments as unknown[]).map(String) : [];
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");

  const doDelete = async () => {
    setBusy(true); setDel(false);
    try {
      const res = await apiFetch(`/api/master-v2/ctw-bills/${String(bill.id)}?hard=1`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }
      toast.success("ลบบิลแล้ว"); onDeleted(String(bill.id));
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-slate-800">บิลจาก CTW</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <div className="p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <div className="font-medium text-slate-800 text-lg">{String(bill.company_name ?? "—")}</div>
            <div className="text-sm text-slate-400">เลขที่เอกสาร {String(bill.doc_number ?? "—")}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            <Row label="วันที่เอกสาร" v={bill.doc_date} />
            <Row label="เลขที่บัญชี" v={bill.account_number} />
          </div>
          <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-sm space-y-1">
            <Row label="ยอดรวมก่อนภาษี" v={"฿" + fmt(num(bill.amount_before_tax))} />
            <div className="flex justify-between border-t border-orange-200/60 pt-1 mt-1"><span className="text-slate-500">ยอดเงินสุทธิ</span><span className="font-bold text-orange-600">฿{fmt(num(bill.net_amount))}</span></div>
            {num(bill.cleared_amount) > 0 && <Row label="ตัดไปแล้ว" v={"฿" + fmt(num(bill.cleared_amount))} />}
          </div>

          <TransferHistory bill={bill} kind="ctw" onChanged={() => onChanged?.()} />
          {atts.length > 0 && (
            <div>
              <Label>ไฟล์แนบ ({atts.length})</Label>
              <div className="grid grid-cols-3 gap-2">
                {atts.map((k) => (
                  <a key={k} href={r2Url(k)} target="_blank" rel="noreferrer" className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                    {isPdf(k) ? (
                      <div className="flex flex-col items-center justify-center h-24 text-slate-600"><span className="text-3xl">📄</span><span className="text-[10px] truncate w-full px-1 text-center">{k.split("/").pop()}</span></div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r2Url(k)} alt="" className="w-full h-24 object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
          {canDelete && (
            <button onClick={() => setDel(true)} disabled={busy}
              className="w-full h-11 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">🗑 ลบบิลนี้</button>
          )}
        </div>
      </div>
      {del && (
        <ConfirmPopup title="ลบบิล CTW นี้?" message={`${String(bill.company_name ?? "")} · เลขที่ ${String(bill.doc_number ?? "—")}`}
          confirmText="ลบ" tone="rose" onCancel={() => setDel(false)} onConfirm={doDelete} />
      )}
    </div>
    </Portal>
  );
}

// สร้าง object ใบสรุปจาก row china_transfers + แมพ partners (ใช้ทั้งรายการโอน + deep link)
function buildTransferReceipt(row: Record<string, unknown>, pmap: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const lines = (Array.isArray(row.lines) ? row.lines : []).map((l: Record<string, unknown>) => {
    if (l.kind !== "china") return l;
    const sp = pmap[String(l.label ?? "").trim()] ?? {};
    return { ...l, sup: { name_en: sp.name_en ?? "", phone: sp.phone ?? "", bank_account_name: sp.bank_account_name ?? "", account_number: sp.account_number ?? "", bank_name_brief: sp.bank_name_brief ?? "" } };
  });
  const attachments = Array.isArray(row.attachments) ? (row.attachments as unknown[]).map(String) : [];
  // สร้างสรุปการคำนวณ (recompute จาก lines + ฟิลด์ที่เก็บ) → โชว์ในใบสรุป
  const cnLines = lines.filter((l: Record<string, unknown>) => l.kind === "china");
  const thbLines = lines.filter((l: Record<string, unknown>) => l.kind === "thb");
  const selectedRmb = cnLines.reduce((a: number, l: Record<string, unknown>) => a + num(l.paid_rmb), 0);
  const thbSum = thbLines.reduce((a: number, l: Record<string, unknown>) => a + num(l.paid_thb), 0);
  const rate = num(row.rate);
  const transferred = num(row.amount_transferred_thb);
  const chinaRemainThb = transferred - thbSum;
  const chinaYuanBought = rate ? chinaRemainThb / rate : 0;
  const tier = chinaRemainThb <= 5000 ? "R1" : chinaRemainThb <= 99999 ? "R2" : chinaRemainThb <= 399999 ? "R3" : "R4";
  const breakdown = rate > 0 ? {
    thb: thbSum, chinaRemainThb, billsThb: selectedRmb * rate, tier, chinaYuanBought,
    shortfallRmb: Math.max(0, selectedRmb - chinaYuanBought), surplusRmb: Math.max(0, chinaYuanBought - selectedRmb),
  } : undefined;
  return { transfer_id: String(row.id ?? ""), transfer_no: row.transfer_no, date: row.transfer_date, ref_no: row.ref_no, rate: row.rate, transferred: row.amount_transferred_thb, chinaInRmb: Math.max(0, num(row.leftover_rmb)), selectedRmb, lines, attachments, breakdown };
}

// ส่งสรุปการโอนเข้า LINE (Flex + ปุ่มเปิดใบสรุป) — ใช้ร่วม TransferPage + TransferList
async function pushTransferLine(t: Record<string, unknown>, toast: { success: (m: string) => void; error: (m: string) => void }): Promise<void> {
  const ls = Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : [];
  const cn = ls.filter(l => l.kind === "china"), cw = ls.filter(l => l.kind === "ctw");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = t.transfer_id ? `${origin}/app/china-pay?transfer=${String(t.transfer_id)}` : `${origin}/app/china-pay`;
  let text = `💸 โอนเงินจีนสำเร็จ\nเลขโอน: ${String(t.transfer_no ?? "—")}\nวันที่: ${String(t.date ?? "")} ${String(t.at ?? "")}\n`;
  if (t.ref_no) text += `เลขอ้างอิง: ${String(t.ref_no)}\n`;
  text += `โอนจริง: ฿${fmt(num(t.transferred))}`;
  if (cn.length) text += `\n\nบิลจีน:\n` + cn.map(l => {
    const sp = (l.sup ?? {}) as Record<string, unknown>;
    const acc = sp.account_number ? `\n   บัญชี ${String(sp.account_number)}` : "";
    const bn = sp.bank_name_brief ? ` · ${String(sp.bank_name_brief)}` : "";
    return `• ${String(l.label)} ¥${fmt(num(l.paid_rmb))}${acc}${bn}`;
  }).join("\n");
  if (cw.length) text += `\n\nบิล CTW:\n` + cw.map(l => `• ${String(l.label)} ฿${fmt(num(l.paid_thb))}`).join("\n");
  try {
    const res = await apiFetch("/api/china-pay/line-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, button: { label: "เปิดใบสรุปการโอน", url: link } }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { toast.success("ส่งเข้า LINE กลุ่มแล้ว"); return; }
    if (j.needConfig) toast.error("ยังไม่ได้ตั้งค่า LINE Bot — เปิดให้เลือกกลุ่มเอง");
    else toast.error(j.error ?? "ส่ง LINE ไม่ได้ — เปิดให้เลือกกลุ่มเอง");
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
  } catch { window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank"); }
}

// ---------------- รายการที่โอนแล้ว (ประวัติการโอน) ----------------
function TransferList({ canDelete }: { canDelete?: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [pmap, setPmap] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [delTarget, setDelTarget] = useState<Record<string, unknown> | null>(null);   // การโอนที่กำลังยืนยันลบ
  const [busy, setBusy] = useState(false);

  // ลบรายการโอน + คืนยอดบิลที่เกี่ยวข้อง (paid_rmb / cleared_amount คำนวณใหม่จากการโอนที่เหลือ)
  const removeTransfer = async (target: Record<string, unknown>) => {
    const id = String(target.id);
    const linesOf = (t: Record<string, unknown>) => (Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : []);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/china-transfers/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) { toast.error(j.error); return; }

      const remaining = rows.filter(x => String(x.id) !== id && x.is_active !== false);
      const tl = linesOf(target);
      const chinaIds = [...new Set(tl.filter(l => l.kind === "china").map(l => String(l.bill_id)).filter(Boolean))];
      const ctwIds = [...new Set(tl.filter(l => l.kind === "ctw").map(l => String(l.bill_id)).filter(Boolean))];

      for (const bid of chinaIds) {
        const paid = remaining.reduce((s, t) => s + linesOf(t).filter(l => l.kind === "china" && String(l.bill_id) === bid).reduce((a, l) => a + num(l.paid_rmb), 0), 0);
        const b = (await apiFetch(`/api/master-v2/china-bills/${bid}`).then(r => r.json()).catch(() => ({}))).data;
        const total = b ? num(b.amount_rmb) + num(b.fee_rmb) : 0;
        const body: Record<string, unknown> = { paid_rmb: +paid.toFixed(2), actor: "china-app" };
        if (b && b.status !== "ยกเลิก") body.status = total > 0 && paid >= total - 0.001 ? "โอนแล้ว" : "รอโอน";
        await apiFetch(`/api/master-v2/china-bills/${bid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      for (const bid of ctwIds) {
        const cleared = remaining.reduce((s, t) => s + linesOf(t).filter(l => l.kind === "ctw" && String(l.bill_id) === bid).reduce((a, l) => a + num(l.paid_thb), 0), 0);
        const c = (await apiFetch(`/api/master-v2/ctw-bills/${bid}`).then(r => r.json()).catch(() => ({}))).data;
        const net = c ? num(c.net_amount) : 0;
        await apiFetch(`/api/master-v2/ctw-bills/${bid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cleared_amount: +cleared.toFixed(2), cleared_at: net > 0 && cleared >= net - 0.001 ? new Date().toISOString() : null, actor: "china-app" }) });
      }

      setRows(p => p.filter(x => String(x.id) !== id));
      toast.success("ลบรายการโอน + คืนยอดบิลแล้ว");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); setDelTarget(null); }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch("/api/master-v2/china-transfers?limit=200&sort_by=transfer_date&sort_dir=desc").then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch("/api/master-v2/partners?limit=500").then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([t, pn]) => {
      setRows(t.data ?? []);
      const m: Record<string, Record<string, unknown>> = {};
      (pn.data ?? []).forEach((p: Record<string, unknown>) => { const k = String(p.name_th ?? "").trim(); if (k) m[k] = p; });
      setPmap(m);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>;
  if (rows.length === 0) return <div className="text-center text-slate-300 py-10">— ยังไม่มีรายการโอน —</div>;
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const ls = Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]) : [];
        const cn = ls.filter(l => l.kind === "china").length, cw = ls.filter(l => l.kind === "ctw").length;
        const id = String(r.id);
        return (
          <Card key={id}>
            <button onClick={() => setReceipt(buildTransferReceipt(r, pmap))} className="w-full flex justify-between items-start gap-2 text-left">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800">{String(r.transfer_no ?? "—")}</div>
                <div className="text-xs text-slate-400">{String(r.transfer_date ?? "—")}{r.ref_no ? ` · ${String(r.ref_no)}` : ""}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">บิลจีน {cn} · CTW {cw}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-emerald-700">฿{fmt(num(r.amount_transferred_thb))}</div>
                <div className="text-[11px] text-slate-400 mt-1">แตะดูใบสรุป ›</div>
              </div>
            </button>
          </Card>
        );
      })}
      {receipt && <TransferReceiptPopup t={receipt} onClose={() => setReceipt(null)}
        onDelete={canDelete ? () => { const raw = rows.find(x => String(x.id) === String(receipt.transfer_id)); if (raw) { setDelTarget(raw); setReceipt(null); } } : undefined} />}
      {delTarget && (
        <ConfirmPopup title="ลบรายการโอนนี้?" message={`เลขโอน ${String(delTarget.transfer_no ?? "—")} · ฿${fmt(num(delTarget.amount_transferred_thb))} — ระบบจะคืนยอดบิลที่ตัดในรอบนี้กลับให้`}
          confirmText="ลบ + คืนยอด" tone="rose" onCancel={() => setDelTarget(null)} onConfirm={() => removeTransfer(delTarget)} />
      )}
    </div>
  );
}

// ---------------- โอนเข้าบัญชีจีน ----------------
function TransferPage({ preselect = [], onConsumePreselect }: { preselect?: string[]; onConsumePreselect?: () => void }) {
  const toast = useToast();
  const celebrate = useCelebrate();
  const [step, setStep] = useState(1);   // 1=เลือกบิลจีน · 2=เลือกบิล CTW · 3=กรอก+บันทึก
  const [ocrBusy, setOcrBusy] = useState(false);   // กำลังอ่านยอดจากสลิป
  const slipInputRef = useRef<HTMLInputElement>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [savedTransfer, setSavedTransfer] = useState<Record<string, unknown> | null>(null);   // หลังโอน → popup พิมพ์/ส่งไลน์
  const [sendingTxLine, setSendingTxLine] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown>[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pay, setPay] = useState<Record<string, string>>({});   // จำนวนที่โอนต่อบิล (¥) รอบนี้
  const [thbSel, setThbSel] = useState<Set<string>>(new Set());  // บิลค่าส่ง/VAT (บาท) ที่เลือกตัดรอบนี้
  const thbToggle = (id: string) => setThbSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [showBills, setShowBills] = useState(true);   // ย่อ/ขยายการ์ด "ยอดที่ต้องโอนรอบนี้" (default ขยาย)
  const [useBalance, setUseBalance] = useState(true);           // สวิตช์ใช้ยอดคงเหลือบัญชีจีน (default เปิด)
  const [amount, setAmount] = useState("");
  const [refNo, setRefNo] = useState("");                       // หมายเลข/เลขอ้างอิงการโอน
  const [rate, setRate] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [txSlips, setTxSlips] = useState<TxSlip[]>([]);
  const slipKeys = txSlips.map(s => s.key);
  const slipSum = txSlips.reduce((a, s) => a + num(s.amount), 0);
  const [lightbox, setLightbox] = useState<string | null>(null);   // รูปสลิปกดดูเต็มจอ
  const [slipProgress, setSlipProgress] = useState<{ done: number; total: number } | null>(null);   // ความคืบหน้าอ่านสลิป
  const [slipLinkOpen, setSlipLinkOpen] = useState(false);   // popup เชื่อมสลิป → บิล CTW
  const r2Url = (k: string) => `/api/r2-image?key=${encodeURIComponent(k)}`;
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<{ thb: number; rmb: number }>({ thb: 0, rmb: 0 });
  const [loading, setLoading] = useState(true);

  // CTW ที่ยังไม่ตัด (รองรับตัดบางส่วน)
  const [ctw, setCtw] = useState<Record<string, unknown>[]>([]);
  const [ctwSel, setCtwSel] = useState<Set<string>>(new Set());
  const [ctwPay, setCtwPay] = useState<Record<string, string>>({});
  const [ctwEdited, setCtwEdited] = useState<Set<string>>(new Set());   // บิล CTW ที่ผู้ใช้พิมพ์ยอดเอง
  // ข้อมูลบัญชีปลายทาง (partners) แมปด้วยชื่อ name_th → ใช้โชว์ใน step 3
  const [partnerByName, setPartnerByName] = useState<Record<string, Record<string, unknown>>>({});

  const loadAll = useCallback(() => {
    setLoading(true);
    const fPending = encodeURIComponent(JSON.stringify({ status: { type: "text", value: "รอโอน" } }));
    Promise.all([
      apiFetch(`/api/master-v2/china-bills?limit=200&filters=${fPending}&sort_by=bill_date&sort_dir=desc`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/china-pay/balance`).then(r => r.json()).catch(() => ({ rmb: 0, thb: 0 })),
      apiFetch(`/api/master-v2/ctw-bills?limit=500&sort_by=doc_date&sort_dir=desc`).then(r => r.json()).catch(() => ({ data: [] })),
      apiFetch(`/api/master-v2/partners?limit=500`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([p, bj, c, pn]) => {
      setPending(p.data ?? []);
      // ยอดคงเหลือบัญชีจีน = leftover รวมจากการโอน (auto) + ปรับมือ — มาจาก endpoint เดียวกับ Dashboard
      setBalance({ thb: num(bj.thb), rmb: num(bj.rmb) });
      setCtw((c.data ?? []).filter((r: Record<string, unknown>) => !r.cleared_at));
      const map: Record<string, Record<string, unknown>> = {};
      (pn.data ?? []).forEach((x: Record<string, unknown>) => { const k = String(x.name_th ?? "").trim(); if (k) map[k] = x; });
      setPartnerByName(map);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Auto-save draft (localStorage) — เผลอปิดแล้วเปิดใหม่ → คืนค่า ----
  const draftRestored = useRef(false);
  useEffect(() => {
    if (draftRestored.current) return;
    draftRestored.current = true;
    if (preselect.length) return;   // มาจาก deep-link "กดโอน" → ไม่ต้องคืน draft
    try {
      const raw = localStorage.getItem("china-tx-draft");
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(d.sel) && d.sel.length) setSel(new Set(d.sel.map(String)));
      if (d.pay && typeof d.pay === "object") setPay(d.pay as Record<string, string>);
      if (Array.isArray(d.thbSel) && d.thbSel.length) setThbSel(new Set(d.thbSel.map(String)));
      if (Array.isArray(d.ctwSel) && d.ctwSel.length) setCtwSel(new Set(d.ctwSel.map(String)));
      if (d.ctwPay && typeof d.ctwPay === "object") setCtwPay(d.ctwPay as Record<string, string>);
      if (Array.isArray(d.ctwEdited) && d.ctwEdited.length) setCtwEdited(new Set(d.ctwEdited.map(String)));
      if (typeof d.amount === "string") setAmount(d.amount);
      if (typeof d.refNo === "string") setRefNo(d.refNo);
      if (typeof d.note === "string") setNote(d.note);
      if (typeof d.useBalance === "boolean") setUseBalance(d.useBalance);
      if (Array.isArray(d.txSlips)) setTxSlips(d.txSlips as TxSlip[]);
      if (typeof d.step === "number") setStep(d.step);
      toast.success("คืนค่างานที่ทำค้างไว้");
    } catch { /* draft เสีย — ข้าม */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const hasData = sel.size > 0 || thbSel.size > 0 || ctwSel.size > 0 || txSlips.length > 0 || num(amount) > 0;
    try {
      if (hasData) localStorage.setItem("china-tx-draft", JSON.stringify({
        sel: [...sel], pay, thbSel: [...thbSel], ctwSel: [...ctwSel], ctwPay, ctwEdited: [...ctwEdited],
        amount, refNo, note, useBalance, txSlips, step,
      }));
      else localStorage.removeItem("china-tx-draft");
    } catch { /* noop */ }
  }, [sel, pay, thbSel, ctwSel, ctwPay, ctwEdited, amount, refNo, note, useBalance, txSlips, step]);

  // โหลดเรท R1 ตาม "วันที่โอน" (ถ้าไม่มีเรทวันนั้น → ว่าง = รอเรทเงิน)
  useEffect(() => {
    if (!transferDate) { setRate(""); return; }
    apiFetch("/api/master-v2/daily-rates?limit=90&sort_by=rate_date&sort_dir=desc")
      .then(r => r.json()).then(j => {
        const row = (j.data ?? []).find((x: Record<string, unknown>) => String(x.rate_date) === transferDate);
        setRate(row ? String(num(row.rate)) : "");
      }).catch(() => {});
  }, [transferDate]);

  const r1 = num(rate);
  const hasRate = r1 > 0;
  // ยอดต่อบิล (¥) — รวม+ค่าโอน, หักที่โอนแล้วสะสม = คงเหลือ
  const billTotalRmb = (r: Record<string, unknown>) => num(r.amount_rmb) + num(r.fee_rmb);
  const billRemainRmb = (r: Record<string, unknown>) => Math.max(0, billTotalRmb(r) - num(r.paid_rmb));

  // มาจากหน้า "บิลจีนทั้งหมด" (กดโอน) → เลือกบิลให้อัตโนมัติ
  useEffect(() => {
    if (!preselect.length || pending.length === 0) return;
    const valid = pending.filter(r => preselect.includes(String(r.id)));
    const vChina = valid.filter(r => !isThbBill(r)), vThb = valid.filter(r => isThbBill(r));
    if (vChina.length) {
      setSel(new Set(vChina.map(r => String(r.id))));
      setPay(Object.fromEntries(vChina.map(r => [String(r.id), String(Math.max(0, num(r.amount_rmb) + num(r.fee_rmb) - num(r.paid_rmb)))])));
    }
    if (vThb.length) setThbSel(new Set(vThb.map(r => String(r.id))));
    onConsumePreselect?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect, pending]);

  const toggle = (id: string, remainRmb: number) => setSel(s => {
    const n = new Set(s);
    if (n.has(id)) { n.delete(id); setPay(p => { const q = { ...p }; delete q[id]; return q; }); }
    else { n.add(id); setPay(p => ({ ...p, [id]: String(remainRmb) })); }   // default = ยอดคงเหลือของบิล (¥) แก้ตัดบางส่วนได้
    return n;
  });
  // ยอด ¥ ที่จะตัดรอบนี้ (จากช่องต่อบิล)
  const selectedRmb = useMemo(() => [...sel].reduce((a, id) => a + num(pay[id]), 0), [sel, pay]);

  // ---- บิลค่าส่ง / VAT (บาท) ----
  const pendingChina = useMemo(() => pending.filter(r => !isThbBill(r)), [pending]);
  const pendingThb   = useMemo(() => pending.filter(r => isThbBill(r)), [pending]);
  const shippingSelTotal = useMemo(() => pendingThb.filter(r => thbSel.has(String(r.id)) && r.is_shipping).reduce((a, r) => a + num(r.amount_thb), 0), [pendingThb, thbSel]);
  const vatSelTotal      = useMemo(() => pendingThb.filter(r => thbSel.has(String(r.id)) && r.vat_type).reduce((a, r) => a + num(r.amount_thb), 0), [pendingThb, thbSel]);
  const thbSelTotal = shippingSelTotal + vatSelTotal;

  // ===== สูตรคำนวณตามชีต Excel =====
  const transferred = num(amount);                            // โอนจริง (฿)
  const chinaRemainThb = transferred - thbSelTotal;           // คงเหลือ = โอนจริง − ค่าส่ง/VAT (฿)
  const tierBasisThb = Math.max(0, chinaRemainThb);          // ★ ฐานเลือกชั้นเรท R1-R4
  const effRate = hasRate ? rateFor(tierBasisThb, r1) : 0;
  const activeTier = tierBasisThb <= 5000 ? "R1" : tierBasisThb <= 99999 ? "R2" : tierBasisThb <= 399999 ? "R3" : "R4";
  const selectedSum = selectedRmb * effRate;                 // บิลจีนเป็นบาท (฿)
  const roundTotalThb = selectedSum + thbSelTotal;           // ยอดเต็มถ้าไม่ใช้คงเหลือ (฿)
  const chinaYuanBought = effRate ? tierBasisThb / effRate : 0; // เป็นเงินจีน = คงเหลือ ÷ เรท (¥)
  const shortfallRmb = Math.max(0, selectedRmb - chinaYuanBought); // หัก บช ISG (¥) — ส่วนที่ขาด
  const surplusRmb   = Math.max(0, chinaYuanBought - selectedRmb); // เข้าบัญชีจีน ส่วนต่าง (¥) — ส่วนเกิน
  const needBalance  = hasRate && shortfallRmb > 0.0001;     // เงินโอนไม่พอ → ต้องดึงยอดคงเหลือ
  // ledger: เปลี่ยนแปลงยอดคงเหลือ = +ส่วนเกิน / −ส่วนขาด (= เป็นเงินจีน − บิลจีน)
  const leftoverRmb = surplusRmb - shortfallRmb;
  const leftover = leftoverRmb * effRate;                     // ฿
  const balanceUsedRmb = shortfallRmb;                        // ¥ ที่ดึงจากยอดคงเหลือ
  const balanceUsedThb = shortfallRmb * effRate;
  const chinaInRmb = surplusRmb;                              // เข้าบัญชีจีน (¥)
  const chinaIn = surplusRmb * effRate;                       // ฿
  // ★ ขั้นต่ำที่ต้องโอน = ยอดเต็มรอบนี้ − ยอดคงเหลือที่ใช้ได้ (ถ้าเปิด toggle) — ใช้ได้ไม่เกินมูลค่าบิลจีน
  const balanceThbAvail = balance.rmb * effRate;
  const chinaCoverRmb = useBalance ? Math.min(balance.rmb, selectedRmb) : 0;   // ยอดคงเหลือที่ใช้หัก (¥) — หัก ¥ ก่อนแปลงบาท
  const chinaCoverThb = chinaCoverRmb * effRate;
  const minTransfer = Math.max(0, roundTotalThb - chinaCoverThb);
  const belowMin = hasRate && (selectedRmb > 0 || thbSelTotal > 0) && transferred < minTransfer - 0.001;
  // โอนได้ไหม: คงเหลือต้องไม่ติดลบ + ต้องไม่น้อยกว่าขั้นต่ำ
  const invalid = chinaRemainThb < -0.001 || belowMin;

  // ตัด/เคลียร์ บิล CTW (ตัดบางส่วนได้: cleared_amount สะสม)
  const ctwRemain = (r: Record<string, unknown>) => Math.max(0, num(r.net_amount) - num(r.cleared_amount));
  // เลือก/ยกเลิกบิล CTW (ยอดเติมอัตโนมัติจาก "จำนวนเงินที่โอนจริง" ผ่าน effect ด้านล่าง)
  const ctwToggle = (id: string) => setCtwSel(s => {
    const n = new Set(s);
    if (n.has(id)) {
      n.delete(id);
      setCtwPay(p => { const q = { ...p }; delete q[id]; return q; });
      setCtwEdited(e => { const q = new Set(e); q.delete(id); return q; });
    } else n.add(id);
    return n;
  });
  const ctwTotal = useMemo(() => ctw.reduce((a, r) => a + ctwRemain(r), 0), [ctw]);

  // กระจาย "จำนวนเงินที่โอนจริง" ลงบิล CTW ที่เลือก (เรียงตามรายการ) — บิลที่พิมพ์เองคงไว้, ส่วนที่เหลือไหลไปบิลถัดไป
  useEffect(() => {
    if (ctwSel.size === 0) return;
    const ids = ctw.filter(b => ctwSel.has(String(b.id))).map(b => String(b.id));
    let left = Math.max(0, num(amount) - ids.filter(id => ctwEdited.has(id)).reduce((a, id) => a + num(ctwPay[id]), 0));
    const next: Record<string, string> = { ...ctwPay };
    let changed = false;
    for (const id of ids) {
      if (ctwEdited.has(id)) continue;
      const b = ctw.find(x => String(x.id) === id);
      const alloc = Math.min(ctwRemain(b ?? {}), left);
      const v = alloc > 0 ? String(+alloc.toFixed(2)) : "0";
      if ((next[id] ?? "") !== v) { next[id] = v; changed = true; }
      left -= alloc;
    }
    if (changed) setCtwPay(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, ctwSel, ctwEdited, ctw, ctwPay]);
  // เงินโอนจริงที่ยังไม่ถูกตัดเข้าบิล CTW
  const ctwAllocated = [...ctwSel].reduce((a, id) => a + num(ctwPay[id]), 0);
  const ctwUnallocated = Math.max(0, num(amount) - ctwAllocated);
  const ctwOver = num(amount) > 0 && ctwAllocated > num(amount) + 0.001;   // ตัด CTW เกินจำนวนเงินที่โอนจริง
  const anyChinaOver = [...sel].some(id => { const r = pending.find(p => String(p.id) === id); return !!r && num(pay[id]) > billRemainRmb(r) + 0.001; });

  // อัปโหลดสลิป (จากปุ่มข้างช่องจำนวนเงิน) → เพิ่มเข้า slip → effect อ่านยอดอัตโนมัติ
  // แนบสลิปหลายใบ — อัปโหลด + AI อ่าน (ธนาคาร/ยอด/เวลา) ต่อใบ → เพิ่มเข้ารายการ + รวมยอดเข้าช่อง
  const uploadSlip = async (files: FileList) => {
    setSlipUploading(true);
    try {
      const fileArr = Array.from(files);
      const added: TxSlip[] = [];
      let failCount = 0;
      for (let idx = 0; idx < fileArr.length; idx++) {
        setSlipProgress({ done: idx, total: fileArr.length });
        const f = fileArr[idx];
        const fd = new FormData(); fd.append("file", f); fd.append("folder", "china-transfers");
        const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!j.r2_key) continue;
        const slip: TxSlip = { key: j.r2_key, bank: "", amount: 0, at: "" };
        // AI อ่าน (เฉพาะรูป ไม่ใช่ PDF)
        if (!String(j.r2_key).toLowerCase().endsWith(".pdf")) {
          setOcrBusy(true);
          try {
            const ores = await apiFetch("/api/china-pay/ocr-slip-extract", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: j.r2_key }),
            });
            const oj = await ores.json().catch(() => ({}));
            if (oj.amount) slip.amount = num(oj.amount);
            if (oj.bank) slip.bank = String(oj.bank);
            if (oj.datetime) slip.at = toDatetimeLocal(String(oj.datetime));
            // อ่านยอดไม่ได้ → ลองอ่านแบบ "ยอดอย่างเดียว" ซ้ำ (แม่นกว่าในบางสลิป)
            if (!slip.amount) {
              const o2 = await apiFetch("/api/china-pay/ocr-slip", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: j.r2_key }),
              }).then(r => r.json()).catch(() => ({}));
              if (o2.amount) slip.amount = num(o2.amount);
            }
          } catch { /* OCR พลาด — ผู้ใช้กรอกเอง */ }
          finally { setOcrBusy(false); }
          if (!slip.amount) failCount++;
        }
        added.push(slip);
      }
      if (added.length) {
        setTxSlips(prev => {
          const next = [...prev, ...added];
          setAmount(String(+next.reduce((a, s) => a + num(s.amount), 0).toFixed(2)));   // รวมยอด → ช่องจำนวนเงิน (แก้ทับได้)
          return next;
        });
        if (failCount > 0) toast.error(`อ่านยอดไม่ออก ${failCount} ใบ — กรอกยอดเองในรายการสลิป`);
        else toast.success(`แนบ ${added.length} สลิป — AI อ่านยอดให้แล้ว ตรวจสอบก่อนบันทึก`);
        if (ctw.length > 0) setSlipLinkOpen(true);   // มีบิล CTW → เปิด popup ให้เชื่อมสลิป
      }
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSlipUploading(false); setSlipProgress(null); if (slipInputRef.current) slipInputRef.current.value = ""; }
  };

  // แก้ field ของสลิป + ลบ — แล้วรวมยอดใหม่เข้าช่องจำนวนเงิน
  const setSlipField = (i: number, patch: Partial<TxSlip>) => {
    setTxSlips(prev => {
      const next = prev.map((s, idx) => idx === i ? { ...s, ...patch } : s);
      if ("amount" in patch) setAmount(String(+next.reduce((a, s) => a + num(s.amount), 0).toFixed(2)));
      return next;
    });
  };
  const removeSlip = (i: number) => {
    setTxSlips(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      setAmount(next.length ? String(+next.reduce((a, s) => a + num(s.amount), 0).toFixed(2)) : "");
      return next;
    });
  };

  // ส่งสรุปการโอนเข้า LINE (อัตโนมัติถ้าตั้ง Bot / ไม่งั้น share) + แนบลิงก์เปิดแอป
  const sendTransferLine = async (t: Record<string, unknown>) => {
    const ls = Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : [];
    const cn = ls.filter(l => l.kind === "china"), cw = ls.filter(l => l.kind === "ctw");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = t.transfer_id ? `${origin}/app/china-pay?transfer=${String(t.transfer_id)}` : `${origin}/app/china-pay`;
    let text = `💸 โอนเงินจีนสำเร็จ\nเลขโอน: ${String(t.transfer_no ?? "—")}\nวันที่: ${String(t.date ?? "")} ${String(t.at ?? "")}\n`;
    if (t.ref_no) text += `เลขอ้างอิง: ${String(t.ref_no)}\n`;
    text += `โอนจริง: ฿${fmt(num(t.transferred))}`;
    if (cn.length) text += `\n\nบิลจีน:\n` + cn.map(l => {
      const sp = (l.sup ?? {}) as Record<string, unknown>;
      const acc = sp.account_number ? `\n   บัญชี ${String(sp.account_number)}` : "";
      const bn = sp.bank_name_brief ? ` · ${String(sp.bank_name_brief)}` : "";
      return `• ${String(l.label)} ¥${fmt(num(l.paid_rmb))}${acc}${bn}`;
    }).join("\n");
    if (cw.length) text += `\n\nบิล CTW:\n` + cw.map(l => `• ${String(l.label)} ฿${fmt(num(l.paid_thb))}`).join("\n");
    setSendingTxLine(true);
    try {
      const res = await apiFetch("/api/china-pay/line-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, button: { label: "เปิดใบสรุปการโอน", url: link } }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("ส่งเข้า LINE กลุ่มแล้ว"); return; }
      if (j.needConfig) toast.error("ยังไม่ได้ตั้งค่า LINE Bot — เปิดให้เลือกกลุ่มเอง");
      else toast.error(j.error ?? "ส่ง LINE ไม่ได้ — เปิดให้เลือกกลุ่มเอง");
      window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
    } catch { window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank"); }
    finally { setSendingTxLine(false); }
  };

  // ปุ่มเดียว: ตัดบิลจีน + ตัดบิล CTW พร้อมกัน (+ เก็บประวัติ lines/เลขโอน)
  const save = async () => {
    if (sel.size === 0 && ctwSel.size === 0 && thbSel.size === 0) { toast.error("เลือกบิลที่จะตัดก่อน"); return; }
    if (sel.size > 0 && !hasRate) { toast.error("รอเรทเงิน — ใส่เรท R1 ก่อน"); return; }
    if (chinaRemainThb < -0.001) { toast.error("ยอดโอนจริงต้องไม่น้อยกว่าค่าส่ง/VAT"); return; }
    if (belowMin) { toast.error(`ยอดโอนต้องไม่น้อยกว่า ฿${fmt(minTransfer)}`); return; }
    if (ctwSel.size > 0 && num(amount) > 0 && [...ctwSel].reduce((a, id) => a + num(ctwPay[id]), 0) > num(amount) + 0.001) {
      toast.error("ยอดตัดบิล CTW รวมเกิน 'จำนวนเงินที่โอนจริง'"); return;
    }
    setSaving(true);
    try {
      const chinaIds = [...sel], ctwIds = [...ctwSel], thbIds = [...thbSel];
      // รายการย่อย (เก็บว่าการโอนนี้ตัดบิลอะไร จำนวนเท่าไหร่)
      const lines = [
        ...chinaIds.map(id => {
          const b = pending.find(p => String(p.id) === id);
          const paidRmb = num(pay[id]);
          return { kind: "china", bill_id: id, label: String(b?.supplier_label ?? b?.supplier_id ?? ""), paid_rmb: paidRmb, paid_thb: +(paidRmb * effRate).toFixed(2) };
        }),
        ...thbIds.map(id => {
          const b = pending.find(p => String(p.id) === id);
          return { kind: "thb", bill_id: id, label: b ? billTypeLabel(b) : "", paid_thb: num(b?.amount_thb) };
        }),
        ...ctwIds.map(id => {
          const r = ctw.find(x => String(x.id) === id);
          return { kind: "ctw", bill_id: id, label: String(r?.company_name ?? ""), doc_number: String(r?.doc_number ?? ""), paid_thb: Math.max(0, num(ctwPay[id])) };
        }),
      ];
      // บันทึก transfer 1 รายการ (ครอบทั้งจีน + CTW) เก็บเลขโอน + lines
      const res = await apiFetch("/api/master-v2/china-transfers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_date: transferDate || today(), bill_ids: chinaIds, bills_total_thb: +selectedSum.toFixed(2),
          amount_transferred_thb: +transferred.toFixed(2),
          rate: sel.size > 0 ? effRate : null,
          leftover_thb: sel.size > 0 ? +leftover.toFixed(2) : 0,
          leftover_rmb: sel.size > 0 ? +leftoverRmb.toFixed(2) : 0,
          ref_no: refNo || null, lines, attachments: slipKeys, tx_slips: txSlips, note: note || null, actor: "china-app",
        }),
      });
      const j = await res.json();
      if (j.error) { toast.error(j.error); setSaving(false); return; }
      // ตัดบิลจีน → สะสม paid_rmb
      await Promise.all(chinaIds.map(id => {
        const b = pending.find(p => String(p.id) === id);
        const total = num(b?.amount_rmb) + num(b?.fee_rmb);
        const newPaid = +(num(b?.paid_rmb) + num(pay[id])).toFixed(2);
        const done = newPaid >= total - 0.001;
        return apiFetch(`/api/master-v2/china-bills/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paid_rmb: newPaid, status: done ? "โอนแล้ว" : "รอโอน", rate: effRate, transfer_date: transferDate || today(), actor: "china-app" }),
        });
      }));
      // ตัดบิล CTW → สะสม cleared_amount
      await Promise.all(ctwIds.map(id => {
        const r = ctw.find(x => String(x.id) === id);
        const net = num(r?.net_amount), already = num(r?.cleared_amount);
        const p = Math.max(0, num(ctwPay[id]));
        const newCleared = Math.min(net, already + p);
        return apiFetch(`/api/master-v2/ctw-bills/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleared_amount: newCleared, cleared_at: newCleared >= net ? new Date().toISOString() : null, actor: "china-app" }),
        });
      }));
      // ตัดบิลค่าส่ง/VAT (บาท) → สถานะโอนแล้ว
      await Promise.all(thbIds.map(id =>
        apiFetch(`/api/master-v2/china-bills/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "โอนแล้ว", transfer_date: transferDate || today(), actor: "china-app" }),
        })
      ));
      celebrate("โอนสำเร็จ 🎉", { confetti: true });
      // เก็บสรุปการโอนไว้ทำ popup พิมพ์/ส่งไลน์
      const chinaThbSum = lines.filter(l => l.kind === "china").reduce((a, l) => a + num(l.paid_thb), 0);
      const ctwThbSum = lines.filter(l => l.kind === "ctw").reduce((a, l) => a + num(l.paid_thb), 0);
      // เติมข้อมูลร้าน (จาก Partners) ในบรรทัดบิลจีน เพื่อโชว์ในใบสรุป/LINE
      const enrichedLines = lines.map(l => {
        if (l.kind !== "china") return l;
        const sp = (partnerByName[String(l.label ?? "").trim()] ?? {}) as Record<string, unknown>;
        return { ...l, sup: { name_en: sp.name_en ?? "", phone: sp.phone ?? "", bank_account_name: sp.bank_account_name ?? "", account_number: sp.account_number ?? "", bank_name_brief: sp.bank_name_brief ?? "" } };
      });
      setSavedTransfer({
        transfer_id: String(j.data?.id ?? ""), transfer_no: String(j.data?.transfer_no ?? ""),
        ref_no: refNo, date: transferDate || today(), at: new Date().toLocaleString("th-TH"),
        lines: enrichedLines, rate: effRate, selectedRmb, transferred, chinaIn, chinaInRmb, chinaThbSum, ctwThbSum, attachments: slipKeys,
        // สรุปการคำนวณ (ย้ายมาจากหน้ายืนยัน → โชว์ในใบพิมพ์)
        breakdown: { thb: thbSelTotal, chinaRemainThb, billsThb: selectedSum, tier: activeTier, chinaYuanBought, shortfallRmb, surplusRmb },
      });
      setSel(new Set()); setPay({}); setThbSel(new Set()); setCtwSel(new Set()); setCtwPay({}); setCtwEdited(new Set()); setUseBalance(true);
      setAmount(""); setRefNo(""); setTxSlips([]); setNote(""); setStep(1);
      try { localStorage.removeItem("china-tx-draft"); } catch { /* noop */ }
      loadAll();
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center text-slate-400 py-10">กำลังโหลด…</div>;

  const ctwSelTotal = [...ctwSel].reduce((a, id) => a + num(ctwPay[id]), 0);   // ยอด CTW ที่เลือกตัดรอบนี้ (฿)
  // บริษัท CTW ที่ค้างเก่าสุด (เรียงตามวันที่บิล) → บัญชีที่ควรโอนไป
  const oldestCtw = [...ctw].filter(b => ctwRemain(b) > 0)
    .sort((a, b) => String(a.doc_date ?? "").localeCompare(String(b.doc_date ?? "")))[0];
  const oldestPartner = oldestCtw ? partnerByName[String(oldestCtw.company_name ?? "").trim()] : undefined;

  // การ์ดบัญชีปลายทาง (บิล CTW ค้างเก่าสุด) — โชว์ทั้ง step 1 และ step 2
  const accountCard = oldestCtw ? (
    <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
      <div className="text-xs text-orange-700 font-medium mb-1">🏦 บัญชีที่ต้องโอนไป (บิลค้างเก่าสุด)</div>
      <div className="font-semibold text-slate-800 text-sm">{String(oldestPartner?.bank_account_name ?? oldestCtw.company_name ?? "—")}</div>
      {(() => { const bn = String(oldestPartner?.bank_name_label ?? oldestPartner?.bank_name_brief ?? ""); return bn ? <div className="text-xs text-slate-500">{bn}</div> : null; })()}
      {(() => {
        const acc = String(oldestPartner?.account_number ?? oldestCtw.account_number ?? "");
        return acc ? (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-2xl font-bold tracking-wide text-slate-900">{acc}</span>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(acc); toast.success("คัดลอกเลขบัญชีแล้ว"); }}
              className="flex-shrink-0 h-9 px-3 rounded-lg bg-orange-600 text-white text-xs font-medium active:scale-95 transition">📋 คัดลอก</button>
          </div>
        ) : <div className="mt-1 text-xs text-slate-400">— ไม่พบเลขบัญชีใน Partners —</div>;
      })()}
      <div className="mt-1 text-[11px] text-slate-400">เลขที่ {String(oldestCtw.doc_number ?? "—")} · ค้าง ฿{fmt(ctwRemain(oldestCtw))}</div>
    </div>
  ) : null;

  return (
    <div className="space-y-4 pb-[150px]">
      {/* มุมขวาบน: เรทวันนี้ + ปุ่มขอเรท */}
      <div className="flex justify-end items-center gap-2">
        <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${hasRate ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
          {hasRate ? `เรทวันนี้ ${fmt(r1)}` : "ยังไม่มีเรทวันนี้"}
        </span>
        {/* ซ่อนปุ่มขอเรท ถ้าวันนี้มีเรทแล้ว */}
        {!hasRate && <button type="button" onClick={() => void requestRateViaLine()} className="text-xs font-semibold text-white bg-[#06C755] rounded-full px-2.5 py-1.5 active:scale-95 transition">📩 ขอเรท</button>}
      </div>

      {/* ยอดที่ต้องโอนรอบนี้ (฿ นำ · หักยอดคงเหลือ ¥) — sticky ตรึงบน · โชว์ step 1 เท่านั้น */}
      {step === 1 && (
      <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm sticky top-0 z-20">
        <button type="button" onClick={() => setShowBills(v => !v)} className="w-full text-left">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">💸 ยอดที่ต้องโอนรอบนี้</span>
            <span className="text-[11px] text-slate-400">{showBills ? "ย่อ ▲" : "ดูรายการ ▼"}</span>
          </div>
          <div className="flex justify-between items-baseline mt-1 gap-2">
            <span className="text-xs text-slate-500 flex-shrink-0">บิลจีน ({sel.size}){thbSel.size > 0 ? ` + ค่าส่ง/VAT (${thbSel.size})` : ""}</span>
            <span className="text-3xl font-extrabold text-red-600">{minTransfer > 0 ? `฿${fmt(+minTransfer.toFixed(2))}` : (hasRate ? "รอเลือกบิล" : "รอเรท")}</span>
          </div>
          {hasRate && minTransfer > 0 && <div className="text-right text-xs text-slate-400 -mt-0.5">≈ ¥{fmt(+(selectedRmb - chinaCoverRmb).toFixed(2))}{thbSelTotal > 0 ? " + ค่าส่ง/VAT" : ""}{chinaCoverRmb > 0 ? ` · หักคงเหลือ ¥${fmt(+chinaCoverRmb.toFixed(2))}` : ""}</div>}
        </button>
        {showBills && (sel.size > 0 || thbSel.size > 0) && (
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-sm">
            {[...sel].map(id => { const b = pending.find(p => String(p.id) === id); const v = num(pay[id]); return (
              <div key={id} className="flex justify-between gap-2 items-baseline">
                <span className="text-slate-500 truncate">{String(b?.supplier_label ?? b?.supplier_id ?? "—")}</span>
                <span className="text-right flex-shrink-0">
                  <span className="text-slate-700">¥{fmt(v)}</span>
                  {hasRate && <span className="text-[10px] text-slate-400 ml-1">× {fmt(effRate)} ≈ ฿{fmt(+(v * effRate).toFixed(2))}</span>}
                </span>
              </div>
            ); })}
            {[...thbSel].map(id => { const b = pending.find(p => String(p.id) === id); return (
              <div key={id} className="flex justify-between gap-2"><span className="text-slate-500 truncate">{b ? billTypeLabel(b) : ""}</span><span className="text-slate-700 flex-shrink-0">฿{fmt(num(b?.amount_thb))}</span></div>
            ); })}
            {/* ผลรวมบิล (ตัวหนา) */}
            <div className="flex justify-between gap-2 border-t border-slate-100 pt-1 mt-1">
              <span className="text-slate-600 font-medium">รวมบิลจีน</span>
              <span className="font-bold text-slate-800">¥{fmt(selectedRmb)}{hasRate ? ` ≈ ฿${fmt(+selectedSum.toFixed(2))}` : ""}</span>
            </div>
            {thbSelTotal > 0 && (
              <div className="flex justify-between gap-2"><span className="text-slate-600 font-medium">รวมค่าส่ง/VAT</span><span className="font-bold text-slate-800">฿{fmt(thbSelTotal)}</span></div>
            )}
            {chinaCoverRmb > 0 && (
              <div className="flex justify-between gap-2"><span className="text-slate-600 font-medium">หักยอดคงเหลือจีน</span><span className="font-bold text-orange-600">−¥{fmt(+chinaCoverRmb.toFixed(2))}{hasRate ? ` ≈ −฿${fmt(+(chinaCoverRmb * effRate).toFixed(2))}` : ""}</span></div>
            )}
          </div>
        )}
      </div>
      )}

      {/* ยอดคงเหลือในบัญชีจีน — การ์ดเล็ก + toggle (default เปิด) · โชว์ step 1 เท่านั้น */}
      {step === 1 && (
        <div className={`rounded-xl border px-4 py-2.5 ${needBalance ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700">💰 ยอดคงเหลือในบัญชีจีน</span>
            <span className="text-right"><span className="font-bold text-emerald-800">¥{fmt(balance.rmb)}</span><span className="text-[11px] text-emerald-600 ml-1.5">≈ ฿{fmt(+(balance.rmb * (effRate || r1)).toFixed(2))}</span></span>
          </div>
          {balance.rmb > 0 && (
            <label className="mt-1.5 flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[11px] text-slate-600">ใช้ยอดคงเหลือช่วยจ่าย{needBalance ? " (จำเป็น)" : ""} — หักจากยอดที่ต้องโอน</span>
              <span className="relative inline-flex flex-shrink-0">
                <input type="checkbox" checked={useBalance} onChange={e => setUseBalance(e.target.checked)} className="sr-only peer" />
                <span className="w-9 h-5 bg-slate-300 rounded-full peer-checked:bg-emerald-500 transition" />
                <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition peer-checked:translate-x-4" />
              </span>
            </label>
          )}
        </div>
      )}

      {/* STEP 1: เลือกบิลจีน */}
      {step === 1 && (<>
      {accountCard}
      {/* บิลค่าส่ง / VAT (บาท) — โชว์บนสุด กรอบคนละสี */}
      {pendingThb.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-800">บิลค่าส่ง / VAT (บาท)</span>
            {thbSel.size > 0 && <span className="text-xs font-bold text-slate-700">รวม ฿{fmt(thbSelTotal)}</span>}
          </div>
          <div className="space-y-2">
            {pendingThb.map((r) => {
              const id = String(r.id), on = thbSel.has(id);
              const ship = !!r.is_shipping;
              return (
                <button key={id} onClick={() => thbToggle(id)}
                  className={`w-full flex items-center gap-3 p-2.5 text-left rounded-lg border-2 ${on
                    ? (ship ? "border-purple-400 bg-purple-50" : "border-rose-400 bg-rose-50")
                    : (ship ? "border-purple-200" : "border-rose-200")}`}>
                  <span className={`w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${on ? (ship ? "bg-purple-600 text-white" : "bg-rose-600 text-white") : "border border-slate-300"}`}>{on ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ship ? "bg-purple-100 text-purple-700" : "bg-rose-100 text-rose-700"}`}>{billTypeLabel(r)}</span>
                      <span className="block text-xs text-slate-400 truncate">{String(r.bill_date ?? r.transfer_date ?? "—")}</span>
                    </span>
                  </span>
                  <span className="font-bold text-slate-800 flex-shrink-0">฿{fmt(num(r.amount_thb))}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-slate-800">เลือกบิลที่จะตัด (รอโอน)</span>
          {sel.size > 0 && <span className="text-xs font-bold text-slate-700">{sel.size} บิล · ¥{fmt(selectedRmb)}{hasRate ? ` ≈ ฿${fmt(selectedSum)}` : ""}</span>}
        </div>
        {pendingChina.length === 0 ? (
          <div className="text-center text-slate-300 py-6 text-sm">— ไม่มีบิลจีนรอโอน —</div>
        ) : (
          <div className="space-y-2">
            {pendingChina.map((r) => {
              const id = String(r.id), on = sel.has(id);
              const remain = billRemainRmb(r), paid = num(r.paid_rmb);
              const remainThb = remain * effRate;
              return (
                <div key={id} className={`rounded-lg border ${on ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={() => toggle(id, remain)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${on ? "bg-emerald-600 text-white" : "border border-slate-300"}`}>{on ? "✓" : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800 truncate">{String(r.supplier_label ?? r.supplier_id ?? "—")}</span>
                        <span className="block text-[10px] text-slate-400 truncate">{hasRate ? `฿${fmt(remainThb)}` : "รอเรท"} · {String(r.transfer_date ?? "—")}{paid > 0 ? ` · จ่ายแล้ว ¥${fmt(paid)}` : ""}</span>
                      </span>
                    </button>
                    {on
                      ? (() => { const over = num(pay[id]) > remain + 0.001; return (
                          <Money value={pay[id] ?? ""} onChange={(v) => setPay(p => ({ ...p, [id]: v }))}
                            className={`w-24 flex-shrink-0 h-9 px-2 text-base text-right font-bold border rounded-lg ${over ? "border-red-500 bg-red-50 text-red-600" : "border-emerald-400 bg-white"}`} />
                        ); })()
                      : <span className="font-bold text-slate-800 flex-shrink-0">¥{fmt(remain)}</span>}
                  </div>
                  {on && <div className={`px-2 pb-1.5 text-[10px] text-right ${num(pay[id]) > remain + 0.001 ? "text-red-500 font-medium" : "text-slate-400"}`}>{num(pay[id]) > remain + 0.001 ? `เกินยอด! สูงสุด ¥${fmt(remain)}` : `สูงสุด ¥${fmt(remain)}`}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-md z-30 px-4 py-3 bg-slate-50 border-t border-slate-200">
        <button onClick={() => setStep(2)} disabled={(sel.size === 0 && thbSel.size === 0) || anyChinaOver}
          className="w-full h-12 bg-emerald-600 text-white rounded-xl font-semibold active:scale-[0.99] transition disabled:opacity-40 shadow-lg shadow-emerald-500/30">
          {(sel.size === 0 && thbSel.size === 0) ? "เลือกบิลอย่างน้อย 1 บิล" : anyChinaOver ? "มีบิลที่ใส่ยอดเกิน" : "ถัดไป: ยืนยันการโอน →"}
        </button>
      </div>
      </>)}

      {/* STEP 2: กรอกจำนวน + สลิป (ยอด/บัญชี/ยอดคงเหลือ อยู่การ์ดบนแล้ว) */}
      {step === 2 && (<>
      <Card>
        {/* จำนวนเงินที่โอนจริง (เต็มความกว้าง) */}
        <div>
          <Label>จำนวนเงินที่โอนจริง (฿)</Label>
          <Money value={amount} onChange={setAmount} />
          {belowMin && <div className="mt-1 text-[11px] text-red-500">* ยอดโอนต้องไม่น้อยกว่า ฿{fmt(+minTransfer.toFixed(2))}{useBalance && chinaCoverThb > 0 ? " (หักยอดคงเหลือแล้ว)" : ""}</div>}
          {!useBalance && hasRate && balance.rmb > 0 && transferred > 0 && transferred < roundTotalThb - 0.001 && (
            <div className="mt-1 text-[11px] text-amber-600">💡 เปิด “ใช้ยอดคงเหลือในบัญชีจีน” ด้านล่าง เพื่อลดยอดขั้นต่ำได้ (มี ¥{fmt(balance.rmb)})</div>
          )}
          <input ref={slipInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden"
            onChange={e => { const fs = e.target.files; if (fs && fs.length) uploadSlip(fs); }} />
        </div>
        {!hasRate && <div className="mt-2 text-[11px] text-amber-600">* ยังไม่มีเรทของวันนี้ — กด “ขอเรท” มุมขวาบน หรือไปใส่ที่เมนู “เรท”</div>}
        {/* สรุปการคำนวณย้ายไปโชว์ในใบ "พิมพ์รายการโอน" แทน */}
        {/* รายการสลิป (หลายใบ) — AI อ่านยอด/ธนาคาร/เวลา แก้ได้ทุกช่อง */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <Label>📎 สลิปการโอน ({txSlips.length})</Label>
            {txSlips.length > 0 && <span className="text-sm font-bold text-violet-700">รวม ฿{fmt(slipSum)}</span>}
          </div>
          <button type="button" onClick={() => slipInputRef.current?.click()} disabled={slipUploading || ocrBusy}
            className="w-full h-12 rounded-xl border-2 border-dashed border-violet-300 text-violet-600 text-base font-semibold disabled:opacity-50 active:scale-[0.99] transition">
            ＋ เพิ่มสลิป (แนบได้หลายใบ)
          </button>
          {/* ตัวโหลดชัด ๆ ระหว่างอัปโหลด+อ่าน AI */}
          {(slipUploading || ocrBusy) && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-3 py-3 text-sm font-medium text-violet-700">
              <span className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span>📷 AI กำลังอ่านสลิป{slipProgress ? ` (${slipProgress.done + 1}/${slipProgress.total})` : ""}… อาจใช้เวลาสักครู่</span>
            </div>
          )}
          <div className="mt-2 space-y-2">
            {txSlips.map((s, i) => (
              <div key={s.key + i} className="flex gap-2 bg-white border border-slate-200 rounded-lg p-2">
                {s.key.toLowerCase().endsWith(".pdf")
                  ? <a href={r2Url(s.key)} target="_blank" rel="noreferrer" className="w-14 h-14 flex-shrink-0 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-xl">📄</a>
                  : <button type="button" onClick={() => setLightbox(r2Url(s.key))} className="w-14 h-14 flex-shrink-0 rounded overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2Url(s.key)} alt="" className="w-full h-full object-cover" /></button>}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex gap-1.5">
                    <input value={s.bank} onChange={e => setSlipField(i, { bank: e.target.value })} placeholder="ธนาคาร"
                      className="w-1/2 h-9 px-2 text-sm border border-slate-200 rounded" />
                    <Money value={s.amount ? String(s.amount) : ""} onChange={(v) => setSlipField(i, { amount: num(v) })}
                      className="w-1/2 h-9 px-2 text-sm text-right border border-slate-200 rounded" />
                  </div>
                  <input type="datetime-local" value={s.at} onChange={e => setSlipField(i, { at: e.target.value })}
                    className="w-full h-9 px-2 text-xs border border-slate-200 rounded text-slate-600" />
                  {s.bill_id && (() => { const b = ctw.find(x => String(x.id) === s.bill_id); return <div className="text-[10px] text-orange-600">🔗 {String(b?.company_name ?? "บิล CTW")}</div>; })()}
                </div>
                <button type="button" onClick={() => removeSlip(i)} className="w-7 flex-shrink-0 flex items-center justify-center text-red-500 hover:bg-red-50 rounded">✕</button>
              </div>
            ))}
          </div>
          {txSlips.length > 0 && ctw.length > 0 && (
            <button type="button" onClick={() => setSlipLinkOpen(true)}
              className="mt-2 w-full h-10 rounded-lg border border-orange-300 text-orange-700 text-sm font-medium active:scale-[0.99] transition">
              🔗 เชื่อมสลิปกับบิล CTW
            </button>
          )}
        </div>
      </Card>
      <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-md z-30 px-4 py-3 bg-slate-50 border-t border-slate-200 flex gap-2">
        <button onClick={() => setStep(1)} className="h-12 px-4 border border-slate-300 bg-white text-slate-600 rounded-xl font-medium">← กลับ</button>
        <button onClick={() => setStep(3)} disabled={(sel.size > 0 && !hasRate) || ((selectedRmb > 0 || thbSelTotal > 0) && num(amount) <= 0) || invalid}
          className="flex-1 h-12 bg-emerald-600 text-white rounded-xl font-semibold active:scale-[0.99] transition disabled:opacity-40 shadow-lg shadow-emerald-500/30">
          {(sel.size > 0 && !hasRate) ? "ยังไม่มีเรทวันนี้ — ใส่เรทก่อน"
            : ((selectedRmb > 0 || thbSelTotal > 0) && num(amount) <= 0) ? "ใส่จำนวนเงินที่โอนจริง"
            : belowMin ? `ต้องโอน ≥ ฿${fmt(minTransfer)}`
            : "ถัดไป: เลือกบิล CTW →"}
        </button>
      </div>
      </>)}

      {/* STEP 3: เลือกบิล CTW (หน้าสุดท้าย) + บันทึก */}
      {step === 3 && (<>
      {/* บิล CTW ที่ยังไม่ตัด — ยอดคงเหลือสีส้ม + ตัดบางส่วนได้ */}
      <Card>
        <div className="flex justify-between items-center mb-2">
          <div className="font-semibold text-slate-800">บิล CTW ที่ยังไม่ตัด</div>
          <div className="text-right">
            <div className="text-[11px] text-slate-400">ยอดคงเหลือยังไม่ตัด ({ctw.length} บิล)</div>
            <div className="font-bold text-orange-500 text-xl">฿{fmt(ctwTotal)}</div>
          </div>
        </div>
        {ctw.length === 0 ? (
          <div className="text-center text-slate-300 py-4 text-sm">— ตัดครบแล้ว —</div>
        ) : (
          <>
            <div className="space-y-2">
              {ctw.map((r) => {
                const id = String(r.id), on = ctwSel.has(id), remain = ctwRemain(r), paid = num(r.cleared_amount);
                return (
                  <div key={id} className={`rounded-lg border ${on ? "border-orange-400 bg-orange-50" : "border-slate-200"}`}>
                    <button onClick={() => ctwToggle(id)} className="w-full flex items-center gap-3 p-2.5 text-left">
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${on ? "bg-orange-600 text-white" : "border border-slate-300"}`}>{on ? "✓" : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-800 truncate">{String(r.company_name ?? "—")}</span>
                        <span className="block text-xs text-slate-400">เลขที่ {String(r.doc_number ?? "—")} · {String(r.doc_date ?? "—")}{paid > 0 ? ` · จ่ายแล้ว ฿${fmt(paid)}` : ""}</span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block font-semibold text-slate-800">฿{fmt(remain)}</span>
                        {paid > 0 && <span className="block text-[10px] text-slate-400">เต็ม ฿{fmt(num(r.net_amount))}</span>}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>


      {/* บิล CTW ที่เลือก + บัญชีปลายทาง + ยอดที่โอน (กระจายจาก "จำนวนเงินที่โอนจริง") */}
      {ctwSel.size > 0 && (
        <div className="rounded-2xl bg-orange-50 border border-orange-100 p-3 space-y-2">
          <div className="flex justify-between items-center">
            <div className="font-medium text-slate-700 text-sm">บิล CTW ที่ตัดรอบนี้ ({ctwSel.size})</div>
            {ctwOver
              ? <div className="text-xs text-red-500 font-medium">เกินจำนวนเงินที่โอนจริง!</div>
              : ctwUnallocated > 0 && <div className="text-xs text-amber-600 font-medium">คงเหลือยังไม่ตัด ฿{fmt(ctwUnallocated)}</div>}
          </div>
          {[...ctwSel].map(id => {
            const b = ctw.find(x => String(x.id) === id);
            if (!b) return null;
            return (
              <div key={id} className="rounded-lg bg-white border border-orange-200 p-3">
                <div className="font-medium text-slate-800 text-sm">{String(b.company_name ?? "—")}</div>
                <div className="text-[11px] text-slate-400">เลขที่ {String(b.doc_number ?? "—")} · ค้าง ฿{fmt(ctwRemain(b))}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500 flex-shrink-0">ยอดที่โอนรอบนี้ (฿)</span>
                  <Money value={ctwPay[id] ?? ""} onChange={(v) => { setCtwEdited(e => new Set(e).add(id)); setCtwPay(p => ({ ...p, [id]: v })); }}
                    className="flex-1 h-9 px-2 text-base text-right border border-orange-300 rounded-lg" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-md z-30 px-4 py-3 bg-slate-50 border-t border-slate-200">
        <button onClick={save} disabled={saving || ctwOver}
          className="w-full h-12 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform shadow-lg shadow-emerald-500/30">
          {saving ? "กำลังบันทึก…" : "บันทึกการโอน + ตัดบิล"}
        </button>
        <button onClick={() => setStep(2)} className="w-full h-9 text-slate-500 text-sm mt-1">← กลับ</button>
      </div>
      </>)}

      {/* popup เชื่อมสลิป → บิล CTW */}
      {slipLinkOpen && (
        <Portal><div className="fixed inset-0 z-[260] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setSlipLinkOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-slate-800">🔗 เชื่อมสลิป → บิล CTW</span>
              <button onClick={() => setSlipLinkOpen(false)} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-xl leading-none">×</button>
            </div>
            <div className="p-3 overflow-y-auto space-y-2">
              <div className="text-xs text-slate-400">เลือกว่าสลิปแต่ละใบใช้ตัดบิล CTW ใบไหน (ไม่บังคับ) — เลือกแล้วบิลนั้นจะถูกเลือกตัดให้</div>
              {txSlips.map((s, i) => (
                <div key={s.key + i} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2">
                  {s.key.toLowerCase().endsWith(".pdf")
                    ? <span className="w-10 h-10 flex-shrink-0 rounded bg-slate-50 border border-slate-200 flex items-center justify-center">📄</span>
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={r2Url(s.key)} alt="" className="w-10 h-10 flex-shrink-0 rounded object-cover border border-slate-200" />}
                  <div className="flex-1 min-w-0 text-xs text-slate-600 truncate">{s.bank || "สลิป"} · ฿{fmt(num(s.amount))}</div>
                  <select value={s.bill_id ?? ""}
                    onChange={e => { const v = e.target.value || undefined; setSlipField(i, { bill_id: v }); if (v) setCtwSel(cs => new Set(cs).add(v)); }}
                    className="flex-shrink-0 max-w-[55%] h-9 px-2 text-xs border border-slate-200 rounded-lg bg-white">
                    <option value="">— ไม่ระบุ —</option>
                    {ctw.map(b => <option key={String(b.id)} value={String(b.id)}>{String(b.company_name ?? "—")} ({String(b.doc_number ?? "—")}) ฿{fmt(ctwRemain(b))}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={() => setSlipLinkOpen(false)} className="w-full h-11 bg-emerald-600 text-white rounded-lg font-semibold">เสร็จ</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* ดูสลิปเต็มจอ */}
      {lightbox && (
        <Portal><div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white text-2xl leading-none">×</button>
        </div></Portal>
      )}

      {/* popup หลังโอนสำเร็จ: พิมพ์รายการ / ส่งไลน์ */}
      {savedTransfer && (
        <Portal><div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4" onClick={() => setSavedTransfer(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 text-center" onClick={e => e.stopPropagation()}>
            <div className="text-3xl mb-1">✅</div>
            <div className="text-lg font-semibold text-slate-800">โอนสำเร็จ</div>
            <div className="mt-1 text-sm text-slate-500">เลขโอน {String(savedTransfer.transfer_no ?? "—")} · โอนจริง ฿{fmt(num(savedTransfer.transferred))}</div>
            <div className="mt-4 space-y-2">
              <button onClick={() => sendTransferLine(savedTransfer)} disabled={sendingTxLine} className="w-full h-11 bg-[#06C755] text-white rounded-lg font-medium disabled:opacity-50">{sendingTxLine ? "กำลังส่ง…" : "📩 ส่งไลน์ (ข้อความ)"}</button>
              <button onClick={() => setSavedTransfer(null)} className="w-full h-10 text-slate-500 text-sm">ปิด</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}

// ---------------- ใบสรุปการโอน (โหลดเป็นรูปได้) ----------------
function TransferReceiptPopup({ t, onClose, autoSendLine, onDelete }: { t: Record<string, unknown>; onClose: () => void; autoSendLine?: boolean; onDelete?: () => void }) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [sendState, setSendState] = useState<"" | "sending" | "sent">("");
  useEffect(() => {
    const f = (document as Document & { fonts?: FontFaceSet & { load?: (s: string) => Promise<unknown>; ready?: Promise<unknown> } }).fonts;
    if (!f) { setFontsReady(true); return; }
    const fams = ["'Noto Sans Thai'", "'Sarabun'"];
    const specs = fams.flatMap((fam) => [`14px ${fam}`, `17px ${fam}`, `bold 20px ${fam}`, `bold 28px ${fam}`]);
    Promise.all([...(f.load ? specs.map((s) => f.load!(s).catch(() => {})) : []), f.ready].filter(Boolean))
      .then(() => setFontsReady(true)).catch(() => setFontsReady(true));
  }, []);
  const ls = Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : [];
  const cn = ls.filter(l => l.kind === "china"), cw = ls.filter(l => l.kind === "ctw");
  const atts = Array.isArray(t.attachments) ? (t.attachments as unknown[]).map(String) : [];
  const r2Url = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
  const isPdf = (k: string) => k.toLowerCase().endsWith(".pdf");

  // วาดใบสรุปการโอนลง canvas (สำหรับโหลดเป็นรูป)
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    type Row = { t: "kv" | "sep" | "head" | "sub"; l?: string; r?: string; bold?: boolean; color?: string };
    const bd = t.breakdown as Record<string, unknown> | undefined;
    const rows: Row[] = [
      ...(t.ref_no ? [{ t: "kv", l: "เลขอ้างอิง", r: String(t.ref_no) } as Row] : []),
      { t: "kv", l: "โอนจริง", r: "฿" + fmt(num(t.transferred)), bold: true },
      ...(bd ? [
        ...(num(bd.thb) > 0 ? [{ t: "kv", l: "หัก ค่าส่ง/VAT", r: "−฿" + fmt(num(bd.thb)), color: "#e11d48" } as Row] : []),
        { t: "kv", l: "คงเหลือ", r: "฿" + fmt(num(bd.chinaRemainThb)) } as Row,
        { t: "kv", l: `เรทที่ใช้ (ชั้น ${String(bd.tier ?? "")})`, r: fmt(num(t.rate)) } as Row,
        { t: "kv", l: "เป็นเงินจีน", r: "¥" + fmt(+num(bd.chinaYuanBought).toFixed(2)) } as Row,
        ...(num(bd.shortfallRmb) > 0 ? [{ t: "kv", l: "หัก ยอดคงเหลือจีน", r: "¥" + fmt(+num(bd.shortfallRmb).toFixed(2)), color: "#ea580c" } as Row] : []),
        { t: "kv", l: "รวมยอด (บิลจีน)", r: "¥" + fmt(num(t.selectedRmb)), bold: true } as Row,
      ] : [{ t: "kv", l: "เรทที่ใช้", r: fmt(num(t.rate)) } as Row]),
      { t: "kv", l: "เข้าบัญชีจีน (ส่วนต่าง)", r: "¥" + fmt(+num(t.chinaInRmb).toFixed(2)), color: "#059669" },
    ];
    if (cn.length) {
      rows.push({ t: "sep" }, { t: "head", l: `บิลจีน (${cn.length})` });
      cn.forEach((l, i) => {
        if (i > 0) rows.push({ t: "sep" });   // เส้นแบ่งระหว่างร้าน
        const sp = (l.sup ?? {}) as Record<string, unknown>;
        rows.push({ t: "kv", l: String(l.label || "—"), r: "¥" + fmt(num(l.paid_rmb)), bold: true });
        if (sp.name_en) rows.push({ t: "sub", l: String(sp.name_en) });
        if (sp.phone) rows.push({ t: "sub", l: "โทร: " + String(sp.phone) });
        if (sp.bank_account_name) rows.push({ t: "sub", l: "ชื่อบัญชี: " + String(sp.bank_account_name) });
        if (sp.account_number) rows.push({ t: "sub", l: "เลขบัญชี: " + String(sp.account_number) });
        if (sp.bank_name_brief) rows.push({ t: "sub", l: "ธนาคาร: " + String(sp.bank_name_brief) });
      });
    }
    if (cw.length) {
      rows.push({ t: "sep" }, { t: "head", l: `บิล CTW (${cw.length})` });
      cw.forEach(l => {
        rows.push({ t: "kv", l: String(l.label || "—"), r: "฿" + fmt(num(l.paid_thb)) });
        if (l.doc_number) rows.push({ t: "sub", l: "เลขที่บิล: " + String(l.doc_number) });
      });
    }
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = 600, headerH = 96, padX = 36, padTop = 24, padBottom = 36;
    const hOf = (r: Row) => r.t === "sep" ? 18 : r.t === "sub" ? 26 : r.t === "head" ? 40 : 40;
    const H = headerH + padTop + rows.reduce((a, r) => a + hOf(r), 0) + padBottom;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = "100%"; cv.style.height = "auto";
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.scale(DPR, DPR);
    const FONT = "'Noto Sans Thai','Sarabun',-apple-system,'Segoe UI',sans-serif";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, "#10b981"); grad.addColorStop(1, "#0d9488");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `bold 28px ${FONT}`; ctx.fillText("💸 ใบสรุปการโอนเงินจีน", padX, 38);
    ctx.font = `15px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fillText(`เลขโอน ${String(t.transfer_no ?? "—")} · ${String(t.date ?? "")}`, padX, 70);
    let y = headerH + padTop;
    const padR = 56;   // ขอบขวากว้างพิเศษ กันค่าชนขอบ/โดนตัด
    // วาดตัวเลขชิดขวาแบบวัดความกว้างเอง (textAlign:"right" เพี้ยนบน iOS → ค่า ฿ ถูกดันเลยขอบ)
    const fit = (text: string, size: number, bold: boolean, color: string, leftBound: number) => {
      const maxW = (W - padR) - leftBound; let s = size; ctx.fillStyle = color; ctx.textAlign = "left";
      do { ctx.font = `${bold ? "bold " : ""}${s}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; s -= 1; } while (s > 9);
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, (W - padR) - tw, y);
    };
    for (const r of rows) {
      const h = hOf(r);
      if (r.t === "sep") { ctx.strokeStyle = "#e5e7eb"; ctx.beginPath(); ctx.moveTo(padX, y + 9); ctx.lineTo(W - padX, y + 9); ctx.stroke(); y += h; continue; }
      const my = y + h / 2;
      const oldY = y; y = my; // fit() uses y
      if (r.t === "head") { ctx.textAlign = "left"; ctx.fillStyle = "#0f766e"; ctx.font = `bold 17px ${FONT}`; ctx.fillText(r.l ?? "", padX, my); }
      else if (r.t === "sub") { ctx.textAlign = "left"; ctx.fillStyle = "#64748b"; ctx.font = `14px ${FONT}`; ctx.fillText(r.l ?? "", padX + 8, my); }
      else { ctx.textAlign = "left"; ctx.fillStyle = "#64748b"; ctx.font = `17px ${FONT}`; const lw = r.l ? ctx.measureText(r.l).width : 0; if (r.l) ctx.fillText(r.l, padX, my); fit(r.r ?? "", r.bold ? 20 : 18, !!r.bold, r.color ?? "#1e293b", padX + lw + 16); }
      y = oldY + h;
    }
  }, [t, cn, cw, fontsReady]);

  const saveImage = async () => {
    setBusy(true);
    try {
      const cv = canvasRef.current; const blob = await new Promise<Blob | null>(res => cv ? cv.toBlob(res, "image/png") : res(null));
      if (!blob) { toast.error("สร้างรูปไม่สำเร็จ"); return; }
      const name = `china-transfer-${String(t.transfer_no ?? "")}.png`.replace(/[\\/:*?"<>|]/g, "_");
      await downloadOrSaveImage(blob, name);
      toast.success("บันทึกรูปแล้ว");
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  // ส่งใบสรุปการโอน "เป็นรูป" + สลิปที่แนบ เข้า LINE กลุ่ม
  const sendLineImage = async () => {
    setBusy(true); setSendState("sending");
    try {
      const cv = canvasRef.current; if (!cv) { toast.error("สร้างรูปไม่สำเร็จ"); setSendState(""); return; }
      const dataUrl = cv.toDataURL("image/png");
      const cfg: Record<string, string> = await apiFetch("/api/master-v2/china-app-settings?limit=20").then(r => r.json())
        .then(j => ((j.data ?? []).find((x: Record<string, unknown>) => x.skey === "line_config")?.sval ?? {}))
        .catch(() => ({}));
      const base = String(cfg.share_base ?? "").replace(/\/$/, "");
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const link = t.transfer_id ? `${origin}/app/china-pay?transfer=${String(t.transfer_id)}` : `${origin}/app/china-pay`;
      let text = `💸 ใบสรุปการโอนเงินจีน\nเลขโอน: ${String(t.transfer_no ?? "—")}\nวันที่: ${String(t.date ?? "")}\nเรท: ${fmt(num(t.rate))} · โอนจริง ฿${fmt(num(t.transferred))}`;
      if (cn.length) text += `\n\nบิลจีน:\n` + cn.map(l => `• ${String(l.label || "—")} ¥${fmt(num(l.paid_rmb))}`).join("\n");
      if (cw.length) text += `\n\nบิล CTW:\n` + cw.map(l => `• ${String(l.label || "—")}${l.doc_number ? ` (${String(l.doc_number)})` : ""} ฿${fmt(num(l.paid_thb))}`).join("\n");
      const toPublic = async (du: string, name: string) => {
        const up = await apiFetch("/api/china-pay/share-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: du, name }) }).then(r => r.json()).catch(() => ({}));
        return up.key ? `${base}/${up.key}` : "";
      };
      const keyToDataUrl = async (key: string) => {
        try { const r = await apiFetch(`/api/r2-image?key=${encodeURIComponent(key)}`); const blob = await r.blob();
          return await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(""); fr.readAsDataURL(blob); });
        } catch { return ""; }
      };
      let imageUrl = "", slipUrls: string[] = [];
      if (base) {
        imageUrl = await toPublic(dataUrl, `transfer-${String(t.transfer_no ?? "")}`);
        const imgs = atts.filter(k => !isPdf(k)).slice(0, 3);   // LINE: รูปสรุป + สลิป ≤4 รูป/ครั้ง
        for (const k of imgs) { const du = await keyToDataUrl(k); if (du) { const u = await toPublic(du, "slip"); if (u) slipUrls.push(u); } }
      }
      const res = await apiFetch("/api/china-pay/line-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, imageUrl, imageUrls: slipUrls, button: { label: "เปิดใบสรุปการโอน", url: link } }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setSendState("sent"); setTimeout(() => setSendState(""), 1600); toast.success(imageUrl ? `ส่งรูปเข้า LINE แล้ว${slipUrls.length ? ` (+สลิป ${slipUrls.length})` : ""}` : "ส่งข้อความเข้า LINE แล้ว (ยังไม่ได้ตั้ง R2 public)"); return; }
      setSendState("");
      if (j.needConfig) { toast.error("ยังไม่ได้ตั้งค่า LINE Bot — เปิดให้เลือกกลุ่มเอง"); window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank"); }
      else toast.error(j.error ?? "ส่ง LINE ไม่ได้");
    } catch (e) { setSendState(""); toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  // เปิดมาจากปุ่ม "ส่งไลน์ (รูป)" ของ popup โอนสำเร็จ → ส่งอัตโนมัติครั้งเดียว (รอ canvas วาดเสร็จ)
  const autoRef = useRef(false);
  useEffect(() => {
    if (!autoSendLine || autoRef.current) return;
    autoRef.current = true;
    const id = setTimeout(() => { sendLineImage(); }, 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Portal>
    <div className="fixed inset-0 z-[220] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="font-semibold text-slate-800">ใบสรุปการโอน</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div id="tx-receipt" className="p-4 overflow-y-auto flex-1">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl p-3 mb-3">
            <div className="font-bold">💸 ใบสรุปการโอนเงินจีน</div>
            <div className="text-xs opacity-90">เลขโอน {String(t.transfer_no ?? "—")} · {String(t.date ?? "")}</div>
          </div>
          {!!t.ref_no && <Row label="เลขอ้างอิง" v={String(t.ref_no)} />}
          {/* แถวค่าเงิน — ค่าชิดขวาเสมอ (ml-auto text-right) + ห้ามตัดบรรทัด (กันตอนพิมพ์) */}
          <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">โอนจริง</span><span className="font-bold text-slate-900 whitespace-nowrap ml-auto text-right">฿{fmt(num(t.transferred))}</span></div>
          {(() => { const bd = t.breakdown as Record<string, unknown> | undefined; if (!bd) return <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">เรทที่ใช้</span><span className="font-medium text-slate-800 whitespace-nowrap ml-auto text-right">{fmt(num(t.rate))}</span></div>; return (
            <>
              {num(bd.thb) > 0 && <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">หัก ค่าส่ง/VAT</span><span className="text-rose-600 whitespace-nowrap ml-auto text-right">−฿{fmt(num(bd.thb))}</span></div>}
              <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">คงเหลือ</span><span className="font-medium text-slate-800 whitespace-nowrap ml-auto text-right">฿{fmt(num(bd.chinaRemainThb))}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">เรทที่ใช้ (ชั้น {String(bd.tier ?? "")})</span><span className="font-medium text-slate-800 whitespace-nowrap ml-auto text-right">{fmt(num(t.rate))}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">เป็นเงินจีน</span><span className="font-medium text-slate-800 whitespace-nowrap ml-auto text-right">¥{fmt(+num(bd.chinaYuanBought).toFixed(2))}</span></div>
              {num(bd.shortfallRmb) > 0 && <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">หัก ยอดคงเหลือจีน</span><span className="text-orange-600 whitespace-nowrap ml-auto text-right">¥{fmt(+num(bd.shortfallRmb).toFixed(2))}</span></div>}
              <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">รวมยอด (บิลจีน)</span><span className="font-bold text-slate-900 whitespace-nowrap ml-auto text-right">¥{fmt(num(t.selectedRmb))}</span></div>
            </>
          ); })()}
          <div className="flex justify-between gap-3"><span className="text-slate-500 flex-shrink-0">เข้าบัญชีจีน (ส่วนต่าง)</span><span className="font-medium text-emerald-700 whitespace-nowrap ml-auto text-right">¥{fmt(+num(t.chinaInRmb).toFixed(2))}</span></div>
          {cn.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">บิลจีน ({cn.length})</div>
              {cn.map((l, i) => {
                const sp = (l.sup ?? {}) as Record<string, unknown>;
                return (
                  <div key={i} className="border-b border-slate-100 py-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-800 mr-2 min-w-0 truncate">{String(l.label || "—")}</span>
                      <span className="font-semibold text-slate-800 flex-shrink-0 ml-auto text-right whitespace-nowrap">¥{fmt(num(l.paid_rmb))}</span>
                    </div>
                    {!!sp.name_en && <div className="text-[11px] text-slate-500">{String(sp.name_en)}</div>}
                    <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                      {!!sp.phone && <div>โทร: {String(sp.phone)}</div>}
                      {!!sp.bank_account_name && <div>ชื่อบัญชี: {String(sp.bank_account_name)}</div>}
                      {!!sp.account_number && <div>เลขบัญชี: {String(sp.account_number)}</div>}
                      {!!sp.bank_name_brief && <div>ธนาคาร: {String(sp.bank_name_brief)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {cw.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">บิล CTW ({cw.length})</div>
              {cw.map((l, i) => (
                <div key={i} className="border-b border-slate-100 py-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700 truncate mr-2">{String(l.label || "—")}</span>
                    <span className="text-slate-800 flex-shrink-0">฿{fmt(num(l.paid_thb))}</span>
                  </div>
                  {!!l.doc_number && <div className="text-[11px] text-slate-500 mt-0.5">เลขที่บิล: {String(l.doc_number)}</div>}
                </div>
              ))}
            </div>
          )}
          {/* สลิป/รูปที่แนบกับการโอน — แตะดูเต็มจอ */}
          {atts.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">สลิป/รูปที่แนบ ({atts.length})</div>
              <div className="grid grid-cols-3 gap-2">
                {atts.map((k) => (
                  isPdf(k) ? (
                    <a key={k} href={r2Url(k)} target="_blank" rel="noreferrer"
                      className="rounded-md border border-slate-200 overflow-hidden bg-slate-50 flex flex-col items-center justify-center h-24 text-slate-600">
                      <span className="text-3xl">📄</span>
                      <span className="text-[10px] truncate w-full px-1 text-center">{k.split("/").pop()}</span>
                    </a>
                  ) : (
                    <button key={k} type="button" onClick={() => setLightbox(r2Url(k))}
                      className="block rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2Url(k)} alt="" className="w-full h-24 object-cover" />
                    </button>
                  )
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-100 bg-white flex-shrink-0 space-y-2 print:hidden">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={saveImage} disabled={busy} className="h-12 bg-slate-700 text-white rounded-lg font-medium disabled:opacity-50">💾 โหลดรูป</button>
            <button onClick={() => window.print()} className="h-12 border border-slate-300 text-slate-700 rounded-lg font-medium">🖨️ พิมพ์</button>
          </div>
          <button onClick={sendLineImage} disabled={busy} className="w-full h-12 bg-[#06C755] text-white rounded-lg font-medium disabled:opacity-50">{busy ? "กำลังส่ง…" : "📩 ส่งไลน์ (รูป) + สลิป"}</button>
          <button onClick={async () => { setBusy(true); await pushTransferLine(t, toast); setBusy(false); }} disabled={busy}
            className="w-full h-11 border border-[#06C755] text-[#06C755] rounded-lg text-sm font-medium disabled:opacity-50">📩 ส่งไลน์ (ข้อความ)</button>
          {onDelete && (
            <button onClick={onDelete} className="w-full h-11 border border-red-300 text-red-700 bg-red-50 rounded-lg text-sm font-medium hover:bg-red-100">🗑 ลบรายการโอน (คืนยอดบิล)</button>
          )}
        </div>
      </div>
      {lightbox && (
        <Portal><div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white text-2xl leading-none">×</button>
        </div></Portal>
      )}
      {sendState && <SendingOverlay state={sendState} />}
    </div>
    </Portal>
  );
}

// ---------------- ป้าย "พิมพ์แล้ว" ----------------
function PrintedBadge() {
  return <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">🖨️ พิมพ์แล้ว</span>;
}

// ---------------- Popup ยืนยัน (ของกลางเล็กๆ) ----------------
function ConfirmPopup({ title, message, confirmText = "ยืนยัน", tone = "rose", onCancel, onConfirm }: {
  title: string; message?: string; confirmText?: string; tone?: "rose" | "emerald"; onCancel: () => void; onConfirm: () => void;
}) {
  const btn = tone === "emerald" ? "bg-emerald-600" : "bg-orange-600";
  return (
    <div className="fixed inset-0 z-[210] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-xs p-5 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-semibold text-slate-800">{title}</div>
        {message && <div className="mt-1 text-sm text-slate-500">{message}</div>}
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 h-11 border border-slate-200 rounded-lg text-slate-700">ยกเลิก</button>
          <button onClick={onConfirm} className={`flex-1 h-11 ${btn} text-white rounded-lg font-medium`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Overlay "กำลังส่ง/ส่งแล้ว" เข้า LINE (ของกลาง) ----------------
function SendingOverlay({ state }: { state: "sending" | "sent" }) {
  return (
    <Portal><div className="fixed inset-0 z-[320] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl px-8 py-6 text-center shadow-xl cpok-card min-w-[200px]">
        {state === "sending"
          ? <><div className="text-4xl"><span className="cp-spin inline-block">⏳</span></div><div className="mt-3 text-slate-700 font-medium">กำลังส่งเข้า LINE…</div></>
          : <><div className="text-5xl">✅</div><div className="mt-2 text-emerald-700 font-semibold">ส่งเข้า LINE แล้ว</div></>}
      </div>
    </div></Portal>
  );
}

// ---------------- ใบสรุป (report) → บันทึกรูป / ส่ง LINE ----------------
function ReportPopup({ bill, onClose, onPrinted }: {
  bill: Record<string, unknown>; onClose: () => void; onPrinted?: (id: string, at: string) => void;
}) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sup, setSup] = useState<Record<string, unknown> | null>((bill._sup as Record<string, unknown>) ?? null);
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [printedLabel] = useState(() => new Date().toLocaleString("th-TH"));
  const [sendState, setSendState] = useState<"" | "sending" | "sent">("");

  const supplierId = bill.supplier_id ? String(bill.supplier_id) : null;
  useEffect(() => {
    if (sup || !supplierId) return;
    apiFetch(`/api/master-v2/partners/${supplierId}`).then(r => r.json()).then(j => setSup(j.data ?? null)).catch(() => {});
  }, [supplierId, sup]);
  // บังคับโหลดฟอนต์ที่ canvas ใช้ให้เสร็จก่อนวาด (กัน iOS วัดความกว้าง ฿/ตัวไทยเพี้ยน → วางตำแหน่งผิด/ตัดขอบ)
  useEffect(() => {
    const f = (document as Document & { fonts?: FontFaceSet & { load?: (s: string) => Promise<unknown>; ready?: Promise<unknown> } }).fonts;
    if (!f) { setFontsReady(true); return; }
    const fams = ["'Noto Sans Thai'", "'Sarabun'"];
    const specs = fams.flatMap((fam) => [`20px ${fam}`, `bold 23px ${fam}`, `bold 34px ${fam}`]);
    Promise.all([...(f.load ? specs.map((s) => f.load!(s).catch(() => {})) : []), f.ready].filter(Boolean))
      .then(() => setFontsReady(true)).catch(() => setFontsReady(true));
  }, []);

  const amount = num(bill.amount_rmb), fee = num(bill.fee_rmb), totalRmb = amount + fee, rate = num(bill.rate);
  const thb = totalRmb * rate;
  const thbBill = isThbBill(bill), thbAmt = num(bill.amount_thb);
  const st = String(bill.status ?? "—");
  const supName = thbBill ? billTypeLabel(bill) : String(bill.supplier_label ?? sup?.name_th ?? bill.supplier_id ?? "—");

  // วาดใบสรุปลง canvas
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    type Line = { l: string; r: string; bold?: boolean; color?: string; big?: boolean; sep?: boolean };
    const lines: Line[] = thbBill ? [
      // บิลค่าส่ง / VAT — ยอดบาทตรง ไม่มีร้าน/เรท
      { l: "ประเภท", r: supName, bold: true },
      { l: "", r: "", sep: true },
      { l: "ยอดโอนรวม", r: "฿" + fmt(thbAmt), bold: true, color: "#e11d48" },
      { l: "", r: "", sep: true },
      { l: "วันที่โอน", r: String(bill.transfer_date ?? "—") },
      { l: "วันที่ลงบิล", r: String(bill.bill_date ?? "—") },
      { l: "สถานะ", r: String(bill.status ?? "—") },
      ...(bill.note ? [{ l: "หมายเหตุ", r: String(bill.note) } as Line] : []),
    ] : [
      { l: "ร้านค้า", r: supName, bold: true },
      ...(sup?.name_en ? [{ l: "", r: String(sup.name_en) } as Line] : []),
      { l: "ธนาคาร", r: sup?.bank_name_brief ? String(sup.bank_name_brief) : "—" },
      { l: "เลขบัญชี", r: sup?.account_number ? String(sup.account_number) : "—" },
      { l: "ชื่อบัญชี", r: sup?.bank_account_name ? String(sup.bank_account_name) : "—" },
      { l: "", r: "", sep: true },
      { l: "ยอด (¥)", r: fmt(amount) },
      { l: "ค่าโอน (¥)", r: fmt(fee) },
      { l: "ยอดโอนรวม", r: "¥" + fmt(totalRmb), bold: true },
      { l: "เรท", r: rate ? fmt(rate) : "—" },
      { l: "เป็นเงินบาท", r: rate > 0 ? "฿" + fmt(thb) : "รอเรทเงิน", bold: true, color: rate > 0 ? "#e11d48" : "#d97706" },
      { l: "", r: "", sep: true },
      { l: "วันที่โอน", r: String(bill.transfer_date ?? "—") },
      { l: "วันที่ลงบิล", r: String(bill.bill_date ?? "—") },
      { l: "สถานะ", r: String(bill.status ?? "—") },
      ...(bill.note ? [{ l: "หมายเหตุ", r: String(bill.note) } as Line] : []),
    ];
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = 680, headerH = 120, rowH = 56, padX = 40, padTop = 30, padBottom = 40;
    const H = headerH + padTop + lines.length * rowH + padBottom;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = "100%"; cv.style.height = "auto";
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.scale(DPR, DPR);
    const FONT = "'Noto Sans Thai', 'Sarabun', -apple-system, 'Segoe UI', sans-serif";
    const LABEL_SIZE = 20, VAL_SIZE = 23, BIG_SIZE = 32;

    // พื้นหลัง
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    // header gradient
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#e11d48"); grad.addColorStop(1, "#f97316");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = `bold 34px ${FONT}`; ctx.fillText("💸 ใบสรุปการโอนเงินจีน", padX, 50);
    ctx.font = `18px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(`พิมพ์เมื่อ ${printedLabel}`, padX, 90);

    // วาดค่าแบบย่อฟอนต์อัตโนมัติให้พอดี (กันข้อความยาวล้นขอบ)
    const padR = 64;   // ขอบขวากว้างพิเศษ กันค่าชนขอบ/โดนตัดเวลาเปิดดูในแอปแชต
    const drawValueFit = (text: string, baseSize: number, bold: boolean, color: string, yy: number, leftBound: number) => {
      const maxW = (W - padR) - leftBound;
      let size = baseSize;
      // วัดความกว้างแล้ววาดชิดซ้าย (textAlign:"right" เพี้ยนบน iOS → ค่า ฿ ถูกดันเลยขอบ)
      ctx.fillStyle = color; ctx.textAlign = "left";
      do { ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`; if (ctx.measureText(text).width <= maxW) break; size -= 1; } while (size > 9);
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, (W - padR) - tw, yy);
    };

    // body
    let y = headerH + padTop + rowH / 2;
    for (const ln of lines) {
      if (ln.sep) {
        ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
        y += rowH; continue;
      }
      // label
      ctx.textAlign = "left"; ctx.fillStyle = "#64748b"; ctx.font = `${LABEL_SIZE}px ${FONT}`;
      const labelW = ln.l ? ctx.measureText(ln.l).width : 0;
      if (ln.l) ctx.fillText(ln.l, padX, y);
      // value (ย่อให้พอดี โดยเว้นพื้นที่ label + ช่องว่าง 16)
      drawValueFit(ln.r, ln.big ? BIG_SIZE : VAL_SIZE, !!ln.bold, ln.color ?? "#1e293b", y, padX + labelW + 16);
      y += rowH;
    }
  }, [sup, supName, amount, fee, totalRmb, rate, thb, bill, printedLabel, fontsReady]);

  const filename = `china-bill-${supName}-${String(bill.transfer_date ?? today())}.png`.replace(/[\\/:*?"<>|]/g, "_");

  const markPrinted = async () => {
    const at = new Date().toISOString();
    try {
      await apiFetch(`/api/master-v2/china-bills/${String(bill.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printed_at: at, actor: "china-app" }),
      });
      onPrinted?.(String(bill.id), at);
    } catch { /* best-effort */ }
  };

  const getBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => { const cv = canvasRef.current; if (!cv) return resolve(null); cv.toBlob(resolve, "image/png"); });

  const saveImage = async () => {
    setBusy(true);
    try {
      const blob = await getBlob(); if (!blob) { toast.error("สร้างรูปไม่สำเร็จ"); return; }
      await downloadOrSaveImage(blob, filename);
      toast.success("บันทึกรูปแล้ว"); await markPrinted();
    } catch (e) { if ((e as Error).name !== "AbortError") toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const shareImage = async () => {
    setBusy(true);
    try {
      const blob = await getBlob(); if (!blob) { toast.error("สร้างรูปไม่สำเร็จ"); return; }
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "ใบสรุปการโอนเงินจีน", text: `${supName} · ฿${fmt(thb)}` });
        await markPrinted();
      } else {
        toast.error("อุปกรณ์นี้แชร์รูปไม่ได้ — ใช้ปุ่มบันทึกรูปแทน"); await saveImage();
      }
    } catch (e) {
      // ผู้ใช้กดยกเลิกแชร์ ไม่ต้องแจ้ง error
      if ((e as Error).name !== "AbortError") toast.error(String((e as Error).message ?? e));
    } finally { setBusy(false); }
  };

  // ส่งใบสรุป "เป็นรูป" เข้า LINE กลุ่ม (อัปโหลด R2 public → push image) + ข้อความ + ลิงก์เปิดบิล
  const sendLineImage = async () => {
    setBusy(true); setSendState("sending");
    try {
      const cv = canvasRef.current; if (!cv) { toast.error("สร้างรูปไม่สำเร็จ"); setSendState(""); return; }
      const dataUrl = cv.toDataURL("image/png");
      const cfg: Record<string, string> = await apiFetch("/api/master-v2/china-app-settings?limit=20").then(r => r.json())
        .then(j => ((j.data ?? []).find((x: Record<string, unknown>) => x.skey === "line_config")?.sval ?? {}))
        .catch(() => ({}));
      const link = `${window.location.origin}/app/china-pay?bill=${String(bill.id)}`;
      const text = `🧾 ใบสรุปบิลจีน\nร้าน: ${supName}\nยอดโอนรวม: ¥${fmt(totalRmb)}${rate ? ` (฿${fmt(thb)})` : ""}\nเลขบัญชี: ${String(sup?.account_number ?? "—")}`;
      const base = String(cfg.share_base ?? "").replace(/\/$/, "");
      // อัปโหลด dataURL/key → bucket public → คืน URL
      const toPublic = async (dataUrl: string, name: string) => {
        const up = await apiFetch("/api/china-pay/share-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl, name }) }).then(r => r.json()).catch(() => ({}));
        return up.key ? `${base}/${up.key}` : "";
      };
      const keyToDataUrl = async (key: string) => {
        try { const r = await apiFetch(`/api/r2-image?key=${encodeURIComponent(key)}`); const blob = await r.blob();
          return await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(""); fr.readAsDataURL(blob); });
        } catch { return ""; }
      };
      let imageUrl = "", slipUrls: string[] = [];
      if (base) {
        imageUrl = await toPublic(dataUrl, `bill-${supName}`);
        // แนบสลิป/รูปที่แนบในบิล (เฉพาะรูป ไม่เอา PDF) สูงสุด 3 ใบ
        const atts = Array.isArray(bill.attachments) ? (bill.attachments as unknown[]).map(String) : [];
        const imgs = atts.filter(k => !k.toLowerCase().endsWith(".pdf")).slice(0, 3);
        for (const k of imgs) { const du = await keyToDataUrl(k); if (du) { const u = await toPublic(du, "slip"); if (u) slipUrls.push(u); } }
      }
      const res = await apiFetch("/api/china-pay/line-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, imageUrl, imageUrls: slipUrls, button: { label: "เปิดใบสรุปบิลจีน", url: link } }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setSendState("sent"); setTimeout(() => setSendState(""), 1600); toast.success(imageUrl ? `ส่งรูปเข้า LINE แล้ว${slipUrls.length ? ` (+สลิป ${slipUrls.length})` : ""}` : "ส่งข้อความเข้า LINE แล้ว (ยังไม่ได้ตั้ง R2 public)"); await markPrinted(); return; }
      setSendState("");
      if (j.needConfig) { toast.error("ยังไม่ได้ตั้งค่า LINE Bot — เปิดให้เลือกกลุ่มเอง"); window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank"); }
      else toast.error(j.error ?? "ส่ง LINE ไม่ได้");
    } catch (e) { setSendState(""); toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[210] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="font-semibold text-slate-800">ใบสรุป</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-lg leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {/* พรีวิว (HTML — responsive ไม่ถูกตัดบนมือถือ) */}
          <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white px-4 py-3">
              <div className="font-bold text-base">💸 ใบสรุปการโอนเงินจีน</div>
              <div className="text-[11px] opacity-90 mt-0.5">พิมพ์เมื่อ {printedLabel}</div>
            </div>
            <div className="p-4 text-sm space-y-2">
              <SlipRow l="ร้านค้า" r={supName} bold />
              {sup?.name_en ? <SlipRow l="" r={String(sup.name_en)} /> : null}
              <SlipRow l="ธนาคาร" r={sup?.bank_name_brief} />
              <SlipRow l="เลขบัญชี" r={sup?.account_number} />
              <SlipRow l="ชื่อบัญชี" r={sup?.bank_account_name} />
              <div className="border-t border-slate-100 my-1" />
              <SlipRow l="ยอด (¥)" r={fmt(amount)} />
              <SlipRow l="ค่าโอน (¥)" r={fmt(fee)} />
              <SlipRow l="ยอดโอนรวม" r={"¥" + fmt(totalRmb)} bold />
              <SlipRow l="เรท" r={rate ? fmt(rate) : "—"} />
              <div className="flex justify-between items-center gap-3">
                <span className="text-slate-500 flex-shrink-0">เป็นเงินบาท</span>
                {rate > 0
                  ? <span className="text-xl font-bold text-orange-600 text-right ml-auto whitespace-nowrap">฿{fmt(thb)}</span>
                  : <span className="text-base font-bold text-amber-600 text-right flex-shrink-0">รอเรทเงิน</span>}
              </div>
              <div className="border-t border-slate-100 my-1" />
              <SlipRow l="วันที่โอน" r={bill.transfer_date} />
              <SlipRow l="วันที่ลงบิล" r={bill.bill_date} />
              <SlipRow l="สถานะ" r={st} />
              {!!bill.note && <SlipRow l="หมายเหตุ" r={String(bill.note)} />}
            </div>
          </div>
          {/* canvas ซ่อน — ใช้สร้างรูปตอนบันทึก/แชร์เท่านั้น */}
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-2 text-center text-[11px] text-slate-400">เมื่อบันทึก/แชร์ ระบบจะทำเครื่องหมาย “พิมพ์แล้ว” ให้</div>
        </div>
        <div className="px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-100 flex-shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={saveImage} disabled={busy} className="h-12 border border-slate-300 text-slate-700 rounded-xl font-medium disabled:opacity-50">💾 บันทึกรูป</button>
            <button onClick={shareImage} disabled={busy} className="h-12 bg-orange-600 text-white rounded-xl font-medium disabled:opacity-50">📤 แชร์</button>
          </div>
          <button onClick={sendLineImage} disabled={busy} className="w-full h-12 bg-[#06C755] text-white rounded-xl font-medium disabled:opacity-50">📩 ส่งเข้า LINE กลุ่ม (รูป)</button>
        </div>
      </div>
      {sendState && <SendingOverlay state={sendState} />}
    </div>
    </Portal>
  );
}

// ---------------- กฎอัตโนมัติ (สรุปบิลค้าง ส่ง LINE ทุกวันที่ 26 + ส่งทดสอบ/พรีวิว) ----------------
const SUMMARY_FN_URL = "https://cyivhkecxeoonlowcvaz.supabase.co/functions/v1/china-monthly-summary";
const SUMMARY_FN_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5aXZoa2VjeGVvb25sb3djdmF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NzIwOTAsImV4cCI6MjA5MzA0ODA5MH0.5tAnCX7v41dvAsbjJ9oKm8cvLiJB6dgEbdaGL1v1CMg";

function AutomationPage() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const hdr = { "Content-Type": "application/json", apikey: SUMMARY_FN_KEY, Authorization: `Bearer ${SUMMARY_FN_KEY}` };
  const load = useCallback(() => {
    setLoading(true);
    fetch(`${SUMMARY_FN_URL}?preview=1`, { method: "POST", headers: hdr, body: JSON.stringify({ preview: true }) })
      .then(r => r.json()).then(j => { setText(String(j.text ?? "")); setCount(typeof j.count === "number" ? j.count : null); })
      .catch(() => setText("โหลดตัวอย่างข้อความไม่สำเร็จ")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const sendNow = async () => {
    setSending(true);
    try {
      const r = await fetch(SUMMARY_FN_URL, { method: "POST", headers: hdr, body: JSON.stringify({}) });
      const j = await r.json().catch(() => ({}));
      if (j.sent) toast.success("ส่งสรุปเข้า LINE กลุ่มแล้ว");
      else toast.error(j.error ?? "ส่งไม่ได้ — ตรวจการตั้งค่า LINE");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="text-3xl">🤖</div>
          <div>
            <div className="font-semibold text-slate-800">สรุปบิลค้างโอน → LINE อัตโนมัติ</div>
            <div className="text-sm text-slate-500 mt-0.5">ระบบจะส่งสรุปบิลที่ยัง “รอโอน” เข้า LINE กลุ่ม</div>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm space-y-1">
          <Row label="ทำงานทุก" v="วันที่ 26 ของเดือน" />
          <Row label="เวลา" v="09:00 น." />
          <Row label="สถานะ" v="✅ เปิดใช้งาน" />
        </div>
        <div className="mt-2 text-[11px] text-slate-400">* ทำงานบนเซิร์ฟเวอร์อัตโนมัติ ไม่ต้องเปิดแอปค้างไว้</div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <Label>ตัวอย่างข้อความที่จะส่ง {count != null ? `(${count} บิล)` : ""}</Label>
          <button onClick={load} disabled={loading} className="text-xs text-blue-500 disabled:opacity-50">↻ รีเฟรช</button>
        </div>
        {loading
          ? <div className="text-center text-slate-400 py-6 text-sm">กำลังโหลด…</div>
          : <pre className="whitespace-pre-wrap break-words text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 font-sans">{text || "— ไม่มีข้อมูล —"}</pre>}
        <button onClick={sendNow} disabled={sending || loading}
          className="mt-3 w-full h-12 bg-[#06C755] text-white rounded-xl font-semibold disabled:opacity-50">{sending ? "กำลังส่ง…" : "📩 ส่งทดสอบตอนนี้"}</button>
        <div className="mt-1 text-[11px] text-slate-400 text-center">ส่งสรุปชุดนี้เข้า LINE กลุ่มทันที (ใช้ทดสอบ)</div>
      </Card>
    </div>
  );
}

// ---------------- ชิ้นเล็ก ----------------
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm shadow-slate-200/60">{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-slate-500 mb-1">{children}</div>;
}
function Num({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="number" inputMode="decimal" step="any" value={value} placeholder={placeholder}
    onChange={e => onChange(e.target.value)} className="w-full h-11 px-3 text-base text-right border border-slate-200 rounded-lg" />;
}
// ช่องจำนวนเงิน — โชว์ลูกน้ำคั่นหลักพัน (เก็บค่าจริงไม่มีลูกน้ำ)
function Money({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const display = (() => {
    const s = String(value ?? "");
    if (s === "" || !/[0-9]/.test(s)) return s;
    const [i, ...d] = s.split(".");
    const intf = (i || "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return d.length ? `${intf}.${d.join("")}` : (s.endsWith(".") ? `${intf}.` : intf);
  })();
  const handle = (raw: string) => {
    let cleaned = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
    const p = cleaned.split(".");
    if (p.length > 2) cleaned = p[0] + "." + p.slice(1).join("");
    onChange(cleaned);
  };
  return <input type="text" inputMode="decimal" value={display} placeholder={placeholder}
    onChange={e => handle(e.target.value)} onFocus={e => e.currentTarget.select()}
    className={className ?? "w-full h-11 px-3 text-base text-right border border-slate-200 rounded-lg"} />;
}
function Row({ label, v }: { label: string; v: unknown }) {
  if (v == null || v === "") return null;
  return <div className="flex justify-between gap-3"><span className="text-slate-400 flex-shrink-0">{label}</span><span className="text-slate-700 text-right ml-auto break-words">{String(v)}</span></div>;
}
function SlipRow({ l, r, bold }: { l: string; r: unknown; bold?: boolean }) {
  if (r == null || r === "") return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500 flex-shrink-0">{l}</span>
      <span className={`text-right ml-auto break-words ${bold ? "font-bold text-slate-900" : "text-slate-800"}`}>{String(r)}</span>
    </div>
  );
}
