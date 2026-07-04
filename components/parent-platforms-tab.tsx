"use client";

/**
 * ParentPlatformsTab — แท็บ "🏬 แพลตฟอร์ม" ใน Parent SKU (drawer/หน้าเต็ม)
 * แสดงทุกแพลตฟอร์มที่เปิดใช้เป็นแถว: สถานะ (ยังไม่ทำ/มีร่าง/ลงขายแล้ว) + ฟิลด์สรุป
 * (ชื่อ/หมวดหมู่/รูปที่เลือก/ร้าน) + ปุ่ม "จัดการ" เปิด ProductPlatformManager (ดึงรายละเอียดที่ลงไว้)
 * ของกลาง: /api/product-platforms (guardApi products.platforms.view) · ProductPlatformManager
 */
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { PlatformIcon } from "@/components/platform-icon";

// dynamic กัน import วน (ProductPlatformManager → master-crud → ParentPlatformsTab)
const ProductPlatformManager = dynamic(() => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager), { ssr: false });

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Draft = { title?: string | null; category_path?: string | null; image_keys?: string[]; status?: string | null; platform_product_id?: string | null; last_sync_status?: string | null };
type Account = { label: string | null; is_active: boolean };
type Parent = { name_platform?: string; name_th?: string };

export function ParentPlatformsTab({ parentId }: { parentId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [parent, setParent] = useState<Parent | null>(null);
  const [manage, setManage] = useState<string | null>(null); // platform id ที่เปิดตัวจัดการอยู่

  const load = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);
    try {
      const j = await apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json());
      setPlatforms((j.platforms ?? []) as Platform[]);
      setDrafts((j.drafts ?? {}) as Record<string, Draft>);
      setAccounts((j.accounts ?? {}) as Record<string, Account>);
      setParent((j.parent ?? null) as Parent | null);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">บันทึกสินค้าก่อน แล้วค่อยตั้งค่าการขายแต่ละแพลตฟอร์ม</div>;
  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</div>;
  if (platforms.length === 0) return <div className="text-sm text-slate-400 py-8 text-center">ยังไม่มีแพลตฟอร์มที่เปิดใช้ — เพิ่มที่ตั้งค่า</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">รายละเอียดการขายแต่ละแพลตฟอร์ม — กด “จัดการ” เพื่อแก้ชื่อ/หมวดหมู่/รูป/ราคา แล้วส่งขึ้นแพลตฟอร์มนั้น</p>
      {platforms.map((p) => {
        const d = drafts[p.id] ?? {};
        const acct = accounts[p.id];
        const onSale = d.status === "published" || d.last_sync_status === "success" || !!d.platform_product_id;
        const hasDraft = !!(d.title || d.category_path || (d.image_keys?.length));
        const status = onSale ? { t: "ลงขายแล้ว", c: "text-emerald-700 bg-emerald-50 border-emerald-200" }
          : hasDraft ? { t: "มีร่าง", c: "text-blue-700 bg-blue-50 border-blue-200" }
          : { t: "ยังไม่ทำ", c: "text-slate-500 bg-slate-50 border-slate-200" };
        const name = d.title || parent?.name_platform || parent?.name_th || "—";
        return (
          <div key={p.id} className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200 flex-wrap">
              <span className="text-sm font-medium text-slate-800 inline-flex items-center gap-1.5"><PlatformIcon code={p.code} iconKey={p.icon_key} size={18} /> {p.name_th}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${status.c}`}>{status.t}</span>
              {d.platform_product_id && <span className="text-[11px] text-slate-400 font-mono truncate max-w-[10rem]">#{d.platform_product_id}</span>}
              <button onClick={() => setManage(p.id)} className="ml-auto text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5">จัดการ →</button>
            </div>
            <div className="p-3 grid sm:grid-cols-2 gap-y-1.5 gap-x-4">
              <Row label="ชื่อ" value={name} />
              <Row label="หมวดหมู่" value={d.category_path || "— ยังไม่ตั้ง"} warn={!d.category_path} />
              <Row label="รูปที่เลือกส่ง" value={`${d.image_keys?.length ?? 0} รูป`} warn={!(d.image_keys?.length)} />
              <Row label="ร้าน" value={acct?.is_active ? (acct.label || "มีร้าน") : "ยังไม่มีร้าน"} warn={!acct?.is_active} />
            </div>
          </div>
        );
      })}
      {manage && parentId && (
        <ProductPlatformManager parentSkuId={parentId} initialPlatformId={manage} onClose={() => { setManage(null); void load(); }} />
      )}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex gap-2 text-xs min-w-0">
      <span className="text-slate-400 shrink-0 w-20">{label}</span>
      <span className={`truncate ${warn ? "text-amber-600" : "text-slate-700"}`} title={value}>{value}</span>
    </div>
  );
}
