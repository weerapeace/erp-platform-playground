"use client";

// 🔗 แท็บ "รอยืนยันสินค้า" — สินค้าจากเมลที่ระบบยังไม่แน่ใจว่าเป็น SKU ไหน (รวมกลุ่มตาม สินค้า + ตัวเลือก)
// ยืนยันครั้งเดียว → ผูกทุกรายการที่ค้างด้วยคู่นี้ + จำไว้ (เมลครั้งหน้าระบบจับเอง)
// โหลดทีละหน้า (เซิร์ฟเวอร์กรอง/นับ/ตัดหน้า) · กรองแพลตฟอร์ม + แยกคิวตามสาเหตุ
// คิว 💡 ติ๊กยืนยันตามที่เดาทีละหลายการ์ด · คิว 🎨 นับเป็นรุ่น (ไม่แยกสี) · คิว ❓ สร้าง SKU ใหม่ (SkuWizard กลาง) · ⏭ ข้ามไว้ก่อน
// ของกลาง: PlatformBadge · SkuPicker · SkuWizard · Pager · BulkActionBar · ConfirmDialog · ERPInput · toast

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { usePermission } from "@/components/auth";
import type { SkuWizardResult } from "@/app/master/skus/sku-wizard";

// ตัวช่วยเพิ่ม SKU ตัวเดียวกับหน้า SKU — โหลดเมื่อกดเท่านั้น
const SkuWizard = dynamic(() => import("@/app/master/skus/sku-wizard").then((m) => m.SkuWizard), { ssr: false });
import { PlatformBadge, platformColor } from "@/components/platform-icon";
import { Pager } from "@/components/pager";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { ConfirmDialog } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { QUEUE_META, type PendingGroup, type PendingQueue, type PendingResponse, type PlatformInfo, type SelectRef } from "./types";

const QUEUE_ORDER: PendingQueue[] = ["guess", "multi", "not_found"];
const gkey = (g: { platform_code: string; item_key: string }) => `${g.platform_code}|${g.item_key}`;
const num = (n: number) => n.toLocaleString("th-TH");

export function PendingTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [platform, setPlatform] = useState("");
  const [queue, setQueue] = useState<PendingQueue | "">("");
  const [hideCancelled, setHideCancelled] = useState(true);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [data, setData] = useState<PendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  // ติ๊กเลือกในคิว 💡/🎨 — จำข้ามหน้า (key = แพลตฟอร์ม|สินค้า)
  const [selected, setSelected] = useState<Map<string, SelectRef>>(new Map());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // เปลี่ยนตัวกรอง → กลับหน้าแรก + ล้างที่ติ๊ก (ทำพร้อมกันในครั้งเดียว ไม่โหลดซ้ำ 2 รอบ)
  const refilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); setSelected(new Map()); };
  const setPlatformF = refilter(setPlatform), setQueueF = refilter(setQueue), setHideF = refilter(setHideCancelled), setSizeF = refilter(setSize);
  useEffect(() => {
    const t = setTimeout(() => { const v = q.trim(); if (v !== query) { setQuery(v); setPage(0); setSelected(new Map()); } }, 300);
    return () => clearTimeout(t);
  }, [q, query]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ view: "pending", page: String(page), size: String(size) });
      if (platform) p.set("platform", platform);
      if (queue) p.set("queue", queue);
      if (hideCancelled) p.set("hide_cancelled", "1");
      if (query) p.set("q", query);
      const res = await apiFetch(`/api/platform-email/inbox?${p}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j as PendingResponse);
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [page, size, platform, queue, hideCancelled, query]);
  useEffect(() => { void load(); }, [load]);

  const pfInfo = useMemo(() => new Map((data?.platforms ?? []).map((p) => [p.code, p])), [data?.platforms]);
  const canCreateSku = usePermission("products.create");
  const [creating, setCreating] = useState<PendingGroup | null>(null);

  // ⏭ ข้ามไว้ก่อน / ↩ เอากลับมา
  const skip = async (g: PendingGroup, undo: boolean) => {
    try {
      const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify({ action: undo ? "unskip" : "skip", groups: [{ platform_code: g.platform_code, item_key: g.item_key }] }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(undo ? "เอากลับเข้าคิวแล้ว" : "ข้ามไว้ก่อนแล้ว — ดูได้ที่คิว ⏭ ข้ามไว้ก่อน");
      await load(true); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  // สร้าง SKU ใหม่เสร็จ → สร้างตัวเดียว = ผูกการ์ดนี้กับ SKU นั้นเลย · หลายตัว (หลายสี) = ให้ระบบจับคู่ใหม่
  const onSkuCreated = async (g: PendingGroup, r?: SkuWizardResult) => {
    setCreating(null);
    const made = r?.skus ?? [];
    if (made.length === 1) await confirm(g, made[0]);
    else await rematch();
  };

  const confirm = async (g: PendingGroup, sku: { id: string; code: string }) => {
    try {
      const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify({ action: "confirm_sku", platform_code: g.platform_code, item_key: g.item_key, sku_id: sku.id }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(`ผูก ${j.updated} รายการกับ ${j.sku_code} แล้ว — ครั้งหน้าระบบจับคู่นี้เอง`);
      setSelected((m) => { const n = new Map(m); n.delete(gkey(g)); return n; });
      await load(true); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  // 🎨 นับเป็นรุ่น (ไม่แยกสี) — การ์ดเดียว
  const confirmModelOne = async (g: PendingGroup) => {
    try {
      const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify({ action: "confirm_model", groups: [{ platform_code: g.platform_code, item_key: g.item_key }] }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(`นับ ${j.updated} รายการเป็นรุ่น ${j.parent_code} (ไม่แยกสี) แล้ว — ครั้งหน้าระบบนับแบบนี้เอง`);
      setSelected((m) => { const n = new Map(m); n.delete(gkey(g)); return n; });
      await load(true); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  // ทำทีละหลายการ์ด (ส่งทีละ 100): 💡 ยืนยันตามที่ระบบเดา · 🎨 นับเป็นรุ่น ไม่แยกสี
  const bulkMode: "guess" | "model" | null = queue === "guess" ? "guess" : queue === "multi" ? "model" : null;
  const confirmSelected = async () => {
    const list = [...selected.values()];
    setBulkBusy(true);
    let confirmed = 0, updated = 0, failed = 0;
    try {
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const body = bulkMode === "model"
          ? { action: "confirm_model", groups: chunk.map((g) => ({ platform_code: g.platform_code, item_key: g.item_key })) }
          : { action: "confirm_many", groups: chunk.filter((g) => g.suggest).map((g) => ({ platform_code: g.platform_code, item_key: g.item_key, sku_id: g.suggest!.id })) };
        const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify(body) });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || "ยืนยันไม่สำเร็จ");
        confirmed += j.confirmed; updated += j.updated; failed += (j.failed ?? 0) + (j.skipped ?? 0);
      }
      toast.success(`${bulkMode === "model" ? "นับเป็นรุ่น" : "ยืนยัน"}แล้ว ${num(confirmed)} การ์ด (${num(updated)} รายการ)${failed ? ` · ทำไม่ได้ ${failed} การ์ด (เช่น หารุ่นใน ERP ไม่เจอ)` : ""}`);
      setSelected(new Map()); setBulkOpen(false);
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ"}${confirmed ? ` (ทำไปแล้ว ${confirmed} การ์ด)` : ""}`);
    } finally {
      setBulkBusy(false);
      await load(true); onChanged();
    }
  };

  // จับคู่ใหม่ด้วยกฎล่าสุด — ใช้หลังเพิ่ม SKU ใน ERP หรือหลังปรับตัวจับคู่
  const rematch = async () => {
    setRematching(true);
    try {
      const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify({ action: "rematch" }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "จับคู่ใหม่ไม่สำเร็จ");
      toast.success(j.matched ? `จับคู่ได้เพิ่ม ${j.matched} รายการ (จากที่ค้าง ${j.checked})` : `ตรวจ ${j.checked} รายการ — ยังจับคู่เองไม่ได้ ต้องเลือกด้วยมือ`);
      await load(true); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "จับคู่ใหม่ไม่สำเร็จ"); }
    finally { setRematching(false); }
  };

  const stats = data?.stats;
  const groups = data?.groups ?? [];
  const canSelect = (g: PendingGroup) => (bulkMode === "guess" ? g.queue === "guess" && !!g.suggest : bulkMode === "model" ? g.queue === "multi" && !!g.model_level : false);
  const selectableOnPage = groups.filter(canSelect);
  const toRef = (g: PendingGroup): SelectRef => ({ platform_code: g.platform_code, item_key: g.item_key, title: g.title, variant: g.variant, qty: g.qty, suggest: g.suggest, model_level: g.model_level });
  const pageAllSelected = selectableOnPage.length > 0 && selectableOnPage.every((g) => selected.has(gkey(g)));
  const togglePage = () => setSelected((m) => {
    const n = new Map(m);
    if (pageAllSelected) selectableOnPage.forEach((g) => n.delete(gkey(g)));
    else selectableOnPage.forEach((g) => n.set(gkey(g), toRef(g)));
    return n;
  });
  const toggleOne = (g: PendingGroup) => setSelected((m) => {
    const n = new Map(m);
    if (n.has(gkey(g))) n.delete(gkey(g)); else n.set(gkey(g), toRef(g));
    return n;
  });
  const selectAllFiltered = () => setSelected(new Map((data?.select_all ?? []).map((g) => [gkey(g), g])));
  const selectedList = [...selected.values()];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-500">สินค้าจากเมลที่ระบบยังไม่แน่ใจว่าเป็น SKU ไหน (ยังนับในรายงาน แต่โชว์เป็นชื่อจากร้าน) — เลือกครั้งเดียว ระบบจะจำไว้ใช้กับเมลครั้งต่อไป</p>
        <button onClick={() => void rematch()} disabled={rematching} title="ใช้หลังเพิ่ม SKU ใหม่ใน ERP"
          className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50 disabled:opacity-50">{rematching ? "กำลังจับคู่..." : "🔄 ให้ระบบจับคู่ใหม่"}</button>
      </div>

      {/* ตัวกรอง: แพลตฟอร์ม · คิวตามสาเหตุ · ค้นหา · ซ่อนออเดอร์ยกเลิก */}
      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-xs text-slate-500">แพลตฟอร์ม</span>
          <FilterChip on={!platform} onClick={() => setPlatformF("")}>ทั้งหมด <Count n={stats?.groups} /></FilterChip>
          {Object.entries(stats?.by_platform ?? {}).sort((a, b) => b[1].groups - a[1].groups).map(([code, b]) => {
            const p = pfInfo.get(code);
            return (
              <button key={code} type="button" onClick={() => setPlatformF(platform === code ? "" : code)} title={`${num(b.qty)} ชิ้น`} className="rounded-full">
                <PlatformBadge code={code} name={p?.name} color={p?.color} iconKey={p?.icon_key} count={b.groups} active={platform === code}
                  className={`h-8 px-3 text-sm ${platform === code ? "ring-2 ring-slate-300 ring-offset-1" : "hover:bg-slate-50"}`} />
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-xs text-slate-500">สาเหตุ</span>
          <FilterChip on={!queue} onClick={() => setQueueF("")}>ทุกคิว <Count n={stats ? QUEUE_ORDER.reduce((a, k) => a + stats.by_queue[k], 0) : undefined} /></FilterChip>
          {QUEUE_ORDER.map((k) => (
            <FilterChip key={k} on={queue === k} onClick={() => setQueueF(queue === k ? "" : k)} tone={QUEUE_META[k].chip} title={QUEUE_META[k].hint}>
              {QUEUE_META[k].icon} {QUEUE_META[k].label} <Count n={stats?.by_queue[k]} />
            </FilterChip>
          ))}
          {(!!stats?.by_queue.skipped || queue === "skipped") && (
            <FilterChip on={queue === "skipped"} onClick={() => setQueueF(queue === "skipped" ? "" : "skipped")} tone={QUEUE_META.skipped.chip} title={QUEUE_META.skipped.hint}>
              {QUEUE_META.skipped.icon} {QUEUE_META.skipped.label} <Count n={stats?.by_queue.skipped} />
            </FilterChip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="w-72 max-w-full"><ERPInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อสินค้า / รหัสรุ่น / ตัวเลือก / เลขออเดอร์" /></div>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={hideCancelled} onChange={(e) => setHideF(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            ซ่อนการ์ดที่มีแต่ออเดอร์ยกเลิก{stats?.cancelled_only ? <span className="text-slate-400">({num(stats.cancelled_only)})</span> : null}
          </label>
          {stats && <span className="ml-auto text-xs text-slate-500">ตามตัวกรอง <b className="text-slate-700">{num(data?.total ?? 0)}</b> แบบ</span>}
        </div>
        {queue && <div className={`rounded-lg border px-3 py-1.5 text-xs ${QUEUE_META[queue].chip}`}>{QUEUE_META[queue].icon} {QUEUE_META[queue].hint}</div>}
      </section>

      {/* คิว 💡 / 🎨 → ติ๊กทำทีละหลายการ์ด */}
      {bulkMode && selectableOnPage.length > 0 && (
        <div className={`flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm ${bulkMode === "guess" ? "bg-amber-50/60" : "bg-violet-50/60"}`}>
          <label className="flex cursor-pointer items-center gap-1.5 text-slate-700">
            <input type="checkbox" checked={pageAllSelected} onChange={togglePage} className="h-4 w-4 rounded border-slate-300" />
            เลือกทั้งหน้านี้ ({selectableOnPage.length})
          </label>
          {(data?.select_all?.length ?? 0) > selectableOnPage.length && (
            <button type="button" onClick={selectAllFiltered} className={`underline-offset-2 hover:underline ${bulkMode === "guess" ? "text-amber-800" : "text-violet-800"}`}>
              เลือกทั้งหมดตามตัวกรอง ({num(data?.select_all?.length ?? 0)} การ์ด)
            </button>
          )}
          <span className="text-xs text-slate-500">{bulkMode === "guess"
            ? "ตรวจรหัสที่ระบบเดาในการ์ดก่อน แล้วกดยืนยันที่แถบด้านล่าง"
            : "ไม่รู้สีจริง (เช่น Lazada) → ติ๊กแล้วกด \"นับเป็นรุ่น\" ที่แถบด้านล่าง · ยอดขายไปลงที่รุ่น ไม่แยกสี"}</span>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {error} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>}

      {loading && !data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : !error && data && data.total === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          {stats?.groups === 0 && !platform && !queue && !query ? (
            <>
              <div className="font-medium text-emerald-700">✅ ไม่มีสินค้ารอยืนยัน</div>
              <div className="mt-1 text-sm text-slate-500">ทุกสินค้าจากเมลจับคู่กับ SKU ใน ERP ได้แล้ว{hideCancelled && stats?.cancelled_only ? ` (ซ่อนการ์ดที่มีแต่ออเดอร์ยกเลิกไว้ ${num(stats.cancelled_only)} แบบ)` : ""}</div>
            </>
          ) : <div className="text-sm text-slate-500">ไม่พบการ์ดตามตัวกรองนี้ — ลองเปลี่ยนแพลตฟอร์ม/สาเหตุ หรือคำค้นหา</div>}
        </div>
      ) : (
        <div className={`space-y-2 transition-opacity ${loading ? "pointer-events-none opacity-50" : ""}`}>
          {groups.map((g) => (
            <GroupCard key={gkey(g)} g={g} platform={pfInfo.get(g.platform_code)}
              selectable={canSelect(g)} selected={selected.has(gkey(g))} onToggle={() => toggleOne(g)}
              onConfirm={(sku) => confirm(g, sku)} onConfirmModel={() => confirmModelOne(g)}
              onSkip={(undo) => skip(g, undo)} onCreateSku={canCreateSku && g.queue === "not_found" ? () => setCreating(g) : undefined} />
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <Pager page={page} pageSize={size} total={data.total} onPage={setPage} unitLabel="แบบ" onPageSize={setSizeF} pageSizes={[20, 50, 100]} />
      )}

      {creating && (
        <SkuWizard open onClose={() => setCreating(null)} onCreated={(r) => void onSkuCreated(creating, r)}
          prefill={{ code: creating.model_level ?? creating.model_code ?? undefined, name_th: creating.title }} />
      )}

      <BulkActionBar count={selected.size} unit="การ์ด" onClear={() => setSelected(new Map())}>
        {bulkMode === "model" ? (
          <button type="button" onClick={() => setBulkOpen(true)} className="h-9 rounded-lg bg-violet-500 px-4 text-sm font-medium text-white hover:bg-violet-600">
            🎨 นับเป็นรุ่น ไม่แยกสี ({num(selected.size)})
          </button>
        ) : (
          <button type="button" onClick={() => setBulkOpen(true)} className="h-9 rounded-lg bg-emerald-500 px-4 text-sm font-medium text-white hover:bg-emerald-600">
            ✓ ยืนยันตามที่ระบบเดา ({num(selected.size)})
          </button>
        )}
      </BulkActionBar>

      <ConfirmDialog open={bulkOpen} onClose={() => { if (!bulkBusy) setBulkOpen(false); }} onConfirm={() => void confirmSelected()} loading={bulkBusy}
        title={bulkMode === "model" ? `นับ ${num(selectedList.length)} การ์ดเป็นรุ่น (ไม่แยกสี)?` : `ยืนยัน ${num(selectedList.length)} การ์ดตามที่ระบบเดา?`}
        confirmText={bulkMode === "model" ? "นับเป็นรุ่นทั้งหมด" : "ยืนยันทั้งหมด"}
        requireTyped={selectedList.length > 50 ? "CONFIRM" : undefined}
        message={
          <div className="space-y-2 text-sm">
            {bulkMode === "model"
              ? <p>{num(selectedList.reduce((a, g) => a + g.qty, 0))} ชิ้นจะนับยอดขายที่<b>รุ่น</b> (ไม่แยกสี · ไม่ตัดสต๊อกรายสี) และ<b>จำไว้</b>ใช้กับเมลครั้งต่อไป — แก้ภายหลังได้ที่แท็บกฎที่จำไว้</p>
              : <p>ระบบจะผูก {num(selectedList.reduce((a, g) => a + g.qty, 0))} ชิ้นกับรหัสที่เดาไว้ และ<b>จำไว้</b>ใช้กับเมลครั้งต่อไป</p>}
            <ul className="max-h-56 space-y-0.5 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              {selectedList.slice(0, 30).map((g) => (
                <li key={gkey(g)} className="flex gap-2">
                  <code className={`shrink-0 font-mono font-medium ${bulkMode === "model" ? "text-violet-700" : "text-emerald-700"}`}>{bulkMode === "model" ? `รุ่น ${g.model_level ?? "?"}` : g.suggest?.code}</code>
                  <span className="truncate text-slate-600">← {g.variant ?? "—"} · {g.title}</span>
                </li>
              ))}
              {selectedList.length > 30 && <li className="text-slate-400">… และอีก {num(selectedList.length - 30)} การ์ด</li>}
            </ul>
            {selectedList.length > 50 && <p className="text-xs text-amber-700">เลือกเกิน 50 การ์ด — พิมพ์ CONFIRM เพื่อยืนยัน</p>}
          </div>
        } />
    </div>
  );
}

function Count({ n }: { n?: number }) {
  return n == null ? null : <span className="tabular-nums opacity-70">{n.toLocaleString("th-TH")}</span>;
}

function FilterChip({ on, onClick, tone, title, children }: { on: boolean; onClick: () => void; tone?: string; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm ${on
        ? tone ? `${tone} font-medium ring-2 ring-slate-300 ring-offset-1` : "border-slate-900 bg-slate-900 font-medium text-white"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {children}
    </button>
  );
}

function GroupCard({ g, platform, selectable, selected, onToggle, onConfirm, onConfirmModel, onSkip, onCreateSku }: {
  g: PendingGroup; platform?: PlatformInfo;
  selectable: boolean; selected: boolean; onToggle: () => void;
  onConfirm: (sku: { id: string; code: string }) => Promise<void>;
  /** 🎨 นับเป็นรุ่น (ไม่แยกสี) */
  onConfirmModel: () => Promise<void>;
  /** ⏭ ข้ามไว้ก่อน (undo=true → ↩ เอากลับมา) */
  onSkip: (undo: boolean) => Promise<void>;
  /** ＋ สร้าง SKU ใหม่ (คิว ❓ · มีสิทธิ์สร้างสินค้า) */
  onCreateSku?: () => void;
}) {
  const [pick, setPick] = useState<{ id: string; code: string } | null>(g.suggest);
  const [other, setOther] = useState<SkuPickerValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const chosen = other ? { id: other.id, code: other.code } : pick;
  const color = platformColor(g.platform_code, platform?.color);
  const meta = QUEUE_META[g.queue];
  const lazadaNoColor = g.platform_code === "lazada" && g.queue === "multi";
  // นับเป็นรุ่นได้เมื่อรู้รหัสรุ่น และรุ่นมีหลายสีให้เลือก (คิว 🎨)
  const canModel = g.queue === "multi" && !!g.model_level;

  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    try { await onConfirm(chosen); } finally { setSaving(false); }
  };
  const saveModel = async () => {
    setSaving(true);
    try { await onConfirmModel(); } finally { setSaving(false); }
  };
  const modelBtn = (primary: boolean) => (
    <button type="button" onClick={() => void saveModel()} disabled={saving} title="ยอดขายไปลงที่รุ่น ไม่แยกสี · ไม่ตัดสต๊อกรายสี · ระบบจำไว้ใช้กับเมลครั้งต่อไป"
      className={`h-9 rounded-lg px-3 text-sm font-medium disabled:opacity-40 ${primary ? "bg-violet-600 text-white hover:bg-violet-700" : "border border-violet-200 bg-white text-violet-700 hover:bg-violet-50"}`}>
      🎨 นับเป็นรุ่น {g.model_level} (ไม่แยกสี)
    </button>
  );

  return (
    <section className={`rounded-xl border border-l-4 bg-white p-3 sm:p-4 ${selected ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200"}`} style={{ borderLeftColor: color }}>
      <div className="flex gap-3">
        {selectable && <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300" aria-label="เลือกการ์ดนี้" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PlatformBadge code={g.platform_code} name={platform?.name} color={platform?.color} iconKey={platform?.icon_key} size="xs" />
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] ${meta.chip}`}>{meta.icon} {meta.label}</span>
            {g.live_items === 0 && <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] text-slate-500">มีแต่ออเดอร์ยกเลิก</span>}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-medium text-slate-800" title={g.title}>{g.title}</div>
          <div className="mt-0.5 text-xs text-slate-500">ตัวเลือกในเมล: <b className="text-slate-700">{g.variant ?? "— (เมลไม่บอก)"}</b></div>
          {g.reason && <div className="mt-0.5 text-xs text-slate-400">{g.reason}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-semibold leading-none tabular-nums text-slate-800">{num(g.qty)}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">ชิ้น · {num(g.order_count)} ออเดอร์</div>
          <button type="button" onClick={() => setShowOrders((v) => !v)} className="mt-1 text-[11px] text-slate-500 hover:text-slate-800 hover:underline">
            {showOrders ? "ซ่อนออเดอร์ ▴" : "ดูออเดอร์ ▾"}
          </button>
        </div>
      </div>

      {showOrders && (
        <div className="mt-2 flex flex-wrap gap-1 rounded-lg bg-slate-50 p-2">
          {g.orders.map((o) => (
            <code key={o.no} className={`rounded bg-white px-1.5 py-0.5 font-mono text-[11px] ${o.cancelled ? "text-slate-400 line-through" : "text-slate-700"}`} title={o.cancelled ? "ออเดอร์ยกเลิกแล้ว" : undefined}>{o.no}</code>
          ))}
          {g.order_count > g.orders.length && <span className="px-1 text-[11px] text-slate-400">+ อีก {num(g.order_count - g.orders.length)} ออเดอร์</span>}
        </div>
      )}

      {lazadaNoColor && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="min-w-0 flex-1">⚠️ เมล Lazada ไม่บอกสี — ถ้ายืนยันเป็นสีเดียว ระบบจะ<b>จำไว้และนับทุกออเดอร์ต่อไปของสินค้านี้เป็นสีนั้น</b> · ถ้าไม่รู้สีจริง แนะนำ “นับเป็นรุ่น”</span>
          {canModel && modelBtn(true)}
        </div>
      )}

      {g.candidates.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">{g.queue === "guess" ? "ระบบเดา / เลือกสีอื่น:" : "เลือกสี:"}</span>
          {g.candidates.map((c) => {
            const on = !other && pick?.id === c.id;
            const isGuess = g.suggest?.id === c.id;
            return (
              <button key={c.id} type="button" onClick={() => { setOther(null); setPick({ id: c.id, code: c.code }); }}
                className={`rounded-lg border px-2.5 py-1 text-xs ${on ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-300" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {on && "✓ "}<code className="font-mono">{c.code}</code>{c.color ? ` · ${c.color}` : ""}{isGuess && !on ? " 💡" : ""}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full"><SkuPicker value={other} onChange={setOther} placeholder="🔍 ค้นหา SKU อื่น..." /></div>
        <button type="button" onClick={() => void save()} disabled={!chosen || saving}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
          {saving ? "กำลังบันทึก..." : chosen ? `✓ ยืนยันเป็น ${chosen.code}` : "เลือก SKU ก่อน"}
        </button>
        {canModel && !lazadaNoColor && modelBtn(false)}
        {onCreateSku && (
          <button type="button" onClick={onCreateSku} title="เปิดตัวช่วยเพิ่ม SKU (ตัวเดียวกับหน้า SKU) กรอกรหัส/ชื่อไว้ให้ · สร้างเสร็จระบบผูกการ์ดนี้ให้เอง"
            className="h-9 rounded-lg border border-sky-200 bg-white px-3 text-sm font-medium text-sky-700 hover:bg-sky-50">
            ＋ สร้าง SKU ใหม่{g.model_level ? ` ${g.model_level}` : ""}
          </button>
        )}
        <button type="button" onClick={() => { setSaving(true); void onSkip(g.queue === "skipped").finally(() => setSaving(false)); }} disabled={saving}
          className="ml-auto h-9 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40">
          {g.queue === "skipped" ? "↩ เอากลับมา" : "⏭ ข้ามไว้ก่อน"}
        </button>
      </div>
    </section>
  );
}
