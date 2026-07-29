"use client";

// ============================================================
// AiProductDetailModal — "✨ ให้ AI คิดรายละเอียดสินค้า" (ของกลาง)
//   AI ดูรูปสินค้า + ข้อมูลที่มีอยู่ → เขียน ชื่อสินค้า / Introduction / Description
//   ทั้งไทยและอังกฤษ แล้วให้ผู้ใช้ "ติ๊กเลือกทีละช่อง" ว่าจะเอาอันไหน (ไม่ทับทั้งดุ้น)
//   ค่าที่เลือกจะลงในฟอร์มเฉย ๆ — ต้องกดบันทึกเองอีกที
//   ⚠️ ไม่แตะช่องขนาด/น้ำหนัก โดยตั้งใจ (ตัวเลขต้องวัดจริง ไม่ให้ AI เดา)
// ============================================================

import { useCallback, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/spinner";

/** ช่องที่ AI เขียนให้ — เรียงตามที่เห็นในฟอร์ม */
const FIELDS: { key: string; label: string; lang: "th" | "en"; long?: boolean }[] = [
  { key: "name_th",             label: "ชื่อสินค้า",          lang: "th" },
  { key: "introduction",        label: "Introduction",        lang: "th", long: true },
  { key: "description",         label: "Description",         lang: "th", long: true },
  { key: "name_en",             label: "Name En",             lang: "en" },
  { key: "introduction_en",     label: "Introduction En",     lang: "en", long: true },
  { key: "english_description", label: "English Description", lang: "en", long: true },
];

type Result = Record<string, string> & { image_count?: number };

const isBlank = (v: unknown) => {
  const s = String(v ?? "").trim();
  return !s || s === "-" || s === "—" || s === "–";
};

export function AiProductDetailModal({
  parentId, current, onApply, onClose,
}: {
  parentId: string;
  /** ค่าปัจจุบันในฟอร์ม (ไว้เทียบว่าจะทับของเดิมไหม) */
  current: Record<string, unknown>;
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const run = useCallback(async () => {
    setLoading(true); setErr(null); setRes(null);
    try {
      const r = await apiFetch("/api/ai/product-detail", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId, extra: extra.trim() || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || `เรียก AI ไม่สำเร็จ (${r.status})`);
      const data = (j.data ?? {}) as Result;
      setRes(data);
      // ค่าเริ่มต้น: ติ๊กเฉพาะช่องที่ "ของเดิมยังว่าง" — ช่องที่มีข้อความอยู่แล้วไม่ติ๊กให้ (กันทับงานที่เขียนเอง)
      const init: Record<string, boolean> = {};
      for (const f of FIELDS) init[f.key] = !!String(data[f.key] ?? "").trim() && isBlank(current[f.key]);
      setPicked(init);
    } catch (e) { setErr(e instanceof Error ? e.message : "เรียก AI ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [parentId, extra, current]);

  const rows = res ? FIELDS.filter((f) => String(res[f.key] ?? "").trim()) : [];
  const pickedCount = rows.filter((f) => picked[f.key]).length;
  const willOverwrite = rows.filter((f) => picked[f.key] && !isBlank(current[f.key])).length;

  const apply = () => {
    if (!res) return;
    const out: Record<string, string> = {};
    for (const f of rows) if (picked[f.key]) out[f.key] = String(res[f.key] ?? "").trim();
    onApply(out);
    onClose();
  };

  return (
    <ERPModal open onClose={onClose} size="lg" title="✨ ให้ AI คิดรายละเอียดสินค้า"
      description="AI จะดูรูปสินค้า + ข้อมูลที่กรอกไว้ แล้วเขียนชื่อสินค้า / Introduction / Description ให้ทั้งไทยและอังกฤษ · ไม่แตะช่องขนาดและน้ำหนัก"
      footer={
        <div className="flex items-center justify-between w-full gap-2 flex-wrap">
          <span className="text-[11.5px] text-slate-400">
            {res ? `AI ดูรูป ${res.image_count ?? 0} รูป · เลือกไว้ ${pickedCount} ช่อง` : "ค่าที่ได้จะลงในฟอร์ม ต้องกดบันทึกเองอีกที"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
            <button onClick={() => void run()} disabled={loading}
              className="h-9 px-4 text-sm font-medium border border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50 rounded-lg hover:bg-fuchsia-100 disabled:opacity-50 inline-flex items-center gap-2">
              {loading && <Spinner />}{loading ? "AI กำลังคิด…" : res ? "ให้คิดใหม่" : "✨ ให้ AI คิด"}
            </button>
            {res && (
              <button onClick={apply} disabled={pickedCount === 0}
                className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                ใช้ค่าที่เลือก ({pickedCount})
              </button>
            )}
          </div>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className="block text-[12.5px] font-medium text-slate-600 mb-1">บอกใบ้เพิ่ม (ไม่บังคับ)</label>
          <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={500}
            placeholder="เช่น หนัง PU กันน้ำ · ใส่โน้ตบุ๊ก 15 นิ้วได้ · เหมาะกับนักเรียน"
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300" />
          <p className="mt-1 text-[11.5px] text-slate-400">
            AI เขียนจากสิ่งที่เห็นในรูปเท่านั้น — อะไรที่มองไม่เห็น (วัสดุจริง กันน้ำ ขนาดจุของ) พิมพ์บอกตรงนี้ AI จะเอาไปใช้
          </p>
        </div>

        {err && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[13px] text-rose-700">{err}</div>}

        {!res && !loading && !err && (
          <p className="py-8 text-center text-sm text-slate-400">กด “✨ ให้ AI คิด” แล้วรอสักครู่ (ประมาณ 10-20 วินาที)</p>
        )}
        {loading && <p className="py-8 text-center text-sm text-slate-400"><Spinner /> AI กำลังดูรูปและเขียนข้อความ…</p>}

        {res && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">AI ไม่ได้ส่งข้อความกลับมา — ลองกด “ให้คิดใหม่” อีกครั้ง</p>
        )}

        {rows.length > 0 && (
          <>
            {willOverwrite > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-800">
                ⚠️ มี {willOverwrite} ช่องที่ติ๊กไว้และ<b>มีข้อความเดิมอยู่แล้ว</b> — กด “ใช้ค่าที่เลือก” จะเขียนทับของเดิม (ยังไม่บันทึกจนกว่าจะกดบันทึกในฟอร์ม)
              </div>
            )}
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {rows.map((f) => {
                const now = String(current[f.key] ?? "").trim();
                const next = String(res?.[f.key] ?? "").trim();
                return (
                  <label key={f.key} className="flex gap-3 px-3 py-2.5 items-start cursor-pointer hover:bg-slate-50/70">
                    <input type="checkbox" checked={!!picked[f.key]}
                      onChange={(e) => setPicked((p) => ({ ...p, [f.key]: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-indigo-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[12.5px] font-semibold text-slate-700">{f.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${f.lang === "th" ? "bg-slate-100 text-slate-500" : "bg-sky-50 text-sky-600"}`}>
                          {f.lang === "th" ? "ไทย" : "EN"}
                        </span>
                        {isBlank(now)
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">เดิมว่าง</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">จะทับของเดิม</span>}
                      </div>
                      {!isBlank(now) && (
                        <p className="text-[11.5px] text-slate-400 line-through whitespace-pre-wrap break-words mb-1 max-h-16 overflow-y-auto">{now}</p>
                      )}
                      <p className={`text-[13px] text-slate-700 whitespace-pre-wrap break-words ${f.long ? "max-h-40 overflow-y-auto" : ""}`}>{next}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-[11.5px] text-slate-400">
              คำสั่งที่ AI ใช้เขียน ตั้งแยกรายแบรนด์ได้ที่หน้า <b>งาน → ตั้งค่า → คำสั่ง AI</b> (เลือกงาน “รายละเอียดสินค้า”)
            </p>
          </>
        )}
      </div>
    </ERPModal>
  );
}
