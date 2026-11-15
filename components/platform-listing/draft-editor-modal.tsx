"use client";

/**
 * แก้ข้อมูลที่จะส่งขึ้นร้าน (ร่าง) ของสินค้า 1 ตัว × ร้าน 1 ร้าน — ปุ่ม "จัดการ →" ในแท็บแพลตฟอร์มของ Parent SKU
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-15: "default เป็นดึงมาเลย · รูปสินค้าก็เป็นจาก Parent SKU เลย"
 *   เดิม "จัดการ" เปิดตัวจัดการรุ่นแรก (ช่องว่าง + ลิงก์ "ใช้ข้อมูลจากสินค้า") ส่วน "ลงร้านนี้" เปิดหน้าดูก่อนส่งที่ดึงข้อมูลสินค้าให้แล้ว
 *   → ร้านที่มีหน้าดูก่อนส่ง (lib/platform-create-registry: LINE / Shopee / Lazada / TikTok) ให้ "จัดการ" ใช้หน้าเดียวกับตัวช่วยลงสินค้า
 * ⚠️ ไม่ใช่หน้าแก้ตัวที่ 2 — ใช้หน้าดูก่อนส่งของแต่ละร้านตัวเดียวกับตัวช่วยลงสินค้า (components/platform-listing/<ร้าน>-create-preview)
 *   แก้แล้วบันทึกลงร่างทันที (PATCH /api/product-platforms) · ไม่ส่งอะไรขึ้นร้าน · ลงจริงต้องกด "ลงร้านนี้" (ตัวช่วยลงสินค้า)
 *   เปิดแล้วเตรียมร่างให้ก่อนแบบเดียวกับตัวช่วย ขั้น 2 (POST /api/product-platforms/prepare · เติมเฉพาะช่องที่ว่าง ไม่ทับที่เคยแก้)
 * ร้านที่ไม่มีหน้าดูก่อนส่ง → ยังใช้ ProductPlatformManager ตามเดิม
 * สิทธิ์: ดู = products.platforms.view · แก้/เตรียมร่าง = products.platforms.edit (canEdit) · แก้ราคา = products.edit (canEditPrice)
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { PlatformIcon } from "@/components/platform-icon";
import { normalizePriceRule } from "@/lib/platform-listing-builder";
import { createMissingOf } from "@/lib/platform-create-readiness";

const LineCreatePreviewEditor = dynamic(() => import("./line-create-preview").then((m) => m.LineCreatePreviewEditor), { ssr: false });
const LazadaCreatePreviewEditor = dynamic(() => import("./lazada-create-preview").then((m) => m.LazadaCreatePreviewEditor), { ssr: false });
const TiktokCreatePreviewEditor = dynamic(() => import("./tiktok-create-preview").then((m) => m.TiktokCreatePreviewEditor), { ssr: false });
const ShopeeCreatePreviewEditor = dynamic(() => import("./shopee-create-preview").then((m) => m.ShopeeCreatePreviewEditor), { ssr: false });

type PlanLike = { missing: string[]; on_shop: string | null; blockers?: string[] };

export function PlatformDraftEditorModal({ open, onClose, parentId, parentLabel, platform, canEdit, canEditPrice, onAdd }: {
  open: boolean;
  onClose: () => void;
  parentId: string;
  /** รหัส · ชื่อสินค้า (หัวป๊อป) */
  parentLabel?: string | null;
  platform: { code: string; name_th: string; icon_key: string | null };
  canEdit: boolean;
  canEditPrice: boolean;
  /** กด "ลงร้านนี้ →" (ไม่ส่ง = ไม่มีปุ่ม เช่น ไม่มีสิทธิ์ / มีบนร้านแล้ว) */
  onAdd?: () => void;
}) {
  const [prepared, setPrepared] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [onShop, setOnShop] = useState<string | null>(null);

  // เตรียมร่าง (เติมช่องที่ว่างจากข้อมูลสินค้า) ก่อนเปิดหน้าดูก่อนส่ง — แบบเดียวกับตัวช่วยลงสินค้า ขั้น 2
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPrepared(false); setMissing(null); setOnShop(null);
    (async () => {
      if (canEdit) {
        try {
          await apiFetch("/api/product-platforms/prepare", { method: "POST", body: JSON.stringify({ platform_code: platform.code, parent_sku_ids: [parentId], price_rule: normalizePriceRule({ mode: "same", pct: 0 }), overwrite: false }) });
        } catch { /* หน้าดูก่อนส่งยังเปิดได้ — แค่หมวด/รูปอาจยังไม่ถูกเติมลงร่าง */ }
      }
      if (alive) setPrepared(true);
    })();
    return () => { alive = false; };
  }, [open, parentId, platform.code, canEdit]);

  // นับข้อที่ขาดแบบเดียวกับตัวช่วย (หน้าดูก่อนส่งแจ้งทุกครั้งที่โหลด/แก้)
  const onLoaded = useCallback((pv: PlanLike, blockers?: string[]) => {
    setMissing(createMissingOf(pv.missing, blockers ?? pv.blockers ?? []));
    setOnShop(pv.on_shop ?? null);
  }, []);

  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">แก้แล้วบันทึกลงร่างทันที · ยังไม่ส่งอะไรขึ้นร้าน</span>
      {onAdd && !onShop && (
        <button type="button" onClick={onAdd} className="h-9 rounded-lg border border-violet-300 px-3 text-sm text-violet-700 hover:bg-violet-50">ลงร้านนี้ →</button>
      )}
      <button type="button" onClick={onClose} className="h-9 rounded-lg bg-violet-600 px-4 text-sm text-white hover:bg-violet-700">เสร็จ</button>
    </div>
  );

  return (
    <ERPModal open={open} onClose={onClose} size="lg" footer={footer} storageKey="platform-draft-editor"
      title={`${platform.name_th} · ข้อมูลที่จะส่งขึ้นร้าน`} description={parentLabel || undefined}>
      {!prepared ? <LoadingState label="กำลังเตรียมข้อมูลจากสินค้า..." /> : (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <PlatformIcon code={platform.code} iconKey={platform.icon_key} size={14} />
            ชื่อ รายละเอียด และรูปดึงจากสินค้าให้แล้ว (รูปจาก Parent SKU) — แก้ได้ทีละช่อง
          </p>
          {missing && (
            onShop ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><Icon name="store" /> สินค้านี้มีบนร้านแล้ว (#{onShop}) — แก้บนร้านได้จากปุ่ม &quot;จัดการบนร้าน&quot;</p>
            ) : missing.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><Icon name="done" /> ข้อมูลครบ พร้อมลงร้านนี้</p>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="font-medium"><Icon name="warning" /> ยังขาด {missing.length} อย่างก่อนลงร้านนี้</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )
          )}
          {platform.code === "line_shopping" ? (
            <LineCreatePreviewEditor parentId={parentId} canEdit={canEdit} canEditPrice={canEditPrice} onLoaded={onLoaded} />
          ) : platform.code === "lazada" ? (
            <LazadaCreatePreviewEditor parentId={parentId} canEdit={canEdit} onLoaded={onLoaded} />
          ) : platform.code === "tiktok" ? (
            <TiktokCreatePreviewEditor parentId={parentId} canEdit={canEdit} onLoaded={onLoaded} />
          ) : platform.code === "shopee" ? (
            <ShopeeCreatePreviewEditor parentId={parentId} canEdit={canEdit} onLoaded={onLoaded} />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">ร้านนี้ยังไม่มีหน้าดูก่อนส่ง</p>
          )}
        </div>
      )}
    </ERPModal>
  );
}
