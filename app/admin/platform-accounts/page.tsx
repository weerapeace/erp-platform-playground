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

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string; color: string | null };
type Account = { label: string | null; external_shop_id: string | null; is_active: boolean };
type Msg = { text: string; bad?: boolean } | null;

// แพลตฟอร์มที่ระบบเชื่อมบัญชีได้จริง (OAuth / API Key) — ขึ้นกลุ่มบนสุด
const AUTO_CODES = ["facebook", "instagram", "lazada", "line_shopping"];

// ลิงก์หน้าร้านจากค่าที่กรอก — รองรับทั้ง "ลิงก์เต็ม" และ "@handle/ชื่อร้าน"
// คืน null ถ้าเดาไม่ได้ (จะไม่โชว์ปุ่มเปิดลิงก์ ดีกว่าพาไปหน้าผิด)
const SHOP_URL: Record<string, (h: string) => string> = {
  line_shopping: (h) => `https://shop.line.me/@${h}`,
  line: (h) => `https://shop.line.me/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  pinterest: (h) => `https://www.pinterest.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  twitter: (h) => `https://x.com/${h}`,
  shopee: (h) => `https://shopee.co.th/${h}`,
  lazada: (h) => `https://www.lazada.co.th/shop/${h}`,
};
function shopUrlOf(code: string, raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;                    // กรอกลิงก์เต็มมาแล้ว
  const handle = v.replace(/^@/, "").trim();                // ตัด @ นำหน้า (แต่ละเจ้าเติมเองตามรูปแบบ)
  if (!handle) return null;
  const make = SHOP_URL[(code || "").toLowerCase()];
  return make ? make(handle) : null;
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
  const [showGuide, setShowGuide] = useState(false);   // คู่มือขอ API Key ของ LINE SHOPPING
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);
  const [editPlat, setEditPlat] = useState<string | null>(null);   // แพลตฟอร์มที่กำลังแก้ (ชื่อร้าน/Shop ID) — กันเผลอพิมพ์
  const [editKey, setEditKey] = useState<string | null>(null);      // แพลตฟอร์มที่กำลังแก้ API Key (มีคีย์แล้ว = อ่านอย่างเดียวจนกดแก้)
  const [clearKeyFor, setClearKeyFor] = useState<string | null>(null);  // แพลตฟอร์มที่กำลังยืนยัน "ล้างคีย์"
  const [confirmDisc, setConfirmDisc] = useState<"facebook" | "lazada" | null>(null);   // ยืนยันตัดการเชื่อมต่อ
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
  type LazStatus = { connected: boolean; health?: "none" | "connected" | "expiring" | "expired"; days_left?: number | null; seller_id: string | null; short_code: string | null; country: string | null; configured: boolean };
  const [laz, setLaz] = useState<LazStatus>({ connected: false, seller_id: null, short_code: null, country: null, configured: true });
  const [lazSyncing, setLazSyncing] = useState(false);
  const brandChosen = useRef(false);   // มีการเลือกแบรนด์แล้ว (จาก query/ผู้ใช้) — กัน auto-select ทับ
  const say = (text: string, bad = false) => setMsg({ text, bad });
  const flash = (text: string) => { setMsg({ text }); setTimeout(() => setMsg(null), 1800); };

  const load = useCallback(async (bid: string) => {
    setLoading(true);
    try {
      const [j, kj, mj, lj] = await Promise.all([
        apiFetch(`/api/platform-accounts${bid ? `?brand_id=${encodeURIComponent(bid)}` : ""}`).then((r) => r.json()),
        bid ? apiFetch(`/api/platform-credentials?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve({ keys: {} }),
        bid ? apiFetch(`/api/meta/status?brand_id=${encodeURIComponent(bid)}&check=1`).then((r) => r.json()) : Promise.resolve(null),   // check=1 = ลองกับ Meta จริงว่ายังใช้ได้
        bid ? apiFetch(`/api/lazada/status?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve(null),
      ]);
      setPlatforms((j.platforms ?? []) as Platform[]);
      setBrands((j.brands ?? []) as Brand[]);
      setAccounts((j.accounts ?? {}) as Record<string, Account>);
      setKeys((kj.keys ?? {}) as Record<string, boolean>);
      if (mj) { setFb((mj.facebook ?? { connected: false, stage: "none", page_name: null, pages: [] }) as FbStatus); setFbHasIg(!!mj.instagram?.connected); setMetaCfg(mj.configured !== false); setPickPage(""); }
      if (lj) setLaz(lj as LazStatus);
      setTestMsg(null);
      if (!bid && !brandChosen.current && j.brands?.[0]) setBrandId(j.brands[0].id);
    } catch (e) { say((e as Error).message, true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(""); }, [load]);
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
    if (brand) { brandChosen.current = true; setBrandId(brand); }
    if (err) say(err, true);
    else if (ok) say("เชื่อมต่อ Facebook สำเร็จ");
    else if (pick) say("มีหลายเพจ — เลือกเพจที่จะใช้โพสต์");
    else if (lazErr) say(lazErr, true);
    else if (lazOk) say("เชื่อมต่อ Lazada สำเร็จ");
    if (err || ok || pick) wantCode.current = "facebook";
    if (lazErr || lazOk) wantCode.current = "lazada";
    if (err || ok || pick || brand || lazErr || lazOk) window.history.replaceState({}, "", window.location.pathname);
  }, []);
  // เลือกแพลตฟอร์มแรก (หรือที่เพิ่งเชื่อมกลับมา) เมื่อโหลดรายการแล้ว
  useEffect(() => {
    if (!platforms.length) return;
    const want = wantCode.current ? platforms.find((p) => p.code === wantCode.current) : null;
    if (want) { setSel(want.id); setMobileDetail(true); wantCode.current = null; return; }
    if (!sel || !platforms.some((p) => p.id === sel)) setSel((platforms.find((p) => p.code === AUTO_CODES[0]) ?? platforms[0]).id);
  }, [platforms, sel]);

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
      if (!laz.configured) return <Note>ยังไม่ได้ตั้ง LAZADA_APP_KEY / LAZADA_APP_SECRET ในโฮสต์ (Vercel)</Note>;
      if (laz.connected) return (
        <div className="space-y-3">
          <StatusBar tone={laz.health === "expiring" ? "warn" : "ok"} actions={canManage && <><button onClick={connectLaz} className="text-xs text-slate-600 hover:underline">เชื่อมใหม่</button><button onClick={() => setConfirmDisc("lazada")} className={LINK_DANGER}>ตัดการเชื่อมต่อ</button></>}>
            ร้าน <b className="font-medium text-slate-900">{laz.short_code || laz.seller_id}</b>{laz.country ? ` (${laz.country})` : ""}
            {laz.health === "expiring" && <span className="text-amber-700"> · อีก {laz.days_left ?? 0} วันต้องกดเชื่อมใหม่ (Lazada ให้สิทธิ์ทีละ ~30 วัน)</span>}
          </StatusBar>
          {canManage && <button onClick={syncLazOrders} disabled={lazSyncing} className={BTN_LINE}><Icon name="download" />{lazSyncing ? "กำลังดึง..." : "ดึงออเดอร์ 30 วันล่าสุด"}</button>}
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
                <button onClick={() => setShowGuide(true)} className="text-xs text-slate-600 hover:underline inline-flex items-center gap-1"><Icon name="guide" />วิธีขอ API Key</button>
              </div>
              {testMsg && <p className={`text-xs ${testMsg.bad ? "text-rose-600" : "text-slate-600"}`}>{testMsg.text}</p>}
            </>
          )}
        </div>
      );
    }
    return null;
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
                {b.name}
              </button>
            );
          })}
        </div>
        <select value={brandId} onChange={(e) => { brandChosen.current = true; setBrandId(e.target.value); }} className="sm:hidden h-10 w-full border border-slate-200 rounded-lg px-3 text-sm bg-white">
          {brands.length === 0 && <option value="">—</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
            const editing = editPlat === cur.id; const conn = connectionOf(cur);
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
                    </p>
                  </div>
                  <ToggleSwitch on={acc.is_active} onChange={(v) => void save(cur.id, { is_active: v })} disabled={!canManage} label={<span className="hidden sm:inline text-xs text-slate-500">เปิดใช้งาน</span>} title="เปิดใช้ร้านนี้" />
                </div>

                <div className="px-4 sm:px-6 py-6 space-y-8">
                  <Section title="ร้าน" desc="ใช้ตอนลงขายและทำลิงก์สินค้าตามแบรนด์ของสินค้า">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">ชื่อร้าน</span>
                        <ERPInput value={acc.label ?? ""} disabled={!canManage || !editing} placeholder="เช่น Shopee – แบรนด์ A" onChange={(e) => setAccounts((a) => ({ ...a, [cur.id]: { ...acc, label: e.target.value } }))} />
                      </label>
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">Shop ID / ลิงก์ร้าน</span>
                        <ERPInput value={acc.external_shop_id ?? ""} disabled={!canManage || !editing} placeholder="เช่น @louismontini" title="ใช้สร้างลิงก์สินค้าบนร้าน เช่น LINE: https://shop.line.me/@Shop ID/product/..." onChange={(e) => setAccounts((a) => ({ ...a, [cur.id]: { ...acc, external_shop_id: e.target.value } }))} />
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

                  {conn && (
                    <Section title={cur.code === "line_shopping" ? "API Key" : "การเชื่อมต่อ"}
                      desc={cur.code === "facebook" || cur.code === "instagram" ? "ให้ระบบโพสต์คอนเทนต์ขึ้นเพจให้อัตโนมัติ" : cur.code === "lazada" ? "ดึงออเดอร์และสินค้าเข้าระบบอัตโนมัติ" : "เชื่อมร้านกับระบบผ่าน Open API ของ LINE SHOPPING"}>
                      {conn}
                    </Section>
                  )}
                </div>
              </>
            );
          })()}
        </section>
      </div>

      {/* คู่มือขอ API Key LINE SHOPPING */}
      <ERPModal open={showGuide} onClose={() => setShowGuide(false)} size="md" title="วิธีขอ API Key จาก LINE SHOPPING"
        footer={<a href="https://oaplus.line.biz" target="_blank" rel="noopener noreferrer" className={BTN_DARK}>เปิด oaplus.line.biz<Icon name="open" /></a>}>
        <div className="space-y-4 text-sm text-slate-700">
          <p className="text-slate-500">ทำครั้งเดียวต่อร้าน — คัดลอกคีย์มาวางในช่อง “API Key” แล้วกดบันทึก + ทดสอบการเชื่อมต่อ</p>
          <ol className="space-y-2.5">
            {[
              <>เข้า <a href="https://oaplus.line.biz" target="_blank" rel="noopener noreferrer" className="underline">oaplus.line.biz</a> แล้ว <b>ล็อกอิน</b> ด้วยบัญชี LINE ที่เป็นเจ้าของร้าน (ต้องเป็น<b>แอดมินร้าน</b>)</>,
              <>เลือก <b>ร้าน/บัญชี (Channel)</b> ที่ต้องการ → เข้าเมนู <b>“อีคอมเมิร์ซ” (E-Commerce)</b></>,
              <>ไปที่ <b>“ตั้งค่าร้านค้า” (Shop settings)</b> → เลือกหัวข้อ <b>“Open API”</b></>,
              <>เข้าเมนู <b>“จัดการ API Keys” (Manage API Keys)</b></>,
              <>กด <b>+ Generate</b> → ตั้งชื่อกำกับ (เช่น <span className="font-mono text-xs bg-slate-100 px-1 rounded">ERP</span>) → กด <b>Generate</b></>,
              <><b>คัดลอกคีย์</b>ที่ได้ → กลับมาวางในช่อง “API Key” ที่นี่ → <b>บันทึกคีย์</b> → <b>ทดสอบการเชื่อมต่อ</b></>,
            ].map((li, i) => (
              <li key={i} className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] flex items-center justify-center">{i + 1}</span><span>{li}</span></li>
            ))}
          </ol>
          <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[13px] text-slate-500">
            <p className="font-medium text-slate-600">ข้อควรระวัง</p>
            <p>• คีย์จะโชว์ให้ <b>คัดลอกทันทีที่สร้าง</b> — ถ้าไม่ได้ก๊อป ต้องสร้างใหม่</p>
            <p>• สร้างได้สูงสุด <b>10 คีย์</b> ต่อร้าน · ถ้าไม่เจอเมนู Open API อาจต้องเปิดใช้ MyShop/แพ็กเกจร้านก่อน</p>
            <p>• ระบบเก็บคีย์แบบ<b>เข้ารหัส</b> — ไม่มีใครเห็นค่าคีย์อีก</p>
          </div>
        </div>
      </ERPModal>

      {/* ยืนยันก่อนล้าง API Key (ลบแล้วต้องไปขอ/คัดลอกมาใหม่) */}
      <ConfirmDialog open={!!clearKeyFor} onClose={() => setClearKeyFor(null)} variant="danger" title="ล้าง API Key?" confirmText="ล้างคีย์"
        message={`คีย์ของ ${platforms.find((x) => x.id === clearKeyFor)?.name_th ?? ""} จะถูกลบออกจากระบบ — การเชื่อมต่อจะหยุดทำงาน และต้องไปคัดลอกคีย์มาใส่ใหม่เอง`}
        onConfirm={() => { const id = clearKeyFor; setClearKeyFor(null); setEditKey(null); if (id) void saveKey(id, ""); }} />

      {/* ยืนยันก่อนตัดการเชื่อมต่อ Facebook / Lazada */}
      <ConfirmDialog open={!!confirmDisc} onClose={() => setConfirmDisc(null)} variant="danger"
        title={confirmDisc === "lazada" ? "ตัดการเชื่อมต่อ Lazada?" : "ตัดการเชื่อมต่อ Facebook?"} confirmText="ตัดการเชื่อมต่อ"
        message={confirmDisc === "lazada"
          ? `${brand?.name ?? "แบรนด์นี้"} จะหยุดดึงออเดอร์จาก Lazada จนกว่าจะเชื่อมใหม่`
          : `${brand?.name ?? "แบรนด์นี้"} จะโพสต์ Facebook/Instagram อัตโนมัติไม่ได้ (คิวโพสต์ที่รออยู่จะล้ม) จนกว่าจะเชื่อมใหม่`}
        onConfirm={() => { const d = confirmDisc; setConfirmDisc(null); if (d === "lazada") void disconnectLaz(); else void disconnectFb(); }} />
    </div>
    </AppAccessGate>
  );
}
