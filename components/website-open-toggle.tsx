"use client";

/**
 * ปุ่ม "เปิด/ปิดเว็บชั่วคราว" — อยู่หัวหน้า /website/<slug> (ของกลาง ใช้ได้ทุกร้าน)
 *
 * ปิด = ลูกค้าทั่วไปเห็นแค่หน้า "เร็ว ๆ นี้" (ตั้งหัวข้อ/ข้อความได้ที่แท็บ 🏪 ข้อมูลร้าน)
 *       พรีวิวใน ERP (?preview=1) ยังเห็นเว็บเต็มเหมือนเดิม · API สั่งซื้อยังทำงาน
 * ค่าเก็บที่ store_settings.site_closed ผ่าน /api/website/settings (บันทึกแล้วเว็บร้านล้างแคชทันที)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadWebSettings } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useT } from "@/components/i18n";

export function WebsiteOpenToggle({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const t = useT();
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await loadWebSettings(shopSlug, true);
      if (j.info) setInfo(j.info);
    } catch {
      /* ไม่โชว์ปุ่มถ้าโหลดไม่ได้ */
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  // ฟังการบันทึกจากแท็บข้อมูลร้าน (ช่องเดียวกัน) จะได้ไม่โชว์ค่าเก่า
  useEffect(() => {
    const h = () => void load();
    window.addEventListener("website-info-saved", h);
    return () => window.removeEventListener("website-info-saved", h);
  }, [load]);

  if (!info) return null;
  const closed = info.site_closed === true;

  const toggle = async () => {
    const next = !closed;
    const ok = await askConfirm(
      next
        ? { title: t("ปิดเว็บชั่วคราว?", "Close the site temporarily?"), message: t("ลูกค้าทั่วไปจะเห็นแค่หน้า \"เร็ว ๆ นี้\" (ทุกโดเมนของร้านนี้) · คุณยังดูพรีวิวใน ERP ได้ตามปกติ", "Customers will only see the \"Coming soon\" page (all domains of this shop) · You can still preview it in the ERP"), variant: "danger", confirmText: t("ปิดเว็บ", "Close site") }
        : { title: t("เปิดเว็บให้ลูกค้าเข้าได้?", "Open the site to customers?"), confirmText: t("เปิดเว็บ", "Open site") }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, info: { ...info, site_closed: next } }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
        return;
      }
      setInfo(j.info as Record<string, unknown>);
      window.dispatchEvent(new Event("website-info-saved"));
      toast.success(next ? t("ปิดเว็บแล้ว — ลูกค้าจะเห็นหน้า \"เร็ว ๆ นี้\"", "Site closed — customers will see the \"Coming soon\" page") : t("เปิดเว็บแล้ว — ลูกค้าเข้าได้ตามปกติ", "Site opened — customers can visit as usual"));
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Connection failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void toggle()}
      disabled={busy}
      title={closed ? t("ตอนนี้ลูกค้าเห็นหน้า 'เร็ว ๆ นี้' — กดเพื่อเปิดเว็บ", "Customers now see the 'Coming soon' page — click to open the site") : t("ตอนนี้เว็บเปิดให้ลูกค้าเข้าได้ — กดเพื่อปิดชั่วคราว", "The site is open to customers — click to close temporarily")}
      className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-sm font-medium transition disabled:opacity-50 ${
        closed ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${closed ? "bg-amber-500" : "bg-emerald-500"}`} />
      {busy ? t("กำลังบันทึก…", "Saving…") : closed ? t("ปิดเว็บอยู่ · กดเพื่อเปิด", "Site closed · click to open") : t("เว็บเปิดอยู่ · กดเพื่อปิดชั่วคราว", "Site open · click to close temporarily")}
    </button>
  );
}
