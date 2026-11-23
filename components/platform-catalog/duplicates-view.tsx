"use client";

/**
 * มุมมอง "สินค้าซ้ำ" ในหน้าสินค้าบนร้าน (/master/platform-catalog?view=dupes) — เจ้าของเลือก 2026-11-23 วิธี B + ข้อ 1-5
 *   1 รุ่นในระบบ = หลายรายการบนร้าน → จัดกลุ่ม · ระบบแนะนำตัวที่เก็บ (เปลี่ยนเองได้) · ติ๊กตัวที่จะลบ
 *   วิธี B: ระบบไม่ลบเอง — ปุ่ม "เปิดตัวถัดไปใน Seller Centre" (เช็กสดก่อน: ออเดอร์ค้าง/โปรโมชัน) → ลบในหลังร้าน → "เช็กว่าลบแล้ว" ติดป้ายในระบบ
 *   ข้อ 3 ไม่ใช่ตัวซ้ำ (ย้อนกลับได้) · ข้อ 4 ตัวที่เปิดขายซ้อน → ปิดขายแทนการลบ (ย้อนกลับได้ · /api/shopee/listing-display)
 *   ข้อ 5 จัดกลุ่มได้ทุกร้าน · เช็กสด/เช็กว่าลบ/ปิดขาย = Shopee ก่อน
 * ของกลางที่ใช้: state-views · ConfirmDialog · toast (undo) · Icon · listingLinks (lib/platform-links) · กติกา lib/platform-duplicates
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { listingLinks } from "@/lib/platform-links";
import { DUP_TAG_LABEL, type DupGroup, type DupTag } from "@/lib/platform-duplicates";

type Summary = { groups: number; extra: number; ignored: number; two_selling: number; none_selling: number; erp_made: number };
type Filter = "all" | DupTag | "ignored";
type RowState = { opened?: boolean; gone?: boolean; busy?: boolean; note?: string };

const baht = (n: number | null) => (n == null ? "—" : `฿${n.toLocaleString("th-TH")}`);

export function PlatformDuplicatesView({ platformId, platformCode, brandId, where }: { platformId: string; platformCode: string; brandId: string; where: string }) {
  const toast = useToast();
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [keepOverride, setKeepOverride] = useState<Record<string, string>>({});   // ข้อ 1: เปลี่ยนตัวที่เก็บเอง (ต่อรุ่น)
  const [unselected, setUnselected] = useState<Set<string>>(new Set());        // ติ๊กออกจาก "จะลบ"
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [closeFor, setCloseFor] = useState<{ id: string; ext: string } | null>(null);
  const isShopee = platformCode === "shopee";

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/platform-catalog/duplicates?platform_id=${platformId}&brand_id=${brandId}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setGroups(j.groups ?? []); setSummary(j.summary ?? null);
    } catch (e) { setErr((e as Error).message || "โหลดไม่สำเร็จ"); setGroups([]); }
  }, [platformId, brandId]);
  useEffect(() => { setGroups(null); void load(); }, [load]);

  const keepOf = (g: DupGroup) => keepOverride[g.parentId] ?? g.keepId;
  const setRS = (id: string, p: RowState) => setRowState((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  const visible = useMemo(() => (groups ?? []).filter((g) => (filter === "ignored" ? g.ignored : !g.ignored && (filter === "all" || g.tags.includes(filter)))), [groups, filter]);
  /** รายการที่จะลบ (ยังไม่ลบ) เรียงตามกลุ่ม */
  const toDelete = useMemo(() => visible.flatMap((g) => g.listings.filter((l) => l.id !== keepOf(g) && !unselected.has(l.id) && !rowState[l.id]?.gone).map((l) => ({ g, l }))),
    [visible, keepOverride, unselected, rowState]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ข้อ 3: ไม่ใช่ตัวซ้ำ / เอากลับมา (ย้อนกลับได้ทันที)
  const setIgnored = async (g: DupGroup, ignore: boolean, quiet = false) => {
    const r = await apiFetch("/api/platform-catalog/duplicates", { method: "POST", body: JSON.stringify({ action: ignore ? "ignore" : "unignore", platform_id: platformId, brand_id: brandId, parent_id: g.parentId }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "เชื่อมต่อไม่ได้" }));
    if (!r.ok) { toast.error(r.error || "บันทึกไม่สำเร็จ"); return; }
    setGroups((gs) => (gs ?? []).map((x) => (x.parentId === g.parentId ? { ...x, ignored: ignore } : x)));
    if (!quiet) toast.undo(ignore ? `ซ่อน ${g.code} แล้ว (ไม่ใช่ตัวซ้ำ)` : `เอา ${g.code} กลับมาแล้ว`, () => void setIgnored(g, !ignore, true));
  };

  // วิธี B: เปิดตัวถัดไปใน Seller Centre — เปิดแท็บรอไว้ตอนกด (ไม่โดนบล็อก) · เช็กสดก่อน (ข้อ 2) · ไม่ปลอดภัย = ปิดแท็บ + บอกเหตุผล
  const openNext = async (target?: { g: DupGroup; l: DupGroup["listings"][number] }) => {
    const next = target ?? toDelete.find(({ l }) => !rowState[l.id]?.opened);
    if (!next) { toast.info("เปิดครบทุกตัวที่ติ๊กไว้แล้ว — ลบในหลังร้านแล้วกด “เช็กว่าลบแล้ว”"); return; }
    const url = listingLinks(platformCode, next.l.externalId).sellerCenter;
    if (!url) { toast.warning("ร้านนี้ยังไม่มีลิงก์หลังร้าน"); return; }
    const w = window.open("", "_blank");
    if (w) { try { w.document.title = "กำลังเช็กก่อนเปิด…"; w.document.body.innerHTML = '<div style="font-family:system-ui;padding:40px;color:#475569">กำลังเช็กกับร้านก่อนเปิด…</div>'; w.opener = null; } catch { /* ignore */ } }
    setRS(next.l.id, { busy: true });
    let reasons: string[] = [];
    if (isShopee) {
      const c = await apiFetch("/api/platform-catalog/duplicates", { method: "POST", body: JSON.stringify({ action: "check", listing_id: next.l.id }) }).then((x) => x.json()).catch(() => ({ ok: false, reasons: ["เช็กกับร้านไม่สำเร็จ"] }));
      reasons = c.safe ? [] : (c.reasons ?? [c.error ?? "เช็กไม่สำเร็จ"]);
    }
    setRS(next.l.id, { busy: false });
    if (reasons.length) {
      try { w?.close(); } catch { /* ignore */ }
      setRS(next.l.id, { note: reasons.join(" · ") });
      toast.action(`#${next.l.externalId}: ${reasons[0]}`, "เปิดดูอยู่ดี", () => { window.open(url, "_blank", "noopener"); setRS(next.l.id, { opened: true }); }, { variant: "warning", ms: 15000 });
      return;
    }
    if (w) w.location.href = url; else window.open(url, "_blank", "noopener");
    setRS(next.l.id, { opened: true, note: "เปิดหลังร้านแล้ว — ลบแล้วกด “เช็กว่าลบแล้ว”" });
  };

  const recheck = async (id: string) => {
    setRS(id, { busy: true });
    const r = await apiFetch("/api/platform-catalog/duplicates", { method: "POST", body: JSON.stringify({ action: "recheck", listing_id: id }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "เชื่อมต่อไม่ได้" }));
    setRS(id, { busy: false });
    if (!r.ok) { toast.error(r.error || "เช็กไม่สำเร็จ"); return; }
    if (r.gone) { setRS(id, { gone: true, note: "ลบบนร้านแล้ว · ติดป้ายในระบบแล้ว" }); toast.success("ลบบนร้านแล้ว — ระบบติดป้าย “ไม่อยู่บนร้านแล้ว” ให้"); }
    else toast.info(`ยังอยู่บนร้าน (สถานะ ${r.status ?? "?"}) — ลบใน Seller Centre ก่อนแล้วกดใหม่`);
  };

  // ข้อ 4: ปิดขายแทนการลบ (Shopee · ย้อนกลับได้ด้วยเปิดขายในลิ้นชัก)
  const closeSale = async () => {
    if (!closeFor) return;
    const { id } = closeFor;
    setCloseFor(null); setRS(id, { busy: true });
    const r = await apiFetch("/api/shopee/listing-display", { method: "POST", body: JSON.stringify({ listing_id: id, open: false }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "เชื่อมต่อไม่ได้" }));
    setRS(id, { busy: false });
    if (!r.ok) { toast.error(r.error || "ปิดขายไม่สำเร็จ"); return; }
    toast.success(r.summary || "ปิดขายแล้ว");
    void load();
  };

  if (err && !groups?.length) return <ErrorState title="โหลดสินค้าซ้ำไม่สำเร็จ" hint={err} onRetry={() => void load()} className="py-8" />;
  if (!groups) return <LoadingState label={`กำลังหาสินค้าซ้ำบน ${where}…`} className="py-8" />;

  const chips: { k: Filter; label: string; n: number }[] = [
    { k: "all", label: "ทั้งหมด", n: summary?.groups ?? 0 },
    { k: "two_selling", label: DUP_TAG_LABEL.two_selling, n: summary?.two_selling ?? 0 },
    { k: "none_selling", label: DUP_TAG_LABEL.none_selling, n: summary?.none_selling ?? 0 },
    { k: "erp_made", label: DUP_TAG_LABEL.erp_made, n: summary?.erp_made ?? 0 },
    { k: "ignored", label: "ซ่อนไว้ (ไม่ใช่ตัวซ้ำ)", n: summary?.ignored ?? 0 },
  ];

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap gap-2">
        {[["รุ่นที่ซ้ำ", summary?.groups ?? 0], ["รายการเกิน", summary?.extra ?? 0], ["ติ๊กไว้จะลบ", toDelete.length]].map(([l, n]) => (
          <div key={String(l)} className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">{l}</div><div className="text-lg font-semibold tabular-nums text-slate-800">{Number(n).toLocaleString()}</div></div>
        ))}
        <p className="basis-full text-xs text-slate-500">ระบบไม่ลบอะไรบนร้านเอง — กดเปิดหลังร้านทีละตัว ลบใน Seller Centre แล้วกด “เช็กว่าลบแล้ว” · สินค้าที่ลบบนร้านกู้คืนไม่ได้{!isShopee ? " · ร้านนี้ยังเช็กสด/ปิดขายจากระบบไม่ได้ (ทำ Shopee ก่อน)" : ""}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c.k} type="button" onClick={() => setFilter(c.k)} aria-pressed={filter === c.k}
            className={`h-8 rounded-full border px-3 text-xs ${filter === c.k ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c.label} {c.n.toLocaleString()}</button>
        ))}
      </div>

      {!visible.length ? <EmptyState title={filter === "ignored" ? "ไม่มีกลุ่มที่ซ่อนไว้" : "ไม่มีสินค้าซ้ำในตัวกรองนี้"} className="py-8" /> : visible.map((g) => {
        const keep = keepOf(g);
        return (
          <div key={g.parentId} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 bg-slate-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-800">{g.code} <span className="text-xs font-normal text-slate-500">· {g.listings.length} รายการบน {where}</span>
                  {g.tags.map((t) => <span key={t} className={`rounded px-1.5 py-0.5 text-[11px] ${t === "two_selling" ? "bg-rose-50 text-rose-700" : t === "erp_made" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{DUP_TAG_LABEL[t]}</span>)}
                </div>
                {g.name && <div className="truncate text-xs text-slate-500">{g.name}</div>}
              </div>
              <button type="button" onClick={() => void setIgnored(g, !g.ignored)} className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50">{g.ignored ? "เอากลับมา" : "ไม่ใช่ตัวซ้ำ"}</button>
            </div>
            {g.listings.map((l) => {
              const isKeep = l.id === keep;
              const rs = rowState[l.id] ?? {};
              const del = !isKeep && !unselected.has(l.id) && !rs.gone;
              const sell = String(l.status ?? "").toLowerCase() === "normal";
              return (
                <div key={l.id} className={`flex flex-col gap-1.5 border-t border-slate-100 px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3 ${rs.gone ? "opacity-50" : ""}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" disabled={isKeep || rs.gone} checked={del} aria-label={`จะลบ #${l.externalId}`}
                      onChange={(e) => setUnselected((s) => { const n = new Set(s); if (e.target.checked) n.delete(l.id); else n.add(l.id); return n; })} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {l.image ? <img src={l.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover" /> : <span className="h-9 w-9 shrink-0 rounded border border-slate-200 bg-slate-50" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[11px] text-slate-700">#{l.externalId}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${rs.gone ? "bg-slate-100 text-slate-500" : sell ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{rs.gone ? "ลบแล้ว" : sell ? "เปิดขาย" : "ปิดขาย"}</span>
                        {isKeep ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">เก็บไว้{keepOverride[g.parentId] ? "" : ` · ${g.keepReason}`}</span>
                          : del ? <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">จะลบ</span> : null}
                        {l.byErp && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">ระบบสร้าง</span>}
                      </div>
                      <div className="text-slate-500">{baht(l.price)} · ยอด 90 วัน {l.sales90.toLocaleString()} ชิ้น{rs.note ? ` · ${rs.note}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-6 sm:pl-0">
                    {!isKeep && !rs.gone && <button type="button" onClick={() => setKeepOverride((o) => ({ ...o, [g.parentId]: l.id }))} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50">เก็บตัวนี้แทน</button>}
                    {!rs.gone && <button type="button" disabled={rs.busy} onClick={() => void openNext({ g, l })} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 hover:bg-slate-50 disabled:opacity-50"><Icon name="open" />หลังร้าน</button>}
                    {isShopee && !isKeep && sell && !rs.gone && <button type="button" disabled={rs.busy} onClick={() => setCloseFor({ id: l.id, ext: l.externalId })} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50 disabled:opacity-50">ปิดขายแทน</button>}
                    {isShopee && !isKeep && !rs.gone && rs.opened && <button type="button" disabled={rs.busy} onClick={() => void recheck(l.id)} className="h-7 rounded-md border border-violet-200 bg-violet-50 px-2 text-violet-800 hover:bg-violet-100 disabled:opacity-50">เช็กว่าลบแล้ว</button>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {toDelete.length > 0 && (
        <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-500">ติ๊กไว้ {toDelete.length.toLocaleString()} รายการ · เปิดแล้ว {toDelete.filter(({ l }) => rowState[l.id]?.opened).length.toLocaleString()}</span>
          <button type="button" onClick={() => void openNext()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm text-white hover:bg-violet-700"><Icon name="open" />เปิดตัวถัดไปใน Seller Centre</button>
        </div>
      )}

      <ConfirmDialog open={!!closeFor} onClose={() => setCloseFor(null)} onConfirm={() => void closeSale()} title="ปิดขายตัวที่ซ้ำ"
        message={`ปิดขาย #${closeFor?.ext ?? ""} บน ${where} — ลูกค้าจะไม่เห็นรายการนี้ · เปิดกลับได้ภายหลังในลิ้นชักสินค้าบนร้าน`} confirmText="ปิดขาย" />
    </div>
  );
}
