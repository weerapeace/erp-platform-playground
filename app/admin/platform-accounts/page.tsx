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

export default function PlatformAccountsPage() {
  const { can } = useAuth();
  const canManage = can("products.platforms.manage_accounts");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [keys, setKeys] = useState<Record<string, boolean>>({});   // platform_id → มี API Key ไหม
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);   // คู่มือขอ API Key ของ LINE SHOPPING
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  // สถานะเชื่อมต่อ Facebook (Meta) ต่อแบรนด์
  type FbStatus = { connected: boolean; stage: string; page_name: string | null; pages: { id: string; name: string; ig: boolean }[] };
  const [fb, setFb] = useState<FbStatus>({ connected: false, stage: "none", page_name: null, pages: [] });
  const [fbHasIg, setFbHasIg] = useState(false);
  const [metaCfg, setMetaCfg] = useState(true);   // ตั้งค่า META_APP_ID/SECRET ในโฮสต์แล้วไหม
  const [pickPage, setPickPage] = useState("");   // เพจที่เลือก (กรณีมีหลายเพจ)
  const brandChosen = useRef(false);   // มีการเลือกแบรนด์แล้ว (จาก query/ผู้ใช้) — กัน auto-select ทับ

  const load = useCallback(async (bid: string) => {
    setLoading(true);
    try {
      const [j, kj, mj] = await Promise.all([
        apiFetch(`/api/platform-accounts${bid ? `?brand_id=${encodeURIComponent(bid)}` : ""}`).then((r) => r.json()),
        bid ? apiFetch(`/api/platform-credentials?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve({ keys: {} }),
        bid ? apiFetch(`/api/meta/status?brand_id=${encodeURIComponent(bid)}`).then((r) => r.json()) : Promise.resolve(null),
      ]);
      setPlatforms((j.platforms ?? []) as Platform[]);
      setBrands((j.brands ?? []) as Brand[]);
      setAccounts((j.accounts ?? {}) as Record<string, Account>);
      setKeys((kj.keys ?? {}) as Record<string, boolean>);
      if (mj) { setFb((mj.facebook ?? { connected: false, stage: "none", page_name: null, pages: [] }) as FbStatus); setFbHasIg(!!mj.instagram?.connected); setMetaCfg(mj.configured !== false); setPickPage(""); }
      setTestMsg(null);
      if (!bid && !brandChosen.current && j.brands?.[0]) setBrandId(j.brands[0].id);
    } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(""); }, [load]);
  useEffect(() => { if (brandId) load(brandId); }, [brandId, load]);
  // กลับมาจากการเชื่อมต่อ Facebook (OAuth) — อ่านผลจาก query แล้วล้าง URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const err = sp.get("meta_error"), ok = sp.get("meta_connected"), pick = sp.get("meta_pick"), brand = sp.get("brand");
    if (brand) { brandChosen.current = true; setBrandId(brand); }
    if (err) setMsg("❌ " + err);
    else if (ok) setMsg("✅ เชื่อมต่อ Facebook สำเร็จ");
    else if (pick) setMsg("มีหลายเพจ — เลือกเพจที่จะใช้โพสต์ด้านล่าง");
    if (err || ok || pick || brand) window.history.replaceState({}, "", window.location.pathname);
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
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">🏪 จัดการร้าน/บัญชีแพลตฟอร์ม</h1>
      <p className="text-sm text-slate-500 mb-4">แต่ละแบรนด์มีร้านของตัวเองในแต่ละแพลตฟอร์ม — ตั้งร้านที่นี่ ระบบจะใช้ตอนลงขายตามแบรนด์ของสินค้า</p>

      {!canManage && <p className="text-sm text-amber-600 mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">คุณไม่มีสิทธิ์แก้ไข (ดูได้อย่างเดียว)</p>}

      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-slate-600">แบรนด์:</span>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white min-w-[220px]">
          {brands.length === 0 && <option value="">—</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {msg && <span className="text-xs text-slate-400">{msg}</span>}
      </div>

      {loading ? <p className="text-slate-400 text-sm py-8 text-center">กำลังโหลด...</p> : (
        <div className="space-y-2">
          {platforms.map((p) => {
            const acc = accounts[p.id] ?? { label: null, external_shop_id: null, is_active: false };
            const hasShop = !!(acc.label || acc.external_shop_id);
            const hasApi = p.code === "line_shopping";   // แพลตฟอร์มที่ต่อ API ได้ (ใส่ API Key + ทดสอบ)
            const isMeta = p.code === "facebook";   // Facebook = เชื่อมต่อแบบ OAuth (กดปุ่มเชื่อม) แล้วยิงโพสต์จริงได้
            const isMetaIg = p.code === "instagram";   // Instagram = ใช้การเชื่อมของเพจ Facebook (สถานะ/ปุ่มอยู่ที่นี่ด้วย)
            return (
              <div key={p.id} className={`border rounded-xl p-3 ${acc.is_active && hasShop ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-7 text-center shrink-0"><PlatformIcon code={p.code} iconKey={p.icon_key} size={22} /></span>
                  <span className="text-sm font-medium text-slate-700 w-24 shrink-0">{p.name_th}</span>
                  <ERPInput value={acc.label ?? ""} disabled={!canManage} placeholder="ชื่อร้าน (เช่น Shopee – แบรนด์ A)" onChange={(e) => setAccounts((a) => ({ ...a, [p.id]: { ...acc, label: e.target.value } }))} onBlur={(e) => canManage && save(p.id, { label: e.target.value })} />
                  <ERPInput value={acc.external_shop_id ?? ""} disabled={!canManage} placeholder="Shop ID / ลิงก์ร้าน (เช่น @louismontini — ใช้ทำลิงก์สินค้า)" title="ใช้สร้างลิงก์สินค้าบนร้าน เช่น LINE: https://shop.line.me/@Shop ID/product/..." className="max-w-[280px]" onChange={(e) => setAccounts((a) => ({ ...a, [p.id]: { ...acc, external_shop_id: e.target.value } }))} onBlur={(e) => canManage && save(p.id, { external_shop_id: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0"><input type="checkbox" disabled={!canManage} checked={acc.is_active} onChange={(e) => save(p.id, { is_active: e.target.checked })} />เปิด</label>
                </div>
                {hasApi && canManage && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 shrink-0">🔑 API Key</span>
                    {keys[p.id] && <span className="text-[11px] text-emerald-600 shrink-0">● ตั้งค่าแล้ว</span>}
                    <input type="password" autoComplete="off" value={keyDraft[p.id] ?? ""} placeholder={keys[p.id] ? "•••• (ใส่ใหม่เพื่อเปลี่ยน)" : "วาง API Key จาก MyShop"}
                      onChange={(e) => setKeyDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                      className="h-8 flex-1 min-w-[180px] border border-slate-200 rounded-md px-2 text-sm font-mono" />
                    <button onClick={() => saveKey(p.id, keyDraft[p.id] ?? "")} disabled={!(keyDraft[p.id] ?? "").trim()} className="h-8 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40">บันทึกคีย์</button>
                    {keys[p.id] && <button onClick={() => saveKey(p.id, "")} className="h-8 px-2 text-xs text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50">ล้าง</button>}
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
    </div>
    </AppAccessGate>
  );
}
