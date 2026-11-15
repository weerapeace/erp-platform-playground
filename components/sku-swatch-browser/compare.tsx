"use client";

/**
 * เทียบ 2 แผ่นคู่กัน (เต็มจอ) — เปิดจากรายการแผ่น โหมดเลือกหลายแผ่น (เลือก 2 แผ่น → "เทียบ 2 แผ่น")
 *   ซ้าย/ขวา: รูปแผ่น (ชี้ชิ้น = รหัส/ชื่อ/SKU) · แถบสี · ตารางเทียบ สเปก/ร้าน/ราคา/เงื่อนไข · "สีที่ใกล้กันที่สุด" (จับคู่ชิ้นข้ามแผ่นด้วย ΔE)
 *   ⚠ z-[140] เหมือนหน้าดูแผ่น
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { deltaE2000, hexToLab } from "@/lib/color-swatch";
import { ImageRegions } from "@/components/image-regions";
import type { SwatchDetail, SwatchSpot } from "@/app/api/sku-swatches/route";
import { swatchTitle } from "./viewer";
import { ColorStrip } from "./list-views";
import { fmtPrice } from "./info-panel";

const num = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("th-TH", { maximumFractionDigits: 2 }));
const chipNo = (c: string | null) => (c ? `-${c.split("-").pop()}` : "");

function BoardSide({ d, onOpen }: { d: SwatchDetail; onOpen: () => void }) {
  const [photoId, setPhotoId] = useState<string | null>(d.images[0]?.id ?? null);
  const photo = d.images.find((i) => i.id === photoId) ?? d.images[0] ?? null;
  const spots = d.spots.filter((s) => (s.image_id || d.images[0]?.id) === photo?.id);
  return (
    <div className="min-w-0 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-slate-800 truncate">{swatchTitle(d)}</div>
          <div className="font-mono text-[11px] text-slate-400">{d.code}</div>
        </div>
        <button type="button" onClick={onOpen} className="h-8 px-3 text-[12px] rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shrink-0">เปิดแผ่นนี้</button>
      </div>
      {d.images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {d.images.map((im, i) => (
            <button key={im.id || i} type="button" onClick={() => setPhotoId(im.id)} className={`shrink-0 w-16 h-11 rounded-md overflow-hidden border-2 ${im.id === photo?.id ? "border-indigo-500" : "border-transparent hover:border-slate-300"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r2ImageUrl(im.image_key, 160) ?? ""} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {photo ? (
        <div className="rounded-lg overflow-hidden bg-slate-100">
          <ImageRegions<SwatchSpot> src={r2ImageUrl(photo.image_key, 1600) ?? ""} regions={spots} mode="view" className="w-full"
            regionLabel={(r) => r.sku?.code ?? r.code ?? null}
            renderTooltip={(r) => (
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded shrink-0 ring-1 ring-white/30" style={{ background: r.color_hex ?? "#64748b" }} />
                <div className="min-w-0"><div className="font-mono text-[11px] text-amber-300">{r.code}</div><div className="truncate">{r.sku ? `${r.sku.code} · ${r.sku.name}` : r.name || "—"}</div></div>
              </div>
            )} />
        </div>
      ) : <div className="h-40 rounded-lg bg-slate-100 flex items-center justify-center text-sm text-slate-400">ไม่มีรูป</div>}
      <ColorStrip colors={d.chip_colors} className="h-3 rounded" />
    </div>
  );
}

export function SwatchCompare({ ids, onClose, onOpen }: { ids: [string, string]; onClose: () => void; onOpen: (id: string) => void }) {
  const [boards, setBoards] = useState<SwatchDetail[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map((id) => apiFetch(`/api/sku-swatches?id=${encodeURIComponent(id)}`).then((r) => r.json())))
      .then((js) => { if (!alive) return; const list = js.map((j) => j.swatch as SwatchDetail | undefined).filter((x): x is SwatchDetail => !!x); if (list.length < 2) setErr("โหลดแผ่นไม่ครบ"); setBoards(list); })
      .catch(() => { if (alive) setErr("โหลดแผ่นไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [ids]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // คู่สีที่ใกล้กันที่สุด: ชิ้นของแผ่นซ้าย → ชิ้นที่สีใกล้สุดของแผ่นขวา (ΔE ≤ 15) · เรียงใกล้สุดก่อน
  const pairs = useMemo(() => {
    if (!boards || boards.length < 2) return [];
    const [a, b] = boards;
    const bl = b.spots.map((s) => ({ s, lab: s.color_hex ? hexToLab(s.color_hex) : null })).filter((x) => x.lab);
    const out: { a: SwatchSpot; b: SwatchSpot; dE: number }[] = [];
    for (const sa of a.spots) {
      const la = sa.color_hex ? hexToLab(sa.color_hex) : null;
      if (!la) continue;
      let best: { s: SwatchSpot; d: number } | null = null;
      for (const x of bl) { const d = deltaE2000(la, x.lab!); if (!best || d < best.d) best = { s: x.s, d }; }
      if (best && best.d <= 15) out.push({ a: sa, b: best.s, dE: Math.round(best.d * 10) / 10 });
    }
    return out.sort((x, y) => x.dE - y.dE).slice(0, 24);
  }, [boards]);

  const rows: [string, (d: SwatchDetail) => string][] = [
    ["จำนวนชิ้น", (d) => `${d.spots.length} ชิ้น · ผูก SKU ${d.linked_count}`],
    ["วัสดุ", (d) => d.material ?? ""],
    ["น้ำหนัก", (d) => (d.weight != null ? `${num(d.weight)} ${d.weight_unit ?? ""}`.trim() : "")],
    ["หน้ากว้าง", (d) => (d.width_cm != null ? `${num(d.width_cm)} ซม.` : "")],
    ["ความหนา", (d) => (d.thickness_mm != null ? `${num(d.thickness_mm)} มม.` : "")],
    ["รหัสรุ่นของร้าน", (d) => d.supplier_model ?? ""],
    ["ร้านหลัก", (d) => d.main_supplier?.name ?? ""],
    ["ราคา", (d) => (d.can_cost ? (d.main_supplier?.price != null ? fmtPrice(d.main_supplier.price, d.main_supplier.currency, d.main_supplier.unit) : "") : "ไม่มีสิทธิ์ดู")],
    ["ขั้นต่ำ / ส่งกี่วัน", (d) => { const m = d.suppliers.find((s) => s.is_main) ?? d.suppliers[0]; return m ? [m.moq != null ? `ขั้นต่ำ ${num(m.moq)}${m.unit ? ` ${m.unit}` : ""}` : "", m.lead_days != null ? `ส่ง ${m.lead_days} วัน` : ""].filter(Boolean).join(" · ") : ""; }],
    ["ร้านทั้งหมด", (d) => d.suppliers.map((s) => s.name).join(", ")],
    ["แท็ก", (d) => d.tags.map((t) => t.name).join(", ")],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col bg-white">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-200 shrink-0">
        <span className="text-[15px] font-semibold text-slate-800 flex-1">เทียบ 2 แผ่น</span>
        <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500" title="ปิด (Esc)">✕</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 bg-slate-50">
        {err ? <div className="text-center py-16 text-sm text-rose-600">⚠ {err}</div>
          : !boards ? <div className="grid md:grid-cols-2 gap-4">{[0, 1].map((i) => <div key={i} className="h-80 rounded-xl bg-slate-200 animate-pulse" />)}</div>
          : (
            <div className="max-w-6xl mx-auto space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {boards.map((d) => <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-3"><BoardSide d={d} onOpen={() => onOpen(d.id)} /></div>)}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="bg-slate-50 text-slate-500"><th className="text-left font-medium px-3 py-2 w-40">หัวข้อ</th>{boards.map((d) => <th key={d.id} className="text-left font-medium px-3 py-2">{swatchTitle(d)}</th>)}</tr></thead>
                  <tbody>
                    {rows.map(([k, f]) => {
                      const vals = boards.map(f);
                      const diff = vals[0] !== vals[1];
                      return (
                        <tr key={k} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-500">{k}</td>
                          {vals.map((v, i) => <td key={i} className={`px-3 py-1.5 ${diff ? "text-slate-900 font-medium" : "text-slate-600"}`}>{v || <span className="text-slate-300">—</span>}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[13px] font-semibold text-slate-700 mb-1">สีที่ใกล้กันที่สุด <span className="font-normal text-[11.5px] text-slate-400">(ชิ้นของ {swatchTitle(boards[0])} เทียบกับชิ้นที่สีใกล้สุดของ {swatchTitle(boards[1])} · ค่าต่าง ≤ 2 แทบแยกไม่ออก)</span></div>
                {pairs.length === 0 ? <p className="text-[12px] text-slate-400">ไม่มีคู่สีที่ใกล้กัน (หรือชิ้นยังไม่มีสี)</p> : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {pairs.map((p) => (
                      <div key={p.a.id} className="flex items-center gap-1.5 rounded-lg border border-slate-100 px-2 py-1 text-[12px]">
                        <span className="w-5 h-5 rounded ring-1 ring-black/10 shrink-0" style={{ background: p.a.color_hex ?? "" }} />
                        <span className="font-mono text-slate-500">{chipNo(p.a.code)}</span>
                        <span className="text-slate-300">↔</span>
                        <span className="w-5 h-5 rounded ring-1 ring-black/10 shrink-0" style={{ background: p.b.color_hex ?? "" }} />
                        <span className="font-mono text-slate-500">{chipNo(p.b.code)}</span>
                        <span className="min-w-0 truncate text-slate-600">{p.a.name ?? ""}</span>
                        <span className={`ml-auto shrink-0 tabular-nums ${p.dE <= 2 ? "text-emerald-600 font-medium" : "text-slate-400"}`}>ต่าง {p.dE}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
      </div>
    </div>,
    document.body,
  );
}
