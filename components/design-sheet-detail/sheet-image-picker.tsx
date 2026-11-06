"use client";

/**
 * ตัวเลือกรูปของใบงานออกแบบ (ของกลางในใบงาน) — รูปทุกแหล่ง (แกลเลอรี/รายละเอียด/คอมเมนต์) + อัปโหลดเพิ่มผ่าน ImageManager กลาง
 * ใช้ที่: แท็บรายละเอียดงาน (spec-tab) · แท็บแจ้งลูกค้า (notice-tab) — ย้ายออกมาจาก spec-tab 2026-11-06
 */
import { useCallback, useEffect, useState } from "react";
import { ImageManager } from "@/components/image-manager";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";

/** ป๊อปเลือกรูป: รูปทุกแหล่งในใบงาน (แกลเลอรี/รายละเอียด/คอมเมนต์) + อัปโหลดเพิ่มผ่าน ImageManager กลาง */
export function SheetImagePicker({ sheetId, onPick, usedKeys, usedLabel }: { sheetId: string; onPick: (img: DesignSheetImage) => void; usedKeys: Set<string>; usedLabel?: string }) {
  const t = useT();
  const [imgs, setImgs] = useState<DesignSheetImage[] | null>(null);
  const reload = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/images`).then((r) => r.json());
      setImgs((j.data ?? []) as DesignSheetImage[]);
    } catch { setImgs([]); }
  }, [sheetId]);
  useEffect(() => { void reload(); }, [reload]);
  return (
    <div className="space-y-4">
      {imgs == null ? <p className="text-sm text-slate-400 py-4 text-center">{t("กำลังโหลดรูป…", "Loading images…")}</p>
        : imgs.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">{t("ใบงานนี้ยังไม่มีรูป — อัปโหลดด้านล่าง", "This sheet has no images yet — upload below")}</p>
        : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {imgs.map((im) => {
              const used = usedKeys.has(im.key) || usedKeys.has(im.url);
              return (
                <button key={im.key} type="button" onClick={() => onPick(im)}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-violet-400 hover:ring-2 hover:ring-violet-200 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" className="w-full h-full object-cover" />
                  <span className="absolute left-1 bottom-1 px-1 rounded bg-black/55 text-[10px] text-white">{im.source_label}</span>
                  {used && <span className="absolute right-1 top-1 px-1 rounded bg-violet-600 text-[10px] text-white">{usedLabel ?? t("ใช้แล้ว", "Used")}</span>}
                </button>
              );
            })}
          </div>
        )}
      <div className="border-t border-slate-100 pt-3">
        <ImageManager entityType="design_sheet" entityId={sheetId} imageOnly title={t("อัปโหลดรูปใหม่เข้าใบงาน", "Upload new images to this sheet")}
          onCountChange={() => void reload()} />
      </div>
    </div>
  );
}
