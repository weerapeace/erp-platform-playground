"use client";

/**
 * ป๊อป "ดึงชิ้นตัดจากสูตร BOM" ของหน้าคิดผ้า (/fabric-calc) — เจ้าของขอ 2026-11-14
 *   "ตอนกดดึงจากสูตร BOM อยากให้ pop เป็นหน้าค้นหาและมี tabs ตามใบสั่งงาน · กดแล้วจะโชว์สินค้าจากรายการใบสั่งงานล่าสุด และดึง BOM จากสินค้านั้น"
 *   ขั้น 1 เลือกสินค้า: แท็บ ใบสั่งงานล่าสุด · กำลังผลิต · แท็บละกลุ่มใบสั่งงาน · ค้นสินค้าทั้งหมด (SkuPicker — สินค้าที่ไม่เคยเปิดใบ)
 *          1 สินค้า = 1 แถว · ป้ายสถานะสูตร (มีขนาดตัด / สูตรยังไม่มีขนาด / ยังไม่มีสูตร)
 *   ขั้น 2 เลือกผ้าในสูตร (การ์ด บอกชิ้นที่มี) · ติ๊ก "ใช้จำนวนผลิตจากใบ" · ลิงก์ "ใช้ชิ้นตามที่ใบนี้ผลิตจริง" · ไม่มีสูตร/ไม่มีขนาด → เปิดตัวทำสูตรในป๊อป
 *   ข้อมูล: /api/fabric-calc/bom-sources (สินค้าจากใบสั่งงาน + สถานะสูตร) · /api/bom (หาสูตรของสินค้า) · /api/bom/[id] (บรรทัด)
 *   ของกลาง: ERPModal · ScrollTabs · SkuPicker · BomEditorModal · Icon · useToast
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { ScrollTabs } from "@/components/scroll-tabs";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { BomEditorModal } from "@/components/bom-editor-modal";
import type { BuyPiece } from "@/lib/fabric-buy";
import type { BomSourceGroup, BomSourceProduct, BomState } from "@/app/api/fabric-calc/bom-sources/route";

export type BomHead = { id: string; bom_code: string; product_sku: string | null; product_name: string | null; version: string | number | null };
export type BomLine = { component_sku?: string | null; component_name?: string | null; material_type?: string | null; cut_block_code?: string | null; piece_name?: string | null; cut_width?: number | null; cut_length?: number | null; pieces?: number | null; no_rotate?: boolean | null; face_width_cm?: number | null; size_variant?: boolean | null };
export type SrcFabric = { sku: string; name: string; note: string; pieces: Omit<BuyPiece, "key">[]; sized?: boolean; product?: string | null; mo_no?: string | null; mo_qty?: number };

/** สูตรของสินค้า (ตรงรหัสเท่านั้น) */
export async function bomsOfSku(sku: string): Promise<BomHead[]> {
  const j = await apiFetch(`/api/bom?search=${encodeURIComponent(sku)}&limit=50`).then((r) => r.json());
  return ((j.data ?? []) as BomHead[]).filter((b) => b.product_sku === sku);
}

/** บรรทัดในสูตรที่มีขนาดชิ้นตัด → จัดเป็นผ้า (1 ผ้า = ชิ้นตัดหลายแบบ) */
export async function fabricsFromBom(b: BomHead): Promise<SrcFabric[]> {
  const j = await apiFetch(`/api/bom/${encodeURIComponent(b.id)}`).then((r) => r.json());
  const lines = ((j.data?.lines ?? []) as BomLine[]).filter((l) => Number(l.cut_width) > 0 && Number(l.cut_length) > 0);
  const m = new Map<string, SrcFabric>();
  for (const l of lines) {
    const sku = String(l.component_sku ?? "") || "(ไม่ระบุรหัส)";
    const f = m.get(sku) ?? { sku, name: String(l.component_name ?? sku), note: l.material_type ?? "", pieces: [], sized: false, product: b.product_sku };
    f.pieces.push({ label: String(l.piece_name ?? "") || String(l.cut_block_code ?? "") || `${l.cut_width}×${l.cut_length}`, width_cm: Number(l.cut_width) || 0, length_cm: Number(l.cut_length) || 0, per_unit: Number(l.pieces) || 1, no_rotate: !!l.no_rotate });
    if (l.size_variant) f.sized = true;
    m.set(sku, f);
  }
  return [...m.values()];
}

export const bomLabel = (b: BomHead) => `สูตร ${b.bom_code}${b.version != null ? ` v${b.version}` : ""} (${b.product_sku ?? ""})`;

type Sel = { sku: string; name: string | null; image_url: string | null; last_mo: string | null; last_qty: number };
const BOM_BADGE: Record<BomState, { t: string; cls: string }> = {
  cut: { t: "มีขนาดตัด", cls: "bg-emerald-50 text-emerald-700" },
  nocut: { t: "สูตรยังไม่มีขนาด", cls: "bg-amber-50 text-amber-700" },
  none: { t: "ยังไม่มีสูตร", cls: "bg-slate-100 text-slate-500" },
};
const MAX_ROWS = 200;
const thDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";

export function BomPickModal({ open, onClose, onUse, onUseMo }: {
  open: boolean;
  onClose: () => void;
  /** เลือกผ้าแล้ว · qty = จำนวนจากใบสั่งงาน (ติ๊กใช้) */
  onUse: (a: { bom: BomHead; fabric: SrcFabric; qty: number | null }) => void;
  /** ใช้ชิ้นตามที่ใบนี้ผลิตจริง (ผังของใบ) */
  onUseMo: (moNo: string) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<{ products: BomSourceProduct[]; groups: BomSourceGroup[] } | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("latest");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Sel | null>(null);
  const [boms, setBoms] = useState<BomHead[] | null>(null);
  const [bom, setBom] = useState<BomHead | null>(null);
  const [fabrics, setFabrics] = useState<SrcFabric[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [useQty, setUseQty] = useState(true);
  const [editing, setEditing] = useState(false);

  const loadList = useCallback(() => {
    setErr("");
    apiFetch("/api/fabric-calc/bom-sources").then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setData(j.data); })
      .catch(() => setErr("โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }, []);
  useEffect(() => { if (open && !data) loadList(); }, [open, data, loadList]);

  const openBom = useCallback(async (b: BomHead) => {
    setBom(b); setFabrics(null); setBusy(true);
    try { setFabrics(await fabricsFromBom(b)); } catch { toast.error("โหลดสูตรไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  }, [toast]);
  const choose = useCallback(async (s: Sel) => {
    setSel(s); setBoms(null); setBom(null); setFabrics(null); setUseQty(s.last_qty > 0); setBusy(true);
    try {
      const list = await bomsOfSku(s.sku);
      setBoms(list);
      if (list.length >= 1) await openBom(list[0]);
    } catch { toast.error("โหลดสูตรไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  }, [openBom, toast]);
  const afterEdit = async (changed: boolean) => {
    setEditing(false);
    if (!changed || !sel) return;
    loadList();               // ป้ายสถานะสูตรเปลี่ยน
    await choose(sel);
  };

  const rows = useMemo(() => {
    const all = data?.products ?? [];
    const base = tab === "open" ? all.filter((p) => p.open) : tab.startsWith("g:") ? all.filter((p) => p.group_ids.includes(tab.slice(2))) : all;
    const s = q.trim().toLowerCase();
    return s ? base.filter((p) => `${p.sku} ${p.name ?? ""} ${p.last_mo} ${p.parent_code ?? ""}`.toLowerCase().includes(s)) : base;
  }, [data, tab, q]);
  const tabs: { k: string; t: string; n?: number }[] = [
    { k: "latest", t: "ใบสั่งงานล่าสุด", n: data?.products.length },
    { k: "open", t: "กำลังผลิต", n: data?.products.filter((p) => p.open).length },
    ...(data?.groups ?? []).map((g) => ({ k: `g:${g.id}`, t: g.name, n: data?.products.filter((p) => p.group_ids.includes(g.id)).length })),
    { k: "all", t: "ค้นสินค้าทั้งหมด" },
  ];

  const close = () => { setSel(null); setQ(""); onClose(); };
  const pickFabric = (f: SrcFabric) => {
    if (!bom || !sel) return;
    onUse({ bom, fabric: { ...f, mo_no: sel.last_mo, mo_qty: sel.last_qty || undefined }, qty: useQty && sel.last_qty > 0 ? sel.last_qty : null });
    setSel(null); setQ("");
  };

  return (
    <ERPModal open={open} onClose={close} size="lg" storageKey="fabric-calc-bom-pick"
      title={sel ? "ดึงชิ้นตัดจากสูตร BOM · เลือกผ้า" : "ดึงชิ้นตัดจากสูตร BOM · เลือกสินค้า"}
      description={sel ? "ขั้น 2/2 — กดผ้าในสูตร ชิ้นตัดจะลงตารางทันที" : "ขั้น 1/2 — สินค้าจากใบสั่งงาน (ใบล่าสุดก่อน) · กดสินค้าเพื่อดึงสูตร"}>
      {!sel ? (
        <div className="space-y-2" data-bom-pick="list">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัส / ชื่อสินค้า / เลขใบสั่งงาน" autoFocus
              className="h-10 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-indigo-400" />
          </div>
          <ScrollTabs activeKey={tab} className="border-b border-slate-200">
            {tabs.map((t) => (
              <button key={t.k} type="button" data-tab-key={t.k} onClick={() => setTab(t.k)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] ${tab === t.k ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {t.t}{t.n != null && <span className="ml-1 text-[11px] text-slate-400">{t.n}</span>}
              </button>
            ))}
          </ScrollTabs>
          {tab === "all" ? (
            <div className="space-y-2 py-2">
              <p className="text-[12.5px] text-slate-500">ค้นสินค้าที่มีสูตร (รวมตัวที่ยังไม่เคยเปิดใบสั่งงาน)</p>
              <div className="max-w-md"><SkuPicker value={null} onChange={(v: SkuPickerValue | null) => { if (v) void choose({ sku: v.code, name: v.name ?? null, image_url: null, last_mo: null, last_qty: 0 }); }} placeholder="ค้นรหัส / ชื่อสินค้า..." /></div>
            </div>
          ) : err ? (
            <div className="rounded-xl bg-rose-50 px-3 py-4 text-center text-sm text-rose-700">{err} <button type="button" onClick={loadList} className="ml-2 underline">ลองใหม่</button></div>
          ) : !data ? (
            <div className="py-8 text-center text-sm text-slate-400">กำลังโหลดใบสั่งงาน…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">{q ? "ไม่พบ ลองค้นคำอื่น หรือไปแท็บ “ค้นสินค้าทั้งหมด”" : "แท็บนี้ยังไม่มีใบสั่งงาน"}</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {rows.slice(0, MAX_ROWS).map((p) => (
                <button key={p.sku} type="button" onClick={() => void choose({ sku: p.sku, name: p.name, image_url: p.image_url, last_mo: p.last_mo, last_qty: p.last_qty })}
                  className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-indigo-50/60">
                  {p.image_url
                    ? <img src={p.image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 object-cover" />
                    : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Icon name="package" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-slate-800"><span className="font-mono text-[12px] text-slate-400">{p.sku}</span> {p.name}</span>
                    <span className="block truncate text-[12px] text-slate-500">ล่าสุด {p.last_mo} · {thDate(p.last_at)} · {p.last_qty.toLocaleString()} ใบ{p.mo_count > 1 ? ` · เคยผลิต ${p.mo_count} ใบ` : ""}{p.open ? "" : " · ปิดแล้ว"}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${BOM_BADGE[p.bom].cls}`}>{BOM_BADGE[p.bom].t}</span>
                </button>
              ))}
              {rows.length > MAX_ROWS && <div className="px-3 py-2 text-center text-[12px] text-slate-400">แสดง {MAX_ROWS} จาก {rows.length.toLocaleString()} — พิมพ์ค้นเพื่อหาตัวที่เหลือ</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3" data-bom-pick="fabric">
          <div className="flex min-w-0 items-center gap-3">
            {sel.image_url
              ? <img src={sel.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-slate-100 object-cover" />
              : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Icon name="package" /></span>}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800"><span className="font-mono text-[12px] text-slate-400">{sel.sku}</span> {sel.name}</div>
              {sel.last_mo && <div className="text-[12px] text-slate-500">ใบล่าสุด {sel.last_mo} · {sel.last_qty.toLocaleString()} ใบ</div>}
            </div>
            <button type="button" onClick={() => setSel(null)} className="h-9 shrink-0 rounded-lg border border-slate-200 px-3 text-[12.5px] text-slate-600 hover:bg-slate-50">‹ เลือกสินค้าอื่น</button>
          </div>

          {boms && boms.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-slate-500">มี {boms.length} สูตร:</span>
              {boms.map((b) => (
                <button key={b.id} type="button" onClick={() => void openBom(b)}
                  className={`h-7 rounded-full border px-2.5 text-[12px] ${bom?.id === b.id ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white hover:border-indigo-300"}`}>{b.bom_code}{b.version != null ? ` v${b.version}` : ""}</button>
              ))}
            </div>
          )}

          {busy ? <div className="py-6 text-center text-sm text-slate-400">กำลังโหลดสูตร…</div>
            : boms && boms.length === 0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-5 text-center">
                <div className="text-sm text-slate-700">สินค้านี้ยังไม่มีสูตร (BOM)</div>
                <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-4 text-[13px] font-medium text-white hover:bg-indigo-700"><Icon name="add" /> สร้างสูตร</button>
                <div className="mt-1 text-[11.5px] text-slate-400">หรือปิดป๊อปแล้วพิมพ์ขนาดชิ้นเองในตาราง</div>
              </div>
            ) : fabrics && fabrics.length === 0 ? (
              <div className="rounded-xl bg-amber-50 px-4 py-5 text-center">
                <div className="text-sm text-amber-800">{bom?.bom_code} ยังไม่มีบรรทัดที่ใส่ขนาดชิ้นตัด (กว้าง × ยาว)</div>
                <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex h-9 items-center gap-1 rounded-lg border border-amber-300 bg-white px-4 text-[13px] text-amber-800 hover:bg-amber-100"><Icon name="edit" /> แก้สูตรนี้ (ใส่ขนาดชิ้น)</button>
              </div>
            ) : fabrics ? (
              <>
                <div className="text-[12.5px] text-slate-500">เลือกผ้าใน {bom?.bom_code}{bom?.version != null ? ` v${bom.version}` : ""}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {fabrics.map((f) => (
                    <button key={f.sku} type="button" onClick={() => pickFabric(f)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-indigo-400 hover:bg-indigo-50/40">
                      <div className="truncate text-[13.5px] font-medium text-slate-800">{f.name}</div>
                      <div className="truncate text-[12px] text-slate-500">{f.sku}{f.note ? ` · ${f.note}` : ""} · {f.pieces.length} แบบชิ้น{f.sized ? " · มีแยกไซส์" : ""}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-slate-400">{f.pieces.map((p) => p.label).join(" · ")}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

          {sel.last_qty > 0 && (
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={useQty} onChange={(e) => setUseQty(e.target.checked)} /> ใช้จำนวนผลิตจากใบ <b>{sel.last_qty.toLocaleString()} ใบ</b>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            <span>กดผ้า = ใส่ชิ้นตัดลงขั้น ① + เลือกผ้าให้ · บันทึกผลวัดจริงได้</span>
            {sel.last_mo && <button type="button" onClick={() => { const no = sel.last_mo!; setSel(null); onUseMo(no); }} className="text-indigo-600 underline">ใช้ชิ้นตามที่ใบ {sel.last_mo} ผลิตจริงแทน</button>}
          </div>
        </div>
      )}
      {editing && sel && <BomEditorModal sku={sel.sku} productName={sel.name} onClose={(c) => void afterEdit(c)} />}
    </ERPModal>
  );
}
