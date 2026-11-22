"use client";

/**
 * แถบ "เก็บเข้าคลัง Artwork เป็น: [แบรนด์] [ชนิด]" ในรายการลายของหน้าจัดเรียง
 * ไฟล์ PNG ที่ลากมาจะสร้างการ์ด artwork ด้วยแบรนด์/ชนิดนี้ (การ์ด artwork ในคลังบังคับ 2 ช่องนี้) — จำค่าล่าสุดในเครื่องนี้
 * แก้รายละเอียดอื่นของการ์ด (แท็ก/อัลบั้ม/Parent SKU) ที่ปุ่ม "จัดการ" ของแถว = หน้ารายละเอียดของคลังไฟล์กลาง
 */
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { BrandSelect, type BrandSelectOption } from "@/components/brand-select";
import { apiFetch } from "@/lib/api";
import { targetReady, type ArtworkTarget } from "./artwork-card";
import { Icon } from "@/components/icon";

export function ArtworkBar({ value, onChange }: { value: ArtworkTarget; onChange: (v: ArtworkTarget) => void }) {
  const t = useT();
  const [brands, setBrands] = useState<BrandSelectOption[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json())
      .then((j) => setBrands(((j.data ?? []) as { id: string; name: string; hide_in_artwork?: boolean }[]).filter((b) => !b.hide_in_artwork)))
      .catch(() => {});
    apiFetch("/api/lookups?type=artwork_type").then((r) => r.json())
      .then((j) => setTypes(((j.data ?? []) as { name: string }[]).map((r) => r.name).filter(Boolean)))
      .catch(() => {});
  }, []);
  const ready = targetReady(value);
  const typeVal = value.types[0] ?? "";
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs ${ready ? "bg-violet-50 text-violet-800" : "bg-amber-50 text-amber-800"}`}>
      <span className="font-medium"><Icon value="i:upload" className="mr-1" />{t("เก็บเข้าคลัง Artwork เป็น", "Save to Artwork as")}</span>
      <BrandSelect plain brands={brands} value={value.brandId} onChange={(id) => onChange({ ...value, brandId: id })}
        emptyLabel={t("— เลือกแบรนด์ —", "— Select brand —")} title={t("แบรนด์ของการ์ด artwork", "Brand of the artwork card")}
        className={`h-7 rounded border bg-white px-1.5 text-xs ${value.brandId ? "border-slate-300" : "border-amber-400"}`} />
      <select value={typeVal} onChange={(e) => onChange({ ...value, types: e.target.value ? [e.target.value] : [] })}
        aria-label={t("ชนิด artwork", "Artwork type")}
        className={`h-7 rounded border bg-white px-1.5 text-xs ${typeVal ? "border-slate-300" : "border-amber-400"}`}>
        <option value="">{t("— เลือกชนิด —", "— Select type —")}</option>
        {typeVal && !types.includes(typeVal) && <option value={typeVal}>{typeVal}</option>}
        {types.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="text-[11px] opacity-80">
        {ready ? t("ไฟล์ที่ลากมาจะมีการ์ดในคลังให้เอง · ไฟล์เดิมเคยเข้าคลังแล้ว = ใช้การ์ดเดิม", "Dropped files get a library card · a file already in the library reuses its card")
          : t("เลือกให้ครบก่อน ไฟล์ที่ลากมาถึงจะเข้าคลังได้", "Pick both so dropped files can go into the library")}
      </span>
    </div>
  );
}
