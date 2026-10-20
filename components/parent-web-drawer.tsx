"use client";
/**
 * 🛍 Drawer "ตั้งค่าเว็บของสินค้า" ทุกร้าน (ของกลาง) — ห่อ ParentWebListings (ตัวเดียวกับแท็บ 🛍 เว็บไซต์ ใน Parent SKU)
 *   แก้ที่นี่ = แก้ที่แท็บเว็บไซต์ของสินค้าเหมือนกันทุกที่ · ปุ่มบันทึกอยู่แถบล่าง (footer-save)
 *   หัว: รูป + รหัส/ชื่อ · ◀ ▶ เลื่อนตามรายการที่ผู้เรียกส่งมา · 📦 เปิด Parent SKU (ผู้เรียกเปิด drawer สินค้าเอง)
 * ใช้ที่: 🛠 โหมดทำงาน หน้า SKU การตลาด (ปุ่ม 🛍 ต่อรุ่น)
 * ของกลาง: Drawer · ConfirmDialog · footer-save · ParentWebListings
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { Drawer, ConfirmDialog } from "@/components/modal";
import { FooterSaveProvider, FooterSaveButton, useFooterSaveHost } from "@/components/footer-save";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";

const ParentWebListings = dynamic(() => import("@/components/parent-web-listings").then((m) => m.ParentWebListings), { ssr: false });

export function ParentWebDrawer({ parentId, code, name, imageUrl, navIds, onNavigate, onClose, onChanged, onOpenParent, hidden }: {
  parentId: string | null;
  code?: string; name?: string; imageUrl?: string | null;
  /** ลำดับรุ่นสำหรับ ◀ ▶ (ไม่ส่ง = ไม่มีปุ่มเลื่อน) */
  navIds?: string[];
  onNavigate?: (parentId: string) => void;
  onClose: () => void;
  /** บันทึกแล้ว — ให้หน้าที่เรียกโหลดข้อมูลใหม่ถ้าต้องการ */
  onChanged?: () => void;
  /** 📦 เปิดข้อมูลสินค้าเต็ม (ผู้เรียกเปิด MasterRecordDrawer เอง) */
  onOpenParent?: (parentId: string) => void;
  /** ซ่อนชั่วคราว (เช่นตอนเปิด drawer สินค้าทับ) โดยไม่ล้างของที่แก้ค้าง */
  hidden?: boolean;
}) {
  const toast = useToast();
  const t = useT();
  const save = useFooterSaveHost();
  const [pending, setPending] = useState<{ to: string | null } | null>(null);
  const idx = parentId && navIds ? navIds.indexOf(parentId) : -1;

  // ไปตัวอื่น/ปิด ตอนมีของแก้ค้าง → ถามก่อน
  const go = (to: string | null) => {
    if (save.anyDirty) { setPending({ to }); return; }
    if (to) onNavigate?.(to); else onClose();
  };
  const openParent = () => {
    if (!parentId || !onOpenParent) return;
    if (save.anyDirty) { toast.info(t("บันทึกการแก้ไขก่อน แล้วค่อยเปิด Parent SKU", "Save your changes first, then open the Parent SKU")); return; }
    onOpenParent(parentId);
  };

  return (
    <>
      <Drawer open={!!parentId && !hidden} onClose={() => go(null)} size="xl"
        title={parentId ? `🛍 ${t("เว็บไซต์", "Website")} — ${code || t("สินค้า", "Product")}` : ""}
        description={name ? `${name}${idx >= 0 && navIds ? ` · ${idx + 1}/${navIds.length}` : ""}` : ""}
        hasUnsavedChanges={save.anyDirty}
        footer={
          <>
            <button type="button" onClick={() => go(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <FooterSaveButton host={save} />
          </>
        }>
        {parentId && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" />
                : <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100" />}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold text-slate-800">{code}</p>
                <p className="truncate text-xs text-slate-500" title={name}>{name}</p>
              </div>
              {onOpenParent && (
                <button type="button" onClick={openParent} title={t("เปิดข้อมูลสินค้าเต็ม (ทุกแท็บ)", "Open the full product record (all tabs)")}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-500">📦 {t("เปิด Parent SKU", "Open Parent SKU")}</button>
              )}
              {navIds && navIds.length > 1 && (
                <div className="flex shrink-0 gap-1">
                  <button type="button" disabled={idx <= 0} onClick={() => go(navIds[idx - 1] ?? null)} title={t("รุ่นก่อนหน้า", "Previous model")} aria-label={t("รุ่นก่อนหน้า", "Previous model")}
                    className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30">◀</button>
                  <button type="button" disabled={idx < 0 || idx >= navIds.length - 1} onClick={() => go(navIds[idx + 1] ?? null)} title={t("รุ่นถัดไป", "Next model")} aria-label={t("รุ่นถัดไป", "Next model")}
                    className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30">▶</button>
                </div>
              )}
            </div>
            <FooterSaveProvider value={save.register}>
              <ParentWebListings key={parentId} parentId={parentId} onChanged={onChanged} onOpenParent={onOpenParent ? openParent : undefined} />
            </FooterSaveProvider>
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} variant="danger"
        onConfirm={() => { const to = pending?.to ?? null; setPending(null); if (to) onNavigate?.(to); else onClose(); }}
        title={t("มีข้อมูลที่ยังไม่บันทึก", "You have unsaved changes")} message={t("ต้องการออกโดยไม่บันทึกหรือไม่? (กด อยู่ต่อ แล้วกด 💾 บันทึก ที่แถบล่างก่อนได้)", "Leave without saving? (click Stay, then 💾 Save in the bottom bar first)")}
        confirmText={t("ออกโดยไม่บันทึก", "Leave without saving")} cancelText={t("อยู่ต่อ", "Stay")} />
    </>
  );
}
