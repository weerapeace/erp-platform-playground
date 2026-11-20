"use client";
/**
 * แท็บ "ใบงานออกแบบ" ใน AssetPicker (เจ้าของขอ 2026-11-20) — เลือกรูปจากใบงานออกแบบ
 *   รูปทุกแหล่งของใบงาน (แกลเลอรี · รายละเอียดงาน · คอมเมนต์ลูกค้า) ผ่าน GET /api/design-sheets/[id]/images
 *   ใบงานที่ผูกกับรายการ (prop sheets) ขึ้นก่อน · "เลือกใบงานอื่น…" = DesignSheetPickerModal (ของกลาง)
 *   รูปที่เลือกไม่ได้อยู่ในคลัง → AssetRow ที่ได้มี id "ds:<r2 key>" (ใช้ r2_key/url ได้ · ห้ามเอา id ไปบันทึก usages)
 *   AssetPicker โชว์แท็บนี้เฉพาะตอนผู้เรียกส่ง designSheets มา
 */
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { DesignSheetPickerModal } from "@/components/design-sheet-picker";
import type { AssetRow } from "@/app/api/assets/shared";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";

export type PickerDesignSheet = { id: string; code: string | null; name: string | null };

export const DESIGN_SHEET_ASSET_PREFIX = "ds:";

/** รูปจากใบงาน → รูปแบบ AssetRow (เท่าที่ตัวเลือกใช้) */
export function designSheetImageAsset(img: DesignSheetImage, sheet: PickerDesignSheet): AssetRow {
  return {
    id: `${DESIGN_SHEET_ASSET_PREFIX}${img.key}`, r2_key: img.key, url: img.url, asset_type: "image",
    title: `${sheet.code ?? ""} · ${img.source_label}`.trim(), file_name: img.key.split("/").pop() ?? img.key,
    sizes: [], source: "design_sheet",
  } as unknown as AssetRow;
}

export function DesignSheetImagesPanel({ sheets, grid, renderTile }: {
  sheets: PickerDesignSheet[];
  grid: string;
  renderTile: (a: AssetRow) => ReactNode;
}) {
  const [extra, setExtra] = useState<PickerDesignSheet[]>([]);
  const all = [...sheets, ...extra.filter((x) => !sheets.some((s) => s.id === x.id))];
  const [cur, setCur] = useState<string>(sheets[0]?.id ?? "");
  const [imgs, setImgs] = useState<DesignSheetImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (!cur) { setImgs([]); return; }
    let alive = true;
    setLoading(true); setErr(null);
    apiFetch(`/api/design-sheets/${cur}/images`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || j.error) { setErr(j.error || `โหลดรูปไม่ได้ (HTTP ${res.status})`); setImgs([]); return; }
        setImgs((j.data ?? []) as DesignSheetImage[]);
      })
      .catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cur]);

  const sheet = all.find((s) => s.id === cur) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {all.length > 0 && <span className="text-slate-400">{sheets.length ? "ใบงานที่ผูกไว้:" : "ใบงาน:"}</span>}
        {all.map((s) => (
          <button key={s.id} type="button" onClick={() => setCur(s.id)}
            className={`max-w-[240px] truncate rounded-full border px-2.5 py-1 ${cur === s.id ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {s.code} {s.name}
          </button>
        ))}
        <button type="button" onClick={() => setPickOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
          <Icon value="i:search" className="text-[12px]" />เลือกใบงานอื่น…
        </button>
      </div>

      {!cur ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">ใบเสนอราคานี้ยังไม่ได้ผูกใบงานออกแบบ — กด "เลือกใบงานอื่น…" เพื่อค้นใบงาน</p>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-slate-400">กำลังโหลดรูปจากใบงาน…</p>
      ) : err ? (
        <p className="py-8 text-center text-sm text-rose-600">{err}</p>
      ) : imgs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">ใบงานนี้ยังไม่มีรูป</p>
      ) : (
        <div className="grid max-h-[400px] gap-2 overflow-auto pr-1" style={{ gridTemplateColumns: grid }}>
          {imgs.map((img) => sheet && <div key={img.key}>{renderTile(designSheetImageAsset(img, sheet))}</div>)}
        </div>
      )}
      <p className="text-[11px] text-slate-400">รวมรูปแกลเลอรี · รายละเอียดงาน · คอมเมนต์ลูกค้า ของใบงาน</p>

      <DesignSheetPickerModal open={pickOpen} onClose={() => setPickOpen(false)} title="เลือกใบงานออกแบบ" confirmText="ดูรูปของใบงานนี้"
        onConfirm={(s) => { setExtra((cur0) => [...cur0.filter((x) => x.id !== s.id), { id: s.id, code: s.code, name: s.name }]); setCur(s.id); setPickOpen(false); }} />
    </div>
  );
}
