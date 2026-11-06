"use client";

/**
 * ParentSkuViewModal + ParentSkuCardView (ของกลาง) — รุ่นสินค้าแบบดูอย่างเดียว
 *   ป๊อป: รูปทั้งหมด (กดขยาย = ImageLightbox) · สเปค (เฉพาะช่องที่มีข้อมูล) · BOM — เลือก SKU ลูกแล้วโชว์ตารางวัตถุดิบ
 *   ⚠️ ไม่มีราคา/ต้นทุน · ไม่มีปุ่มไปหน้า SKU / BOM โดยตั้งใจ (เจ้าของขอปิดทางออกจากแอปตั๋วงาน 2026-11-06) — มีแค่ "ปิด"
 *
 *   <ParentSkuCardView card={card} onOpen={canOpen ? () => setOpen(true) : undefined} />   onOpen ไม่ส่ง = กดไม่ได้
 *   <ParentSkuViewModal url={`/api/pattern-tickets/${id}/parent-sku`} onClose={…} />
 *   url = endpoint ที่คืน { data: ParentSkuView } — แต่ละโมดูลตั้งด่านสิทธิ์ของตัวเอง
 * ชนิดข้อมูล lib/parent-sku-view · ฝั่งเซิร์ฟเวอร์ lib/parent-sku-view-server
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { ErrorState, LoadingState } from "@/components/state-views";
import { ImageLightbox } from "@/components/image-lightbox";
import { apiFetch } from "@/lib/api";
import type { ParentSkuCard, ParentSkuView } from "@/lib/parent-sku-view";

const fmtNum = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));

export function ParentSkuCardView({ card, onOpen }: { card: ParentSkuCard; onOpen?: () => void }) {
  const t = useT();
  const body = (
    <>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-slate-400">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {card.cover_url ? <img src={card.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon name="image" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{card.name}</span>
        <span className="block truncate text-xs text-slate-500">
          {card.code}{card.sku_count ? ` · ${t(`${card.sku_count} SKU`, `${card.sku_count} SKUs`)}` : ""}
        </span>
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${card.bom_count ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {card.bom_count ? t(`มี BOM ${card.bom_count} SKU`, `BOM for ${card.bom_count} SKU(s)`) : t("ยังไม่มี BOM", "No BOM yet")}
        </span>
      </span>
      {onOpen && <Icon name="view" className="shrink-0 text-slate-400" />}
    </>
  );
  const cls = "flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left sm:max-w-sm";
  return onOpen
    ? <button type="button" onClick={onOpen} className={`${cls} transition hover:border-slate-300 hover:shadow-sm`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

export function ParentSkuViewModal({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useT();
  const [d, setD] = useState<ParentSkuView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [sku, setSku] = useState<string | null>(null);
  const [lb, setLb] = useState(-1);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    apiFetch(url).then(async (res) => {
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!alive) return;
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      const v = j.data as ParentSkuView;
      setD(v);
      setSku((cur) => cur ?? (v.children.find((c) => c.bom)?.id ?? v.children[0]?.id ?? null));   // เริ่มที่ SKU แรกที่มี BOM
    }).catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url, reload]);

  const child = d?.children.find((c) => c.id === sku) ?? null;

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="parent-sku-view"
      title={d ? `${d.code} ${d.name}`.trim() : t("รุ่นสินค้า", "Product model")}
      description={d?.name_en ?? undefined}
      footer={<div className="flex w-full justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ปิด", "Close")}</button></div>}>
      {loading && !d ? <LoadingState label={t("กำลังโหลดรุ่นสินค้า…", "Loading product model…")} />
        : err ? <ErrorState title={t("เปิดรุ่นสินค้าไม่สำเร็จ", "Couldn't open the product model")} hint={err} onRetry={() => setReload((n) => n + 1)} />
        : d && (
          <div className="flex flex-col gap-5 p-1">
            <div><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"><Icon name="view" /> {t("ดูอย่างเดียว", "View only")}</span></div>

            {/* รูป */}
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-slate-500">{t("รูป", "Images")} ({d.images.length})</h3>
              {d.images.length ? (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
                  {d.images.map((u, i) => (
                    <button key={u + i} type="button" onClick={() => setLb(i)} className={`overflow-hidden rounded-lg bg-slate-50 ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" loading="lazy" className="aspect-square h-full w-full object-cover transition hover:scale-[1.02]" />
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-400">{t("ยังไม่มีรูป", "No images yet")}</p>}
            </section>

            {/* สเปค */}
            {d.specs.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-xs font-medium text-slate-500">{t("สเปคสินค้า", "Specs")}</h3>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
                  {d.specs.map((s) => (
                    <div key={s.th} className="contents">
                      <dt className="text-slate-500">{t(s.th, s.en)}</dt>
                      <dd className="whitespace-pre-wrap text-slate-800">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* BOM ต่อ SKU ลูก */}
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-slate-500">BOM {d.children.length > 1 ? t("— เลือก SKU", "— pick a SKU") : ""}</h3>
              {!d.children.length ? <p className="text-sm text-slate-400">{t("รุ่นนี้ยังไม่มี SKU", "This model has no SKUs yet")}</p> : (
                <>
                  {d.children.length > 1 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {d.children.map((c) => (
                        <button key={c.id} type="button" onClick={() => setSku(c.id)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${sku === c.id ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                          {c.label}{!c.bom && <span className="text-slate-400">·{t("ไม่มีสูตร", "no BOM")}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {child && (child.bom ? (
                    child.bom.lines.length ? (
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[480px] text-sm">
                          <thead className="bg-slate-50 text-xs text-slate-500">
                            <tr>
                              <th className="px-2.5 py-1.5 text-left font-medium">{t("วัตถุดิบ", "Material")}</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">{t("จำนวน", "Qty")}</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">{t("หน่วย", "Unit")}</th>
                              <th className="px-2.5 py-1.5 text-left font-medium">{t("ขนาดตัด (ซม.)", "Cut size (cm)")}</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">{t("ชิ้น", "Pcs")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {child.bom.lines.map((l, i) => (
                              <tr key={i}>
                                <td className="px-2.5 py-1.5">
                                  <span className="text-slate-800">{l.name}</span>
                                  {l.optional && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">{t("ไม่บังคับ", "optional")}</span>}
                                  {l.code && l.code !== l.name && <span className="block text-[11px] text-slate-400">{l.code}</span>}
                                </td>
                                <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNum(l.qty)}</td>
                                <td className="px-2.5 py-1.5 text-slate-600">{l.uom ?? "—"}</td>
                                <td className="px-2.5 py-1.5 tabular-nums text-slate-600">{l.cut_width !== null || l.cut_length !== null ? `${fmtNum(l.cut_width)} × ${fmtNum(l.cut_length)}` : "—"}</td>
                                <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNum(l.pieces)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="text-sm text-slate-400">{t("สูตรนี้ยังไม่มีรายการวัตถุดิบ", "This BOM has no materials yet")}</p>
                  ) : <p className="text-sm text-slate-400">{t(`ยังไม่มีสูตร BOM ของ ${child.code}`, `No BOM for ${child.code} yet`)}</p>)}
                </>
              )}
            </section>
          </div>
        )}
      {d && lb >= 0 && <ImageLightbox images={d.images.map((u) => ({ url: u, label: d.name }))} index={lb} onClose={() => setLb(-1)} onIndex={setLb} />}
    </ERPModal>
  );
}
