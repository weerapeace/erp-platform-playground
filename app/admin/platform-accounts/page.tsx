"use client";

// จัดการร้าน/บัญชีแพลตฟอร์ม ต่อแบรนด์ (เฟส 2) — แต่ละแบรนด์มีร้านของตัวเองต่อแพลตฟอร์ม
// ตั้งชื่อร้าน + shop id + เปิด/ปิด · ใช้ตอน publish เพื่อเลือกร้านตามแบรนด์ของสินค้า

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPInput } from "@/components/form";
import { useAuth } from "@/components/auth";
import { AppAccessGate } from "@/components/app-access-gate";
import { PlatformIcon } from "@/components/platform-icon";

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string; color: string | null };
type Account = { label: string | null; external_shop_id: string | null; is_active: boolean };

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
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);   // คู่มือขอ API Key ของ LINE SHOPPING
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [editPlat, setEditPlat] = useState<string | null>(null);   // แพลตฟอร์มที่กำลังแก้ (ชื่อร้าน/Shop ID) — กันเผลอพิมพ์
  const [editKey, setEditKey] = useState<string | null>(null);      // แพลตฟอร์มที่กำลังแก้ API Key (มีคีย์แล้ว = อ่านอย่างเดียวจนกดแก้)
  const [clearKeyFor, setClearKeyFor] = useState<string | null>(null);  // แพลตฟอร์มที่กำลังยืนยัน "ล้างคีย์"
  // สถานะเชื่อมต่อ Facebook (Meta) ต่อแบรนด์
  type FbStatus = { connected: boolean; stage: string; page_name: string | null; pages: { id: string; name: string; ig: boolean }[] };
  const [fb, setFb] = useState<FbStatus>({ connected: false, stage: "none", page_name: null, pages: [] });
  const [fbHasIg, setFbHasIg] = useState(false);
  const [metaCfg, setMetaCfg] = useState(true);   // ตั้งค่า META_APP_ID/SECRET ในโฮสต์แล้วไหม
  const [pickPage, setPickPage] = useState("");   // เพจที่เลือก (กรณีมีหลายเพจ)
  // สถานะเชื่อมต่อ Lazada ต่อแบรนด์
  type LazStatus = { connected: boolean; seller_id: string | null; short_code: string | null; country: string | null; configured: boolean };
  const [laz, setLaz] = useState<LazStatus>({ connected: false, seller_id: null, short_code: null, country: null, configured: true });
  const [lazSyncing, setLazSyncing] = useState(false);
  const brandChosen = useRef(false);   // มีการเลือกแบรนด์แล้ว (จาก query/ผู้ใช้) — กัน auto-select ทับ

  const load = useCallback(async (bid: string) => {
    setLoading(true);
    try {
      const [j, kj, mj, lj] = await Promise.all([
        apiFetch(`/api/platform-accounts${bid ? `?brand_id=${encodeURIComponent(bid)}` : ""}`).then((r) => r.json()),
        bid ? apiFetch(`/api/platform-credentials?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve({ keys: {} }),
        bid ? apiFetch(`/api/meta/status?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve(null),
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
    } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); }
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
  // กลับมาจากการเชื่อมต่อ Facebook (OAuth) — อ่านผลจาก query แล้วล้าง URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const err = sp.get("meta_error"), ok = sp.get("meta_connected"), pick = sp.get("meta_pick"), brand = sp.get("brand");
    const lazErr = sp.get("laz_error"), lazOk = sp.get("laz_connected");
    if (brand) { brandChosen.current = true; setBrandId(brand); }
    if (err) setMsg("❌ " + err);
    else if (ok) setMsg("✅ เชื่อมต่อ Facebook สำเร็จ");
    else if (pick) setMsg("มีหลายเพจ — เลือกเพจที่จะใช้โพสต์ด้านล่าง");
    else if (lazErr) setMsg("❌ " + lazErr);
    else if (lazOk) setMsg("✅ เชื่อมต่อ Lazada สำเร็จ");
    if (err || ok || pick || brand || lazErr || lazOk) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const connectFb = async () => {
    if (!brandId) return;
    try {
      const r = await apiFetch(`/api/meta/oauth/start?brand_id=${encodeURIComponent(brandId)}`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.auth_url) window.location.href = j.auth_url as string;
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  const selectFbPage = async () => {
    if (!pickPage) return;
    try {
      const r = await apiFetch("/api/meta/select-page", { method: "POST", body: JSON.stringify({ brand_id: brandId, page_id: pickPage }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMsg("✅ เลือกเพจแล้ว: " + (j.page_name ?? "")); await load(brandId);
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  const disconnectFb = async () => {
    if (!window.confirm("ตัดการเชื่อมต่อ Facebook ของแบรนด์นี้?")) return;
    try {
      const r = await apiFetch("/api/meta/disconnect", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMsg("ตัดการเชื่อมต่อแล้ว"); await load(brandId);
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  // ---- Lazada ----
  const connectLaz = async () => {
    if (!brandId) return;
    try {
      const r = await apiFetch(`/api/lazada/oauth/start?brand_id=${encodeURIComponent(brandId)}`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.auth_url) window.location.href = j.auth_url as string;
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  const disconnectLaz = async () => {
    if (!window.confirm("ตัดการเชื่อมต่อ Lazada ของแบรนด์นี้?")) return;
    try {
      const r = await apiFetch("/api/lazada/disconnect", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMsg("ตัดการเชื่อมต่อแล้ว"); await load(brandId);
    } catch (e) { setMsg("❌ " + (e as Error).message); }
  };
  const syncLazOrders = async () => {
    setLazSyncing(true); setMsg("กำลังดึงออเดอร์จาก Lazada...");
    try {
      const r = await apiFetch("/api/lazada/sync-orders", { method: "POST", body: JSON.stringify({ brand_id: brandId, days: 30 }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMsg(`✅ ดึงออเดอร์เสร็จ: พบ ${j.fetched} · ใหม่ ${j.created} · อัปเดต ${j.updated} · จับคู่สินค้า ${j.matched}`);
    } catch (e) { setMsg("❌ " + (e as Error).message); }
    finally { setLazSyncing(false); }
  };

  const save = async (platform_id: string, patch: Partial<Account>) => {
    setAccounts((a) => { const prev = a[platform_id] ?? { label: null, external_shop_id: null, is_active: true }; return { ...a, [platform_id]: { ...prev, ...patch } }; });
    try {
      const r = await apiFetch("/api/platform-accounts", { method: "PATCH", body: JSON.stringify({ brand_id: brandId, platform_id, ...patch }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMsg("บันทึกแล้ว"); setTimeout(() => setMsg(null), 1500);
    } catch (e) { setMsg((e as Error).message); }
  };

  // บันทึก/ล้าง API Key (ค่าไม่ถูกส่งกลับมาแสดง — เก็บฝั่งเซิร์ฟเวอร์)
  const saveKey = async (platform_id: string, api_key: string) => {
    try {
      const r = await apiFetch("/api/platform-credentials", { method: "PATCH", body: JSON.stringify({ brand_id: brandId, platform_id, api_key }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setKeys((k) => ({ ...k, [platform_id]: !!j.has_key }));
      setKeyDraft((d) => ({ ...d, [platform_id]: "" }));
      setMsg(j.has_key ? "บันทึก API Key แล้ว" : "ล้าง API Key แล้ว"); setTimeout(() => setMsg(null), 1500);
    } catch (e) { setMsg((e as Error).message); }
  };
  const testConn = async () => {
    setTesting(true); setTestMsg("กำลังทดสอบ...");
    try {
      const r = await apiFetch("/api/line-shopping/test", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json();
      setTestMsg(j.ok ? "✅ เชื่อมต่อสำเร็จ! API Key ใช้งานได้" : "❌ " + (j.error ?? "เชื่อมต่อไม่สำเร็จ"));
    } catch (e) { setTestMsg("❌ " + (e as Error).message); }
    finally { setTesting(false); }
  };

  return (
    <AppAccessGate appKey="master">
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">🏪 จัดการร้าน/บัญชีแพลตฟอร์ม</h1>
      <p className="text-sm text-slate-500 mb-4">แต่ละแบรนด์มีร้านของตัวเองในแต่ละแพลตฟอร์ม — ตั้งร้านที่นี่ ระบบจะใช้ตอนลงขายตามแบรนด์ของสินค้า</p>

      {!canManage && <p className="text-sm text-amber-600 mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">คุณไม่มีสิทธิ์แก้ไข (ดูได้อย่างเดียว)</p>}

      {/* แถวเลือกแบรนด์ — ป้ายอยู่บรรทัดบน ปุ่มเรียงเต็มความกว้าง (ไม่ให้ป้ายลอยกลางตอนตัดบรรทัด) */}
      <div className="mb-4">
        <span className="block text-sm text-slate-600 mb-1.5">แบรนด์:</span>
        {/* ปุ่มเลือกแบรนด์พร้อมโลโก้ (จอกว้าง) — เห็นภาพ กดง่ายกว่า dropdown */}
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          {brands.length === 0 && <span className="text-sm text-slate-400">—</span>}
          {brands.map((b) => {
            const on = b.id === brandId;
            const logo = brandLogos[b.id];
            return (
              <button key={b.id} type="button" onClick={() => setBrandId(b.id)} title={b.name}
                className={`h-11 pl-1.5 pr-3 inline-flex items-center gap-2 rounded-xl border transition-colors ${on
                  ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200"
                  : "border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50"}`}>
                {logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/r2-image?key=${encodeURIComponent(logo)}&w=64`} alt="" className="h-8 w-8 rounded-lg object-contain bg-white border border-slate-100 shrink-0" />
                  : <span className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: b.color || "#cbd5e1" }}>{(b.name || "?").slice(0, 1)}</span>}
                <span className={`text-sm ${on ? "font-semibold text-violet-800" : "text-slate-700"}`}>{b.name}</span>
              </button>
            );
          })}
        </div>
        {/* จอแคบ — ใช้ dropdown เหมือนเดิม (ปุ่มเยอะจะล้น) */}
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="sm:hidden h-9 border border-slate-200 rounded-md px-2 text-sm bg-white min-w-[200px]">
          {brands.length === 0 && <option value="">—</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {msg && <span className="block mt-1.5 text-xs text-slate-400">{msg}</span>}
      </div>

      {loading ? <p className="text-slate-400 text-sm py-8 text-center">กำลังโหลด...</p> : (
        <div className="space-y-2">
          {platforms.map((p) => {
            const acc = accounts[p.id] ?? { label: null, external_shop_id: null, is_active: false };
            const hasShop = !!(acc.label || acc.external_shop_id);
            const hasApi = p.code === "line_shopping";   // แพลตฟอร์มที่ต่อ API ได้ (ใส่ API Key + ทดสอบ)
            const isMeta = p.code === "facebook";   // Facebook = เชื่อมต่อแบบ OAuth (กดปุ่มเชื่อม) แล้วยิงโพสต์จริงได้
            const isMetaIg = p.code === "instagram";   // Instagram = ใช้การเชื่อมของเพจ Facebook (สถานะ/ปุ่มอยู่ที่นี่ด้วย)
            const isLaz = p.code === "lazada";   // Lazada = เชื่อมแบบ OAuth ดึงออเดอร์เข้าระบบ
            return (
              <div key={p.id} className={`border rounded-xl p-3 ${acc.is_active && hasShop ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-7 text-center shrink-0"><PlatformIcon code={p.code} iconKey={p.icon_key} size={22} /></span>
                  <span className="text-sm font-medium text-slate-700 w-24 shrink-0">{p.name_th}</span>
                  <ERPInput value={acc.label ?? ""} disabled={!canManage || editPlat !== p.id} placeholder="ชื่อร้าน (เช่น Shopee – แบรนด์ A)" onChange={(e) => setAccounts((a) => ({ ...a, [p.id]: { ...acc, label: e.target.value } }))} />
                  <ERPInput value={acc.external_shop_id ?? ""} disabled={!canManage || editPlat !== p.id} placeholder="Shop ID / ลิงก์ร้าน (เช่น @louismontini — ใช้ทำลิงก์สินค้า)" title="ใช้สร้างลิงก์สินค้าบนร้าน เช่น LINE: https://shop.line.me/@Shop ID/product/..." className="max-w-[360px]" onChange={(e) => setAccounts((a) => ({ ...a, [p.id]: { ...acc, external_shop_id: e.target.value } }))} />
                  {/* เปิดลิงก์ร้าน — โชว์เมื่อกรอกแล้วและไม่ได้กำลังแก้ (ทั้งลิงก์เต็มและ @handle ก็เปิดได้) */}
                  {editPlat !== p.id && shopUrlOf(p.code, acc.external_shop_id) && (
                    <a href={shopUrlOf(p.code, acc.external_shop_id) as string} target="_blank" rel="noopener noreferrer"
                      title={`เปิดร้าน: ${shopUrlOf(p.code, acc.external_shop_id)}`}
                      className="h-8 px-2.5 inline-flex items-center text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 shrink-0">↗ เปิดลิงก์</a>
                  )}
                  <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0"><input type="checkbox" disabled={!canManage} checked={acc.is_active} onChange={(e) => save(p.id, { is_active: e.target.checked })} />เปิด</label>
                  {canManage && (editPlat === p.id ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { void save(p.id, { label: acc.label, external_shop_id: acc.external_shop_id }); setEditPlat(null); }}
                        className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">💾 บันทึก</button>
                      <button onClick={() => { setEditPlat(null); void load(brandId); }}
                        className="h-8 px-2 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                    </span>
                  ) : (
                    <button onClick={() => setEditPlat(p.id)} title="แก้ชื่อร้าน / Shop ID"
                      className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">✎ แก้ไข</button>
                  ))}
                </div>
                {hasApi && canManage && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 shrink-0">🔑 API Key</span>
                    {keys[p.id] && <span className="text-[11px] text-emerald-600 shrink-0">● ตั้งค่าแล้ว</span>}
                    {/* มีคีย์อยู่แล้ว = โชว์แบบอ่านอย่างเดียว (กัน
                        เผลอพิมพ์ทับ) → กด "แก้ไข" ถึงจะพิมพ์ได้ · ยังไม่มีคีย์ = พิมพ์ได้เลย */}
                    {keys[p.id] && editKey !== p.id ? (
                      <>
                        <input readOnly value="••••••••••••" className="h-8 flex-1 min-w-[180px] border border-slate-200 rounded-md px-2 text-sm font-mono bg-slate-50 text-slate-400" />
                        <button onClick={() => { setEditKey(p.id); setKeyDraft((d) => ({ ...d, [p.id]: "" })); }}
                          className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">✎ แก้ไข</button>
                      </>
                    ) : (
                      <>
                        <input type="password" autoComplete="off" value={keyDraft[p.id] ?? ""} placeholder={keys[p.id] ? "ใส่คีย์ใหม่เพื่อเปลี่ยน" : "วาง API Key จาก MyShop"}
                          onChange={(e) => setKeyDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                          className="h-8 flex-1 min-w-[180px] border border-slate-200 rounded-md px-2 text-sm font-mono" />
                        <button onClick={() => { void saveKey(p.id, keyDraft[p.id] ?? ""); setEditKey(null); }} disabled={!(keyDraft[p.id] ?? "").trim()} className="h-8 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40">บันทึกคีย์</button>
                        {keys[p.id] && editKey === p.id && (
                          <button onClick={() => { setEditKey(null); setKeyDraft((d) => ({ ...d, [p.id]: "" })); }}
                            className="h-8 px-2 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
                        )}
                      </>
                    )}
                    {keys[p.id] && <button onClick={() => setClearKeyFor(p.id)} className="h-8 px-2 text-xs text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50">ล้าง</button>}
                    <button onClick={testConn} disabled={testing || !keys[p.id]} title={keys[p.id] ? "" : "ใส่ API Key ก่อน"} className="h-8 px-3 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-40">🔌 ทดสอบเชื่อมต่อ</button>
                    {testMsg && <span className="text-xs text-slate-600">{testMsg}</span>}
                    <button onClick={() => setShowGuide(true)} className="text-[11px] text-violet-600 underline shrink-0">📖 วิธีขอ API Key</button>
                  </div>
                )}
                {isMeta && canManage && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                    {!metaCfg ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">⚠️ ยังไม่ได้ตั้ง META_APP_ID / META_APP_SECRET ในโฮสต์ (Vercel) — ตั้งก่อนจึงจะเชื่อมต่อได้</p>
                    ) : fb.connected ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-emerald-600 shrink-0">● เชื่อมต่อแล้ว</span>
                        <span className="text-sm text-slate-700">เพจ: <b>{fb.page_name}</b></span>
                        {fbHasIg && <span className="text-[11px] text-pink-600 bg-pink-50 border border-pink-200 rounded-full px-2 py-0.5">มี IG ผูก (รอ Meta อนุมัติจึงโพสต์ IG ได้)</span>}
                        <button onClick={connectFb} className="text-[11px] text-violet-600 underline">เชื่อมใหม่/เปลี่ยนเพจ</button>
                        <button onClick={disconnectFb} className="text-[11px] text-rose-500 border border-rose-200 rounded-lg px-2 py-0.5 hover:bg-rose-50">ตัดการเชื่อมต่อ</button>
                      </div>
                    ) : fb.stage === "pending" && fb.pages.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500 shrink-0">เลือกเพจที่จะใช้โพสต์:</span>
                        <select value={pickPage} onChange={(e) => setPickPage(e.target.value)} className="h-8 border border-slate-200 rounded-md px-2 text-sm bg-white min-w-[200px]">
                          <option value="">— เลือกเพจ —</option>
                          {fb.pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}{pg.ig ? " (มี IG)" : ""}</option>)}
                        </select>
                        <button onClick={selectFbPage} disabled={!pickPage} className="h-8 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40">ยืนยันเพจ</button>
                        <button onClick={connectFb} className="text-[11px] text-violet-600 underline">เริ่มใหม่</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={connectFb} disabled={!brandId} className="h-8 px-3 text-sm text-white bg-[#1877F2] rounded-lg hover:opacity-90 disabled:opacity-40">👍 เชื่อมต่อ Facebook</button>
                        <span className="text-[11px] text-slate-400">กดแล้วเข้าสู่ระบบ Facebook + เลือกเพจ → พร้อมยิงโพสต์จริงจากหน้าคอนเทนต์</span>
                      </div>
                    )}
                  </div>
                )}
                {isMetaIg && canManage && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                    {!metaCfg ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">⚠️ ยังไม่ได้ตั้ง META_APP_ID / META_APP_SECRET ในโฮสต์</p>
                    ) : !fb.connected ? (
                      <p className="text-xs text-slate-500">📷 Instagram โพสต์ผ่านเพจ Facebook — ไปกด <b>“เชื่อมต่อ Facebook”</b> ที่แถว Facebook ด้านบนก่อน (ตอนอนุญาตให้เปิดสิทธิ์ Instagram ด้วย)</p>
                    ) : fbHasIg ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-emerald-600 shrink-0">● พร้อมโพสต์ Instagram</span>
                        <span className="text-sm text-slate-700">ผ่านเพจ <b>{fb.page_name}</b></span>
                        <button onClick={connectFb} className="text-[11px] text-violet-600 underline">เชื่อมใหม่</button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs text-amber-600">⚠️ เพจ “{fb.page_name}” เชื่อมแล้ว แต่ยังไม่เจอ Instagram ที่ผูก</p>
                        <p className="text-[11px] text-slate-500">ตรวจว่า IG เป็นบัญชี <b>Business/Professional</b> + <b>ผูกกับเพจนี้</b> (ใน Meta Business Suite) แล้วกด <b>เชื่อมใหม่</b> — คราวนี้จะขอสิทธิ์ Instagram ด้วย</p>
                        <button onClick={connectFb} className="self-start h-8 px-3 text-sm text-white rounded-lg hover:opacity-90" style={{ background: "linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)" }}>📷 เชื่อมใหม่ (รับสิทธิ์ Instagram)</button>
                      </div>
                    )}
                  </div>
                )}
                {isLaz && canManage && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                    {!laz.configured ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">⚠️ ยังไม่ได้ตั้ง LAZADA_APP_KEY / LAZADA_APP_SECRET ในโฮสต์ (Vercel)</p>
                    ) : laz.connected ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-emerald-600 shrink-0">● เชื่อมต่อแล้ว</span>
                        <span className="text-sm text-slate-700">ร้าน <b>{laz.short_code || laz.seller_id}</b>{laz.country ? ` (${laz.country})` : ""}</span>
                        <button onClick={syncLazOrders} disabled={lazSyncing} className="h-8 px-3 text-sm text-white bg-[#0F146D] rounded-lg hover:opacity-90 disabled:opacity-50">{lazSyncing ? "กำลังดึง..." : "📥 ดึงออเดอร์ (30 วัน)"}</button>
                        <button onClick={connectLaz} className="text-[11px] text-violet-600 underline">เชื่อมใหม่</button>
                        <button onClick={disconnectLaz} className="text-[11px] text-rose-500 border border-rose-200 rounded-lg px-2 py-0.5 hover:bg-rose-50">ตัดการเชื่อมต่อ</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={connectLaz} disabled={!brandId} className="h-8 px-3 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-40" style={{ background: "linear-gradient(90deg,#F57224,#0F146D)" }}>🛒 เชื่อมต่อ Lazada</button>
                        <span className="text-[11px] text-slate-400">กดแล้วเข้าสู่ระบบ Lazada Seller + อนุญาต → ดึงออเดอร์เข้าระบบได้</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {platforms.length === 0 && <p className="text-slate-400 text-sm">ยังไม่มีแพลตฟอร์ม</p>}
        </div>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setShowGuide(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">📖 วิธีขอ API Key จาก LINE SHOPPING</h2>
              <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4 text-sm text-slate-700">
              <p className="text-slate-500">ทำครั้งเดียวต่อร้าน — คัดลอกคีย์มาวางในช่อง “API Key” แล้วกดบันทึก + ทดสอบเชื่อมต่อ</p>
              <ol className="space-y-2.5">
                <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">1</span><span>เข้า <a href="https://oaplus.line.biz" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">oaplus.line.biz</a> แล้ว <b>ล็อกอิน</b> ด้วยบัญชี LINE ที่เป็นเจ้าของร้าน (ต้องเป็น<b>แอดมินร้าน</b>)</span></li>
                <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">2</span><span>เลือก <b>ร้าน/บัญชี (Channel)</b> ที่ต้องการ → เข้าเมนู <b>“อีคอมเมิร์ซ” (E-Commerce)</b></span></li>
                <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">3</span><span>ไปที่ <b>“ตั้งค่าร้านค้า” (Shop settings)</b> → เลือกหัวข้อ <b>“Open API”</b></span></li>
                <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">4</span><span>เข้าเมนู <b>“จัดการ API Keys” (Manage API Keys)</b></span></li>
                <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-semibold">5</span><span>กด <b>+ Generate</b> → ตั้งชื่อกำกับ (เช่น <span className="font-mono text-xs bg-slate-100 px-1 rounded">ERP</span>) → กด <b>Generate</b></span></li>
                <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-semibold">6</span><span><b>คัดลอกคีย์</b>ที่ได้ → กลับมาวางในช่อง “API Key” ที่นี่ → <b>บันทึกคีย์</b> → <b>🔌 ทดสอบเชื่อมต่อ</b></span></li>
              </ol>
              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[13px] text-slate-500">
                <p className="font-medium text-slate-600">⚠️ ข้อควรระวัง</p>
                <p>• คีย์จะโชว์ให้ <b>คัดลอกทันทีที่สร้าง</b> — ถ้าไม่ได้ก๊อป ต้องสร้างใหม่</p>
                <p>• สร้างได้สูงสุด <b>10 คีย์</b> ต่อร้าน · ถ้าไม่เจอเมนู Open API อาจต้องเปิดใช้ MyShop/แพ็กเกจร้านก่อน</p>
                <p>• ระบบเราเก็บคีย์แบบ<b>เข้ารหัส</b> — ปลอดภัย ไม่มีใครเห็นค่าคีย์อีก</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <a href="https://oaplus.line.biz" target="_blank" rel="noopener noreferrer" className="h-9 px-4 leading-9 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700">เปิด oaplus.line.biz ↗</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ยืนยันก่อนล้าง API Key (ลบแล้วต้องไปขอ/คัดลอกมาใหม่) */}
      {clearKeyFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setClearKeyFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-slate-800">ล้าง API Key?</p>
            <p className="mt-1 text-sm text-slate-500">
              คีย์ของ <b className="text-slate-700">{platforms.find((x) => x.id === clearKeyFor)?.name_th ?? ""}</b> จะถูกลบออกจากระบบ
              — การเชื่อมต่อจะหยุดทำงาน และต้องไปคัดลอกคีย์มาใส่ใหม่เอง
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setClearKeyFor(null)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => { const id = clearKeyFor; setClearKeyFor(null); setEditKey(null); void saveKey(id, ""); }}
                className="h-9 px-4 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700">ล้างคีย์</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppAccessGate>
  );
}
