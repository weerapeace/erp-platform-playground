"use client";

// ============================================================
// คิวรอตรวจ/อนุมัติ (ของกลางในโมดูล) — ตารางงานย่อยที่ส่งมา + popup ดูรูป/อนุมัติ/ตีกลับ
// popup: เรียงลำดับรูป (↑↓) · เลือกปลายทาง Parent/SKU · ยืนยันก่อนอนุมัติ (รูปย้ายเข้าอัลบั้มสินค้า)
// ใช้ทั้งในหน้า /tasks/review และฝังในหน้าภาพรวม (กดการ์ด "รอตรวจ/อนุมัติ")
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ImageLightbox } from "@/components/image-lightbox";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import type { SkuPickerValue } from "@/components/pickers";
import { r2ImageUrl } from "@/lib/r2-image";
import { apiFetch } from "@/lib/api";
import { AssigneeStack } from "./assignee-avatar";
import { listReviewQueue, updateSubtask, type ReviewQueueItem } from "./data";
import { useT } from "@/components/i18n";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };
type Img = { r2_key: string; file_name: string | null };
type Dest = { id: string; code: string };

export function ReviewQueueView({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [lb, setLb] = useState(-1);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  // สถานะ popup ที่แก้ได้ (เรียงรูป / ปลายทาง / ยืนยันอนุมัติ)
  const [imgs, setImgs] = useState<Img[]>([]);
  const [destParents, setDestParents] = useState<Dest[]>([]);
  const [destSkus, setDestSkus] = useState<Dest[]>([]);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  // รูปเดิมในสินค้า (แกลเลอรีจริง) ต่อปลายทาง — โชว์ให้ผู้ตรวจเห็นก่อนอนุมัติ · tk = "parent:<id>"/"sku:<id>"
  const [destGalleries, setDestGalleries] = useState<Record<string, { r2_key: string }[]>>({});
  const [galLb, setGalLb] = useState<{ images: { url: string; label: string | null }[]; index: number }>({ images: [], index: -1 });   // ซูมรูปเดิมในสินค้า (แยกจาก imgs งานส่ง)

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random(); setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => { try { setItems(await listReviewQueue()); } catch (e) { pushToast("error", (e as Error).message); setItems([]); } }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  // เปิดงาน → โหลดค่าเริ่มต้นลงสถานะที่แก้ได้
  const openItem = (r: ReviewQueueItem) => {
    setActive(r);
    setImgs(r.images ?? []);
    setDestParents(r.dest?.parents ?? []);
    setDestSkus(r.dest?.skus ?? []);
    setConfirmApprove(false);
    setLb(-1);
    setDestGalleries({});
    // ดึง "รูปเดิมในสินค้า" (แกลเลอรีจริง) ของทุกปลายทาง มาโชว์
    const fetchGal = (owner: string) => apiFetch(`/api/creative-tasks/${r.task_id}/subtasks?gallery=${owner}`).then((x) => x.json())
      .then((gj) => { if (gj.galleries) setDestGalleries((prev) => ({ ...prev, ...(gj.galleries as Record<string, { r2_key: string }[]>) })); }).catch(() => {});
    for (const p of r.dest?.parents ?? []) void fetchGal(`parent_sku:${p.id}`);
    for (const s of r.dest?.skus ?? []) void fetchGal(`product_sku:${s.id}`);
  };
  const closeItem = () => { setActive(null); setLb(-1); setConfirmApprove(false); };

  // บันทึกปลายทาง + ลำดับรูป ลงงานย่อย (best-effort) — คงค่า sku_images เดิมไว้
  const persist = useCallback((next: { parents?: Dest[]; skus?: Dest[]; order?: string[] }) => {
    if (!active) return;
    const ex = active.image_sync_targets ?? {};
    const body = {
      ...ex,
      parent_ids: (next.parents ?? destParents).map((p) => p.id),
      sku_ids: (next.skus ?? destSkus).map((s) => s.id),
      image_order: next.order ?? imgs.map((im) => im.r2_key),
    };
    updateSubtask(active.task_id, active.id, { image_sync_targets: body }).catch(() => {});
  }, [active, destParents, destSkus, imgs]);

  const moveImg = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= imgs.length) return;
    const next = imgs.slice(); [next[i], next[j]] = [next[j], next[i]];
    setImgs(next); persist({ order: next.map((im) => im.r2_key) });
  };
  const onAddSkus = (skus: SkuPickerValue[]) => {
    const merged = [...destSkus];
    for (const s of skus) { const id = String(s.id); if (!merged.some((x) => x.id === id)) merged.push({ id, code: String(s.code ?? s.name ?? id) }); }
    setDestSkus(merged); persist({ skus: merged }); setPickOpen(false);
  };
  const removeSku = (id: string) => { const next = destSkus.filter((s) => s.id !== id); setDestSkus(next); persist({ skus: next }); };
  const removeParent = (id: string) => { const next = destParents.filter((p) => p.id !== id); setDestParents(next); persist({ parents: next }); };

  const act = async (status: string, comment?: string) => {
    if (!active) return; setBusy(true);
    try {
      await updateSubtask(active.task_id, active.id, comment !== undefined ? { status, comment } : { status });
      pushToast("success", status === "approved" ? t("อนุมัติแล้ว — รูปเข้าอัลบั้มสินค้าแล้ว", "Approved — images sent to product albums") : t("ส่งกลับให้แก้แล้ว", "Sent back for revision"));
      closeItem(); await load(); onChanged?.();
    } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const revise = () => { const r = window.prompt(t("เหตุผลที่ขอแก้ (ส่งให้ผู้ทำ)", "Reason for revision")); if (r === null) return; act("revision_requested", r); };
  const onApprove = () => { if (confirmApprove) act("approved"); else setConfirmApprove(true); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase(); const list = items ?? [];
    if (!q) return list;
    return list.filter((r) => [r.task_no, r.task_title, r.title, r.brand_label].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [items, search]);

  const lbImages = imgs.map((im) => ({ url: r2ImageUrl(im.r2_key, 1600) ?? "", label: im.file_name }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ค้นหา เลขงาน/ชื่องาน/งานย่อย/แบรนด์…", "Search task/subtask/brand…")} className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-72 max-w-full" />
        <span className="text-sm text-slate-400">{rows.length} {t("รายการ", "items")}</span>
      </div>
      {items === null ? <div className="py-16 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
        : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-slate-600 font-medium">{t("ไม่มีงานรอตรวจ", "Nothing awaiting review")}</p>
          </div>
        ) : (() => {
          const stMeta = (s: string) => s === "approved" ? { label: t("อนุมัติแล้ว", "Approved"), cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
            : s === "revision_requested" ? { label: t("ขอแก้", "Revision"), cls: "bg-orange-50 text-orange-700 border-orange-200" }
            : { label: t("รออนุมัติ", "Pending"), cls: "bg-amber-50 text-amber-700 border-amber-200" };
          const pending = rows.filter((r) => r.status !== "approved");
          const approved = rows.filter((r) => r.status === "approved");
          const groupTable = (title: string, list: ReviewQueueItem[]) => list.length === 0 ? null : (
            <div key={title} className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-600">{title} <span className="text-slate-400 font-normal">({list.length})</span></p>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">{t("งาน", "Task")}</th>
                      <th className="text-left font-medium px-3 py-2">{t("งานย่อย", "Subtask")}</th>
                      <th className="text-left font-medium px-3 py-2">{t("สถานะ", "Status")}</th>
                      <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">{t("แบรนด์", "Brand")}</th>
                      <th className="text-left font-medium px-3 py-2 hidden md:table-cell">{t("ผู้รับผิดชอบ", "Assignee")}</th>
                      <th className="text-left font-medium px-3 py-2">{t("รูป", "Images")}</th>
                      <th className="text-right font-medium px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => { const sm = stMeta(r.status); return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-3 py-2 align-top">
                          <a href={`/tasks?task=${r.task_id}`} title={t("เปิดรายละเอียดงาน", "Open task")} className="block hover:text-violet-700">
                            <div className="font-mono text-[11px] text-slate-400">{r.task_no}</div>
                            <div className="text-slate-700 line-clamp-1 hover:underline">{r.task_title}</div>
                          </a>
                        </td>
                        <td className="px-3 py-2 align-top text-slate-700">{r.title}</td>
                        <td className="px-3 py-2 align-top"><span className={`inline-flex text-[11px] font-medium border rounded-full px-2 py-0.5 ${sm.cls}`}>{sm.label}</span></td>
                        <td className="px-3 py-2 align-top hidden sm:table-cell">{r.brand_label ? <span className="inline-flex items-center gap-1 text-xs text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: r.brand_color || "#cbd5e1" }} />{r.brand_label}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 align-top hidden md:table-cell">{r.assignees.length ? <AssigneeStack list={r.assignees} size={22} /> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 align-top">
                          {r.images.length ? (
                            <button onClick={() => openItem(r)} className="inline-flex items-center gap-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r2ImageUrl(r.images[0].r2_key, 80) ?? ""} alt="" className="h-9 w-9 rounded object-cover border border-slate-200" />
                              {r.images.length > 1 && <span className="text-[11px] text-slate-400">+{r.images.length - 1}</span>}
                            </button>
                          ) : <span className="text-xs text-slate-300">{t("ไม่มีรูป", "none")}</span>}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <button onClick={() => openItem(r)} className="h-8 px-3 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600">🔎 {t("ดูงาน", "View")}</button>
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            </div>
          );
          return <div className="space-y-4">{groupTable(`🟡 ${t("รอตรวจ", "Pending review")}`, pending)}{groupTable(`✅ ${t("อนุมัติแล้ว", "Approved")}`, approved)}</div>;
        })()}

      {active && (
        <ERPModal open onClose={closeItem} size="lg"
          title={`${t("ตรวจงาน", "Review")}: ${active.title}`}
          footer={<>
            <button onClick={closeItem} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={revise} disabled={busy} className="h-9 px-4 text-sm font-medium text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-50 disabled:opacity-50">↩︎ {active.status === "approved" ? t("ย้อน/ตีกลับแก้", "Revert / Return") : t("ตีกลับแก้", "Return")}</button>
            {active.status === "approved"
              ? <span className="h-9 px-4 inline-flex items-center text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">✓ {t("อนุมัติแล้ว", "Approved")}</span>
              : <button onClick={onApprove} disabled={busy} className={`h-9 px-5 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${confirmApprove ? "bg-emerald-700 hover:bg-emerald-800 ring-2 ring-emerald-300" : "bg-emerald-600 hover:bg-emerald-700"}`}>✓ {confirmApprove ? t("ยืนยันอนุมัติ", "Confirm approve") : t("อนุมัติ", "Approve")}</button>}
          </>}>
          <div className="space-y-3">
            <div className="text-sm text-slate-500"><span className="font-mono text-xs">{active.task_no}</span> · {active.task_title}{active.brand_label ? ` · ${active.brand_label}` : ""}</div>

            {/* รายละเอียดงาน (งานย่อย + งานหลัก) — โชว์ถ้ามี */}
            {(active.description?.trim() || active.task_desc?.trim()) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5 text-sm">
                {active.description?.trim() && <div><p className="text-[11px] font-semibold text-slate-400 mb-0.5">📝 {t("รายละเอียดงานย่อย", "Subtask details")}</p><p className="text-slate-600 whitespace-pre-wrap">{active.description}</p></div>}
                {active.task_desc?.trim() && <div className={active.description?.trim() ? "border-t border-slate-200 pt-1.5" : ""}><p className="text-[11px] font-semibold text-slate-400 mb-0.5">📋 {t("รายละเอียดงานหลัก", "Task details")}</p><p className="text-slate-500 whitespace-pre-wrap">{active.task_desc}</p></div>}
              </div>
            )}

            {/* รูป — เรียงลำดับได้ (↑↓ = ลำดับในอัลบั้มสินค้าตอนอนุมัติ) */}
            {imgs.length ? (
              <div>
                <p className="text-xs text-slate-400 mb-1">{t("รูป (ลากลำดับด้วยปุ่ม ◀▶ — ลำดับนี้จะเป็นลำดับในอัลบั้มสินค้า)", "Images (reorder with ◀▶ — this is the album order)")}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {imgs.map((im, i) => (
                    <div key={im.r2_key} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2ImageUrl(im.r2_key, 400) ?? ""} alt={im.file_name ?? ""} onClick={() => setLb(i)} title={t("กดดูเต็มจอ", "Click to view full")} className="w-full h-28 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                      <span className="absolute top-1 left-1 h-5 min-w-5 px-1 rounded-full bg-black/55 text-white text-[10px] flex items-center justify-center">{i + 1}</span>
                      <div className="absolute bottom-1 left-1 right-1 flex justify-between opacity-0 group-hover:opacity-100">
                        <button onClick={(e) => { e.stopPropagation(); moveImg(i, -1); }} disabled={i === 0} title={t("เลื่อนซ้าย", "Move left")} className="h-6 w-6 rounded-full bg-white/90 text-slate-700 text-xs shadow disabled:opacity-30 hover:text-violet-700">◀</button>
                        <button onClick={(e) => { e.stopPropagation(); moveImg(i, 1); }} disabled={i === imgs.length - 1} title={t("เลื่อนขวา", "Move right")} className="h-6 w-6 rounded-full bg-white/90 text-slate-700 text-xs shadow disabled:opacity-30 hover:text-violet-700">▶</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-slate-400 italic">{t("งานย่อยนี้ไม่ได้แนบรูป", "No images attached")}</p>}

            {/* ปลายทางรูป — Parent SKU + SKU (เลือกได้) */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500">📦 {t("อนุมัติแล้วรูปจะเข้าอัลบั้มของ", "On approval, images go to")}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400 w-14">Parent</span>
                {destParents.length ? destParents.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full pl-2 pr-1 py-0.5">{p.code}<button onClick={() => removeParent(p.id)} className="text-slate-400 hover:text-red-500">✕</button></span>
                )) : <span className="text-xs text-slate-300">{t("— ไม่มี", "— none")}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400 w-14">SKU</span>
                {destSkus.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full pl-2 pr-1 py-0.5">{s.code}<button onClick={() => removeSku(s.id)} className="text-slate-400 hover:text-red-500">✕</button></span>
                ))}
                <button onClick={() => setPickOpen(true)} className="h-7 px-2 text-xs font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ {t("เลือก SKU", "Add SKU")}</button>
              </div>
              {!destParents.length && !destSkus.length && <p className="text-[11px] text-amber-600">⚠ {t("ยังไม่มีปลายทาง — เลือกอย่างน้อย 1 ที่ ไม่งั้นรูปจะไม่เข้าอัลบั้มสินค้า", "No destination — pick at least one or images won't reach product albums")}</p>}
            </div>

            {/* รูปที่ลงไว้ในสินค้าตอนนี้ (แกลเลอรีจริงของแต่ละ Parent/SKU) */}
            {(() => {
              const dests = [...destParents.map((p) => ({ tk: `parent:${p.id}`, code: p.code })), ...destSkus.map((s) => ({ tk: `sku:${s.id}`, code: s.code }))];
              if (!dests.length) return null;
              return (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500">🖼 {t("รูปที่ลงไว้ในสินค้าตอนนี้", "Current images in the products")}</p>
                  {dests.map((d) => { const g = destGalleries[d.tk] ?? []; return (
                    <div key={d.tk}>
                      <p className="text-[10px] font-mono text-slate-500 bg-slate-100 inline-block px-1.5 py-0.5 rounded mb-1">{d.code} <span className="text-slate-400">({g.length})</span></p>
                      {g.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {g.map((im, i) => (
                            <div key={i} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r2ImageUrl(im.r2_key, 160) ?? ""} alt="" onClick={() => setGalLb({ images: g.map((x) => ({ url: r2ImageUrl(x.r2_key, 1600) ?? "", label: d.code })), index: i })} title={t("กดดูเต็มจอ", "Click to view full")} className="h-12 w-12 rounded object-cover border border-slate-200 cursor-zoom-in" />
                              <span className="absolute -top-1 -left-1 bg-slate-700 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{i + 1}</span>
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-[11px] text-slate-300 italic">{t("ยังไม่มีรูป", "none yet")}</span>}
                    </div>
                  ); })}
                </div>
              );
            })()}

            {confirmApprove && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                {t("กด\"ยืนยันอนุมัติ\" อีกครั้ง — รูป", "Click \"Confirm approve\" again — ")}{imgs.length} {t("รูปจะถูกย้ายเข้าอัลบั้มสินค้าข้างบน (ย้อนกลับยาก)", "image(s) will move into the product albums above (hard to undo)")}
              </p>
            )}
          </div>
        </ERPModal>
      )}
      <ImageLightbox images={lbImages} index={lb} onClose={() => setLb(-1)} onIndex={setLb} />
      <ImageLightbox images={galLb.images} index={galLb.index} onClose={() => setGalLb((s) => ({ ...s, index: -1 }))} onIndex={(i) => setGalLb((s) => ({ ...s, index: i }))} />
      <SkuMultiPickerModal open={pickOpen} onClose={() => setPickOpen(false)} onConfirm={onAddSkus} excludeIds={destSkus.map((s) => s.id)} />

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((x) => <div key={x.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${x.type === "success" ? "bg-emerald-600" : x.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{x.message}</div>)}
      </div>
    </div>
  );
}
