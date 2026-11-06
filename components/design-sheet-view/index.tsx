"use client";

/**
 * DesignSheetViewModal (ของกลาง) — ป๊อปดู Design sheet แบบอ่านอย่างเดียว
 *   หัว: เลข · แบรนด์ · ชื่อ · สถานะ · ป้าย "ดูอย่างเดียว"
 *   รูปทั้งหมด (กดขยาย = ImageLightbox กลาง) · รายละเอียดงาน (HTML ผ่าน sanitizeRichHtml) · comment ลูกค้า (ใหม่ → เก่า + รูป)
 *   ⚠️ ไม่มีราคา/ตีราคา/เสนอราคา โดยตั้งใจ · ปุ่ม "เปิดในหน้า Design sheets" เฉพาะเมื่อ API บอก can_open_full
 *
 *   <DesignSheetViewModal url={`/api/pattern-tickets/${ticketId}/design-sheets/${sheetId}`} onClose={…} />
 *   url = endpoint ที่คืน { data: DesignSheetView, can_open_full } — แต่ละโมดูลตั้งด่านสิทธิ์ของตัวเอง (เช่น ตั๋วงาน Pattern)
 * ชนิดข้อมูล: lib/design-sheet-view · ฝั่งเซิร์ฟเวอร์: lib/design-sheet-view-server
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { ErrorState, LoadingState } from "@/components/state-views";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { apiFetch } from "@/lib/api";
import { openLink } from "@/lib/open-link";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { DS_STATUS } from "@/lib/design-sheets-meta";
import { fmtDate } from "@/lib/pattern-tickets";
import type { DesignSheetView } from "@/lib/design-sheet-view";

export function designSheetStatus(s: string) {
  const m = DS_STATUS[s];
  return m ? { label: m.label, cls: m.cls } : { label: s || "—", cls: "bg-slate-100 text-slate-600" };
}

export function DesignSheetViewModal({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useT();
  const [d, setD] = useState<DesignSheetView | null>(null);
  const [canFull, setCanFull] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [lb, setLb] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    apiFetch(url).then(async (res) => {
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!alive) return;
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setD(j.data as DesignSheetView); setCanFull(!!j.can_open_full);
    }).catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url, reload]);

  const detail = useMemo(() => sanitizeRichHtml(d?.detail_html), [d?.detail_html]);
  const st = d ? designSheetStatus(d.status) : null;
  const sheetImgs = (d?.images ?? []).map((u) => ({ url: u, label: d?.name }));

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="design-sheet-view"
      title={d ? `${d.code} ${d.name}`.trim() : t("Design sheet", "Design sheet")}
      description={d?.brand_name ? `${t("แบรนด์", "Brand")} ${d.brand_name}` : undefined}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {d && canFull && (
            <a href={openLink("/master/design-sheets", d.id)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <Icon name="open" /> {t("เปิดในหน้า Design sheets", "Open in Design sheets")}
            </a>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ปิด", "Close")}</button>
        </div>
      }>
      {loading && !d ? <LoadingState label={t("กำลังโหลด Design sheet…", "Loading design sheet…")} />
        : err ? <ErrorState title={t("เปิด Design sheet ไม่สำเร็จ", "Couldn't open the design sheet")} hint={err} onRetry={() => setReload((n) => n + 1)} />
        : d && (
          <div className="flex flex-col gap-5 p-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {st && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"><Icon name="view" /> {t("ดูอย่างเดียว", "View only")}</span>
            </div>

            {/* รูป */}
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-slate-500">{t("รูป", "Images")} ({d.images.length})</h3>
              {d.images.length ? (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {d.images.map((u, i) => (
                    <button key={u + i} type="button" onClick={() => setLb({ images: sheetImgs, index: i })}
                      className={`overflow-hidden rounded-lg bg-slate-50 ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" loading="lazy" className="aspect-square h-full w-full object-cover transition hover:scale-[1.02]" />
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-400">{t("ยังไม่มีรูป", "No images yet")}</p>}
            </section>

            {/* รายละเอียดงาน */}
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-slate-500">{t("รายละเอียดงาน", "Job details")}</h3>
              {detail.trim()
                ? <div className="tiptap-content text-sm leading-relaxed text-slate-800" dangerouslySetInnerHTML={{ __html: detail }} />
                : <p className="text-sm text-slate-400">{t("ไม่มีรายละเอียด", "No details")}</p>}
            </section>

            {/* comment ลูกค้า */}
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-slate-500">{t("Comment ลูกค้า", "Customer comments")} ({d.comments.length})</h3>
              {d.comments.length ? (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {d.comments.map((c) => (
                    <li key={c.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-2">
                      <span className="text-xs tabular-nums text-slate-400">{c.date ? fmtDate(c.date) : "—"}</span>
                      <div className="min-w-0">
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                        {c.images.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {c.images.map((u, i) => (
                              <button key={u + i} type="button" onClick={() => setLb({ images: c.images.map((x) => ({ url: x })), index: i })} className="overflow-hidden rounded-md bg-slate-50">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt="" loading="lazy" className="h-14 w-14 object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-400">{t("ยังไม่มี comment", "No comments yet")}</p>}
            </section>
          </div>
        )}
      {lb && <ImageLightbox images={lb.images} index={lb.index} onClose={() => setLb(null)} onIndex={(i) => setLb((x) => x && { ...x, index: i })} />}
    </ERPModal>
  );
}
