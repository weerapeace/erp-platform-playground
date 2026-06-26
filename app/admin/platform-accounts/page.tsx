"use client";

// จัดการร้าน/บัญชีแพลตฟอร์ม ต่อแบรนด์ (เฟส 2) — แต่ละแบรนด์มีร้านของตัวเองต่อแพลตฟอร์ม
// ตั้งชื่อร้าน + shop id + เปิด/ปิด · ใช้ตอน publish เพื่อเลือกร้านตามแบรนด์ของสินค้า

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPInput } from "@/components/form";
import { useAuth } from "@/components/auth";

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", youtube: "▶️", pinterest: "📌", x: "✖️" };

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
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (bid: string) => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/platform-accounts${bid ? `?brand_id=${encodeURIComponent(bid)}` : ""}`).then((r) => r.json());
      setPlatforms((j.platforms ?? []) as Platform[]);
      setBrands((j.brands ?? []) as Brand[]);
      setAccounts((j.accounts ?? {}) as Record<string, Account>);
      if (!bid && j.brands?.[0]) setBrandId(j.brands[0].id);
    } catch (e) { setMsg((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(""); }, [load]);
  useEffect(() => { if (brandId) load(brandId); }, [brandId, load]);

  const save = async (platform_id: string, patch: Partial<Account>) => {
    setAccounts((a) => { const prev = a[platform_id] ?? { label: null, external_shop_id: null, is_active: true }; return { ...a, [platform_id]: { ...prev, ...patch } }; });
    try {
      const r = await apiFetch("/api/platform-accounts", { method: "PATCH", body: JSON.stringify({ brand_id: brandId, platform_id, ...patch }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMsg("บันทึกแล้ว"); setTimeout(() => setMsg(null), 1500);
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
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
            return (
              <div key={p.id} className={`flex items-center gap-3 border rounded-xl p-3 ${acc.is_active && hasShop ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
                <span className="text-lg w-7 text-center shrink-0">{p.icon_key || PLATFORM_ICON[p.code] || "🏬"}</span>
                <span className="text-sm font-medium text-slate-700 w-24 shrink-0">{p.name_th}</span>
                <ERPInput value={acc.label ?? ""} disabled={!canManage} placeholder="ชื่อร้าน (เช่น Shopee – แบรนด์ A)" onChange={(e) => setAccounts((a) => ({ ...a, [p.id]: { ...acc, label: e.target.value } }))} onBlur={(e) => canManage && save(p.id, { label: e.target.value })} />
                <ERPInput value={acc.external_shop_id ?? ""} disabled={!canManage} placeholder="Shop ID (ถ้ามี)" className="max-w-[160px]" onChange={(e) => setAccounts((a) => ({ ...a, [p.id]: { ...acc, external_shop_id: e.target.value } }))} onBlur={(e) => canManage && save(p.id, { external_shop_id: e.target.value })} />
                <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0"><input type="checkbox" disabled={!canManage} checked={acc.is_active} onChange={(e) => save(p.id, { is_active: e.target.checked })} />เปิด</label>
              </div>
            );
          })}
          {platforms.length === 0 && <p className="text-slate-400 text-sm">ยังไม่มีแพลตฟอร์ม</p>}
        </div>
      )}
    </div>
  );
}
