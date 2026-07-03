"use client";

// หน้าจับคู่เร็ว (Platform Match) — รวมสินค้าแพลตฟอร์มที่ยังไม่จับคู่ ERP → เดารหัสให้ + กดยืนยันทีเดียว
// ของกลาง: ParentSkuPicker (ค้นเอง) · API /api/platform-match (เดา) + /api/platform-catalog/match (บันทึก)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", line_shopping: "🟢", youtube: "▶️", pinterest: "📌", x: "✖️" };

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type Suggest = { parent_sku_id: string; code: string; name: string };
type Row = { id: string; external_product_id: string | null; title: string | null; sku_code: string | null; price: number | null; suggest: Suggest | null };

function MatchRow({ row, canEdit, onMatched }: { row: Row; canEdit: boolean; onMatched: (id: string) => void }) {
  const [manual, setManual] = useState(false);
  const [pick, setPick] = useState<ParentSkuPickerValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doMatch = async (parent_sku_id: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ listing_id: row.id, parent_sku_id }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      onMatched(row.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-slate-100 hover:bg-slate-50/50">
      <div className="flex-1 min-w-[200px]">
        <div className="text-sm text-slate-800 truncate" title={row.title ?? ""}>{row.title || "—"}</div>
        <div className="text-[11px] text-slate-400">SKU: <span className="font-mono text-slate-600">{row.sku_code || "—"}</span>{row.price != null && <> · {row.price.toLocaleString()}฿</>}</div>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-2 flex-wrap">
          {!manual && row.suggest ? (
            <>
              <span className="text-xs text-slate-500">เดา:</span>
              <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5" title={row.suggest.name}>{row.suggest.code}</span>
              <button onClick={() => doMatch(row.suggest!.parent_sku_id)} disabled={busy} className="h-8 px-3 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{busy ? "..." : "✓ ยืนยัน"}</button>
              <button onClick={() => setManual(true)} className="h-8 px-2 text-xs text-slate-500 hover:text-slate-700 underline">ไม่ใช่ / ค้นเอง</button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-64"><ParentSkuPicker value={pick} onChange={(v) => { setPick(v); if (v) doMatch(v.id); }} placeholder="ค้นหาสินค้าในระบบ..." disableCreate /></div>
              {row.suggest && <button onClick={() => setManual(false)} className="h-8 px-2 text-xs text-slate-400 hover:text-slate-600">↩︎ กลับไปใช้ตัวเดา</button>}
            </div>
          )}
        </div>
      ) : <span className="text-xs text-amber-600">ดูอย่างเดียว</span>}
      {err && <span className="text-[11px] text-rose-600 w-full">{err}</span>}
    </div>
  );
}

export default function PlatformMatchPage() {
  const { can } = useAuth();
  const canEdit = can("products.platforms.edit");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [matchedCount, setMatchedCount] = useState(0);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(150);
  const [loading, setLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  useEffect(() => { (async () => {
    try { const j = await apiFetch("/api/platform-accounts").then((r) => r.json()); const pfs = (j.platforms ?? []) as Platform[]; setPlatforms(pfs); setBrands((j.brands ?? []) as Brand[]); const line = pfs.find((p) => p.code === "line_shopping"); if (line) setPlatformId(line.id); else if (pfs[0]) setPlatformId(pfs[0].id); } catch { /* ignore */ }
  })(); }, []);

  const load = useCallback(async () => {
    if (!platformId) return;
    setLoading(true); setBulkMsg(null); setLimit(150);
    try {
      const query = new URLSearchParams({ platform_id: platformId }); if (brandId) query.set("brand_id", brandId);
      const j = await apiFetch(`/api/platform-match?${query}`).then((r) => r.json());
      setRows((j.listings ?? []) as Row[]);
      setMatchedCount(j.matchedCount ?? 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [platformId, brandId]);
  useEffect(() => { load(); }, [load]);

  const onMatched = (id: string) => { setRows((rs) => rs.filter((r) => r.id !== id)); setMatchedCount((c) => c + 1); };

  // ยืนยันทั้งหมดที่ระบบเดาได้ (ยิงเป็นชุดละ 8)
  const confirmAllGuessed = async () => {
    const guessed = rows.filter((r) => r.suggest);
    if (guessed.length === 0) return;
    if (!confirm(`ยืนยันจับคู่ตามที่ระบบเดา ${guessed.length} รายการ?`)) return;
    setBulkMsg(`กำลังยืนยัน 0/${guessed.length}...`);
    let done = 0, fail = 0;
    for (let i = 0; i < guessed.length; i += 8) {
      const batch = guessed.slice(i, i + 8);
      const res = await Promise.all(batch.map((r) =>
        apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ listing_id: r.id, parent_sku_id: r.suggest!.parent_sku_id }) })
          .then((x) => x.json()).then((j) => ({ id: r.id, ok: !j.error })).catch(() => ({ id: r.id, ok: false }))));
      const okIds = new Set(res.filter((x) => x.ok).map((x) => x.id));
      done += okIds.size; fail += res.length - okIds.size;
      setRows((rs) => rs.filter((r) => !okIds.has(r.id)));
      setMatchedCount((c) => c + okIds.size);
      setBulkMsg(`กำลังยืนยัน ${done}/${guessed.length}...`);
    }
    setBulkMsg(`ยืนยันแล้ว ${done} รายการ${fail ? ` · ผิดพลาด ${fail}` : ""} ✓`);
  };

  const filtered = q.trim() ? rows.filter((r) => `${r.title ?? ""} ${r.sku_code ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : rows;
  const guessedCount = rows.filter((r) => r.suggest).length;
  const total = matchedCount + rows.length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-semibold text-slate-900">🔗 จับคู่สินค้าเร็ว</h1>
        <Link href="/master/platform-catalog" className="shrink-0 h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 leading-8">← กลับหน้าสินค้า</Link>
      </div>
      <p className="text-sm text-slate-500 mb-4">สินค้าบนแพลตฟอร์มที่ยังไม่จับคู่กับสินค้าใน ERP — ระบบเดารหัสให้ กดยืนยันทีเดียว หรือค้นเอง</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          {platforms.map((p) => <option key={p.id} value={p.id}>{(p.icon_key || PLATFORM_ICON[p.code] || "🏬") + " " + p.name_th}</option>)}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          <option value="">ทุกแบรนด์/ร้าน</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* ความคืบหน้า */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
        <span className="text-emerald-700">จับคู่แล้ว <b>{matchedCount}</b></span>
        <span className="text-amber-600">ยังไม่จับ <b>{rows.length}</b></span>
        {total > 0 && <span className="text-slate-400">({Math.round((matchedCount / total) * 100)}%)</span>}
        <div className="flex-1" />
        {canEdit && guessedCount > 0 && <button onClick={confirmAllGuessed} className="h-9 px-3 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">✓ ยืนยันทั้งหมดที่เดาได้ ({guessedCount})</button>}
      </div>
      {bulkMsg && <p className="text-xs text-slate-600 mb-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{bulkMsg}</p>}

      {rows.length > 0 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหาในรายการที่ยังไม่จับ..." className="h-9 w-full sm:w-72 border border-slate-200 rounded-md px-3 text-sm mb-3" />}

      {loading ? <p className="text-slate-400 text-sm py-10 text-center">กำลังโหลด...</p>
        : rows.length === 0 ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-emerald-600">🎉 จับคู่ครบทุกตัวแล้ว!<br /><span className="text-slate-400">หรือยังไม่มีสินค้าที่ดึงเข้ามา — ไปดึงที่หน้าสินค้าบนแพลตฟอร์ม</span></div>
        : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {filtered.slice(0, limit).map((r) => <MatchRow key={r.id} row={r} canEdit={canEdit} onMatched={onMatched} />)}
            {filtered.length > limit && <button onClick={() => setLimit((l) => l + 200)} className="w-full py-2.5 text-sm text-violet-600 hover:bg-violet-50">แสดงเพิ่ม ({filtered.length - limit} รายการ)</button>}
          </div>
        )}
    </div>
  );
}
