"use client";

/**
 * 🧵 /admin/belt-builder — หลังบ้าน "ออกแบบเข็มขัดเอง" (Louis Montini)
 *   ค่าเริ่มต้น = สตูดิโอ (components/belt-builder/studio.tsx): การ์ดชิ้นส่วน + อัปโหลดรูป + จุดยึด + ตั้งค่าร้าน
 *   ?view=tables = มุมมองตารางขั้นสูง (components/belt-builder/belt-admin-tables.tsx — MasterCRUD 3 แท็บเดิม)
 *   ?shop=<id>  = ร้านที่เลือก (ค่าเริ่มต้น louismontini หรือร้านแรก)
 * API: /api/belt-builder/* (guardApi belt_builder.view/edit + writeAudit)
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BeltStudio } from "@/components/belt-builder/studio";
import { BeltBuilderTables } from "@/components/belt-builder/belt-admin-tables";
import { fetchShops, type BeltShop } from "@/components/belt-builder/studio-data";

function BeltBuilderAdminInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const view = sp.get("view") === "tables" ? "tables" : "studio";
  const [shopId, setShopId] = useState<string>(sp.get("shop") ?? "");
  const [shop, setShop] = useState<BeltShop | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ยังไม่รู้ร้าน (ไม่มี ?shop=) → เลือก louismontini หรือร้านแรกให้
  useEffect(() => {
    if (shopId) return;
    fetchShops().then((rows) => setShopId(rows.find((s) => s.slug === "louismontini")?.id || rows[0]?.id || "")).catch((e) => setErr(e instanceof Error ? e.message : "โหลดรายชื่อร้านไม่สำเร็จ"));
  }, [shopId]);

  const go = (v: "studio" | "tables") => {
    const q = new URLSearchParams();
    if (v === "tables") q.set("view", "tables");
    if (shopId) q.set("shop", shopId);
    router.replace(`/admin/belt-builder${q.toString() ? `?${q}` : ""}`);
  };

  if (err) return <div className="p-6 text-sm text-amber-700">⚠ {err} — ต้องเข้าสู่ระบบและมีสิทธิ์ &quot;ดูตั้งค่าออกแบบเข็มขัด&quot; (belt_builder.view)</div>;

  if (view === "tables") {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <button type="button" onClick={() => go("studio")} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">← กลับสตูดิโอ</button>
          <span className="text-sm text-slate-500">📋 มุมมองตาราง (ขั้นสูง){shop ? ` · ${shop.name}` : ""}</span>
        </div>
        {shopId ? <BeltBuilderTables shopId={shopId} /> : <div className="p-6 text-sm text-slate-500">กำลังโหลดร้าน…</div>}
      </div>
    );
  }
  return <BeltStudio shopId={shopId || undefined} onShopChange={(s) => { setShop(s); if (s.id !== shopId) setShopId(s.id); }} onOpenTables={() => go("tables")} />;
}

export default function BeltBuilderAdminPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">กำลังโหลด…</div>}>
      <BeltBuilderAdminInner />
    </Suspense>
  );
}
