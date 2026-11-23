"use client";

// ตัวอย่างลองเล่นของของกลาง (โชว์ใน drawer รายละเอียดหน้า /admin/plugins) — key = key ในทะเบียน lib/shared-parts-registry
// เพิ่มของกลางตัวไหนก็ใส่ในแผนที่ PART_PREVIEWS ด้านล่าง (โหลดเฉพาะตอนเปิดดู)
import { useState, type ComponentType } from "react";
import { useGalleryColumns, CardGrid, CardViewBar, GALLERY_LABEL } from "@/components/gallery-columns";
import { EmptyState } from "@/components/state-views";
import type { MiniLayout } from "@/components/mini-table/layout-switch";
import { TextStyleControl } from "@/components/text-style-control";
import { applyListPrefix, textStyleCss, type TextStyle } from "@/lib/text-style";

const DEMO_ITEMS = [
  { code: "PIN6-S#G", name: "หมุด 6x6 หัวเรียบ สีทอง", price: 8 },
  { code: "ZIP-M5#G438", name: "ซิปฟันเหล็ก #5 ฟันทอง สีแดง", price: 27 },
  { code: "ZH-M5-G", name: "หัวซิปฟันเหล็ก #5 สีทอง", price: 59 },
  { code: "L006-5#G", name: "หางซิป #5 สีทอง", price: 139 },
  { code: "ZIP-M5#G263", name: "ซิปฟันเหล็ก #5 สีเขียวขี้ม้า", price: 22 },
  { code: "FAB-CK-GR", name: "ผ้าสก็อต เขียว", price: 95 },
  { code: "FAB-CK-RD", name: "ผ้าสก็อต แดง", price: 95 },
  { code: "STR-BK", name: "สายกระเป๋า ดำ", price: 45 },
  { code: "DR-25", name: "ห่วง D 25mm", price: 3 },
  { code: "SNP-01", name: "กระดุมแป๊ก", price: 2 },
  { code: "ZIP-N3", name: "ซิปไนลอน #3", price: 12 },
  { code: "BKL-20", name: "หัวเข็มขัด 20mm", price: 18 },
];

/** มุมมองการ์ดกลาง — ลองกด − / + หรือ Ctrl + หมุนลูกกลิ้งบนการ์ด · สลับสถานะ โหลด/ว่าง/พลาด */
function GalleryColumnsPreview() {
  const gallery = useGalleryColumns("admin-plugins-preview", 6);
  const [view, setView] = useState<MiniLayout>("cards");
  const [state, setState] = useState<"ok" | "loading" | "empty" | "error">("ok");
  const chip = (k: typeof state, label: string) => (
    <button type="button" onClick={() => setState(k)} aria-pressed={state === k}
      className={`h-7 rounded-md border px-2 text-xs ${state === k ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{label}</button>
  );
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span>ลองสถานะ:</span>{chip("ok", "มีข้อมูล")}{chip("loading", "กำลังโหลด")}{chip("empty", "ว่าง")}{chip("error", "โหลดพลาด")}
      </div>
      <CardViewBar gallery={gallery} count={`${DEMO_ITEMS.length} รายการ`} view={view} onView={setView} />
      {view === "table" ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">มุมมองตารางของแต่ละหน้า (DataTable / MiniTable) แสดงตรงนี้</p>
      ) : (
        <CardGrid gallery={gallery} loading={state === "loading"} error={state === "error"} onRetry={() => setState("ok")}
          isEmpty={state === "empty"} empty={<EmptyState icon="🏷️" title="ไม่พบรายการ" hint="ลองเปลี่ยนคำค้นหรือตัวกรอง" onClearFilters={() => setState("ok")} />}>
          {DEMO_ITEMS.map((it) => (
            <div key={it.code} title={`${it.code} · ${it.name}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex aspect-[5/4] items-center justify-center bg-slate-100 text-2xl text-slate-300">🏷️</div>
              <div className="p-2">
                <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">{it.code}</span>
                <p className={`${GALLERY_LABEL} mt-1 line-clamp-2 text-[12px] text-slate-700`}>{it.name}</p>
                <p className={`${GALLERY_LABEL} mt-1 text-[12px] font-medium text-slate-800`}>฿{it.price.toLocaleString("th-TH")}</p>
              </div>
            </div>
          ))}
        </CardGrid>
      )}
      <p className="mt-2 text-[11px] text-slate-400">Ctrl (⌘) + หมุนลูกกลิ้งบนการ์ด = ย่อ/ขยาย · 12 ใบต่อแถวขึ้นไปซ่อนชื่อ (ชี้ค้างดูชื่อได้) · จอแคบลดจำนวนเอง</p>
    </div>
  );
}

/** ตัวตั้งค่าตัวอักษรกลาง — กดไอคอนแล้วเลือก ข้อความตัวอย่างเปลี่ยนทันที */
const DEMO_FONTS = [{ value: "Sarabun", label: "Sarabun", css: "Sarabun, sans-serif" }, { value: "Kanit", label: "Kanit", css: "Kanit, sans-serif" }, { value: "Prompt", label: "Prompt", css: "Prompt, sans-serif" }];
function TextStylePreview() {
  const [v, setV] = useState<TextStyle>({ size: 16, color: "#1e293b", list: "bullet" });
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <TextStyleControl value={v} onChange={setV} fonts={DEMO_FONTS} onReset={() => setV({ size: 16, color: "#1e293b" })} />
      <div className="rounded-lg border border-slate-200 bg-white p-3 whitespace-pre-line" style={textStyleCss(v)}>{applyListPrefix("ถ่ายนางแบบถือ ฉากขาว\nโชว์ซิปด้านใน", v.list)}</div>
    </div>
  );
}

export const PART_PREVIEWS: Record<string, ComponentType> = {
  "gallery-columns": GalleryColumnsPreview,
  "text-style-control": TextStylePreview,
};

/** ส่วน "ลองเล่น" ใน drawer — ของกลางที่ยังไม่มีตัวอย่าง = ไม่แสดงอะไร */
export function PartPreview({ partKey }: { partKey: string }) {
  const Demo = PART_PREVIEWS[partKey];
  if (!Demo) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-400">ลองเล่น (ตัวอย่างจริงของของกลาง)</p>
      <Demo />
    </div>
  );
}
