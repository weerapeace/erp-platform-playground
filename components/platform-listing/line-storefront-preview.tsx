"use client";

/**
 * ดูแบบหน้าร้าน LINE (จำลองหน้าสินค้าบนมือถือ) — ใช้ในตัวช่วยลงสินค้า ขั้นยืนยัน (เจ้าของขอ 2026-11-10 "อยากได้ preview เหมือนเปิดจากร้านค้า")
 * ข้อมูล = GET /api/line-shopping/create-product?parent_sku_id= (ของกลาง lib/line-create-payload — ชุดเดียวกับที่จะส่งจริง)
 * เป็นหน้าจำลอง: หน้าตาไม่เหมือน LINE 100% แต่ข้อมูล (รูป ชื่อ ราคา ส่วนลด ตัวเลือก สต๊อก ของขวัญ รายละเอียด+รูป) ตรงกับที่ส่ง
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import type { LineCreatePreview } from "@/lib/line-create-payload";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

export function LineStorefrontPreview({ parentId }: { parentId: string }) {
  const [pv, setPv] = useState<LineCreatePreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [img, setImg] = useState(0);
  const [opt, setOpt] = useState<string[]>([]);   // ค่าตัวเลือกที่กดอยู่ (ตามลำดับมิติ)

  useEffect(() => {
    let alive = true;
    setPv(null); setErr(null); setImg(0); setOpt([]);
    apiFetch(`/api/line-shopping/create-product?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json())
      .then((j: { preview: LineCreatePreview | null; error: string | null }) => {
        if (!alive) return;
        if (j.error || !j.preview) { setErr(j.error || "โหลดไม่สำเร็จ"); return; }
        setPv(j.preview);
        setOpt(j.preview.variants[0]?.options ?? []);
      })
      .catch((e) => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [parentId]);

  // ค่าตัวเลือกแต่ละมิติ (ไม่ซ้ำ ตามลำดับที่เจอ)
  const dims = useMemo(() => (pv ? pv.option_names.map((name, i) => ({ name, values: [...new Set(pv.variants.map((v) => v.options[i]).filter(Boolean))] })) : []), [pv]);
  const chosen = useMemo(() => pv?.variants.find((v) => v.options.every((o, i) => !opt[i] || o === opt[i])) ?? pv?.variants[0] ?? null, [pv, opt]);
  const pays = (pv?.variants ?? []).map((v) => v.price - v.discount).filter((n) => n > 0);

  if (err) return <ErrorState hint={err} />;
  if (!pv) return <LoadingState label="กำลังจำลองหน้าร้าน..." />;
  const full = chosen?.price ?? 0;
  const pay = chosen ? chosen.price - chosen.discount : 0;
  const off = full > 0 && pay < full ? Math.round(((full - pay) / full) * 100) : 0;
  const imgs = pv.images.keys;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-[300px] overflow-hidden rounded-[28px] border-[6px] border-slate-800 bg-white shadow-sm">
        {/* รูป */}
        <div className="relative aspect-square bg-slate-100">
          {imgs[img] ? <img src={r2ImageUrl(imgs[img], 700) ?? ""} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">ไม่มีรูป</div>}
          {imgs.length > 1 && <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 text-[11px] text-white">{img + 1}/{imgs.length}</span>}
        </div>
        {imgs.length > 1 && (
          <div className="flex gap-1 overflow-x-auto px-2 pt-2">
            {imgs.map((k, i) => (
              <button key={`${k}-${i}`} type="button" onClick={() => setImg(i)} className={`h-11 w-11 shrink-0 overflow-hidden rounded border ${i === img ? "border-emerald-500" : "border-slate-200"}`}>
                <img src={r2ImageUrl(k, 120) ?? ""} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2 px-3 py-3 text-sm">
          <div className="leading-snug text-slate-800">{pv.name.value || "(ไม่มีชื่อ)"}</div>
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-lg font-semibold text-rose-600">{pay ? baht(pay) : "—"}</span>
            {off > 0 && <><span className="text-xs text-slate-400 line-through">{baht(full)}</span><span className="rounded bg-rose-50 px-1 text-[11px] text-rose-600">-{off}%</span></>}
            {pays.length > 1 && Math.min(...pays) !== Math.max(...pays) && <span className="text-[11px] text-slate-400">({baht(Math.min(...pays))} – {baht(Math.max(...pays))})</span>}
          </div>
          {pv.gift.status !== "off" && (
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
              <Icon name="gift" />{pv.gift.status === "gift_only" ? "สินค้านี้ส่งเป็นของขวัญเท่านั้น" : "ส่งเป็นของขวัญได้"}{pv.gift.categories.length ? ` · ${pv.gift.categories.join(", ")}` : ""}
            </div>
          )}
          {dims.map((d, i) => (
            <div key={d.name}>
              <div className="mb-1 text-[11px] text-slate-500">{d.name}</div>
              <div className="flex flex-wrap gap-1">
                {d.values.map((val) => (
                  <button key={val} type="button" onClick={() => setOpt((o) => { const n = [...o]; n[i] = val; return n; })}
                    className={`rounded-md border px-2 py-0.5 text-xs ${opt[i] === val ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600"}`}>{val}</button>
                ))}
              </div>
            </div>
          ))}
          {chosen && <div className={`text-[11px] ${chosen.stock > 0 ? "text-slate-500" : "text-rose-600"}`}>{chosen.stock > 0 ? `มีสินค้า ${chosen.stock.toLocaleString()} ชิ้น` : "สินค้าหมด"}</div>}
          <div className="border-t border-slate-100 pt-2">
            <div className="mb-1 text-xs font-medium text-slate-700">รายละเอียดสินค้า</div>
            <div className="tiptap-content max-h-72 overflow-y-auto text-xs leading-relaxed text-slate-700 [&_img]:max-w-full [&_p]:my-0"
              dangerouslySetInnerHTML={{ __html: pv.description.value || "<p>(ไม่มีรายละเอียด)</p>" }} />
            {pv.desc_images.length > 0 && (
              <div className="mt-1 space-y-1">
                {pv.desc_images.map((k) => <img key={k} src={r2ImageUrl(k, 600) ?? ""} alt="" loading="lazy" className="w-full rounded" />)}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-slate-100 p-2">
          <span className="flex h-9 flex-1 items-center justify-center rounded-lg border border-emerald-500 text-xs text-emerald-700">หยิบใส่ตะกร้า</span>
          <span className="flex h-9 flex-1 items-center justify-center rounded-lg bg-emerald-500 text-xs text-white">ซื้อเลย</span>
        </div>
      </div>
      <p className="text-center text-[11px] text-slate-400">หน้าจำลองจากข้อมูลที่จะส่งจริง — หน้าตาบน LINE อาจต่างเล็กน้อย{pv.missing.length ? ` · ยังขาด: ${pv.missing.join(", ")}` : ""}</p>
    </div>
  );
}
