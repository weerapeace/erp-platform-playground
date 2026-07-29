"use client";

// ============================================================
// AiProductDetailModal — "✨ ให้ AI คิดรายละเอียดสินค้า" (ของกลาง)
//   AI ดูรูปสินค้า + ข้อมูลที่มีอยู่ → เขียน ชื่อสินค้า / Introduction / Description
//   ทั้งไทยและอังกฤษ แล้วให้ผู้ใช้ "ติ๊กเลือกทีละช่อง" ว่าจะเอาอันไหน (ไม่ทับทั้งดุ้น)
//   ค่าที่เลือกจะลงในฟอร์มเฉย ๆ — ต้องกดบันทึกเองอีกที
//   ขนาด/น้ำหนัก: เอามาเฉพาะที่ "มีตัวเลขเขียนอยู่ในรูป" (รูปสเปค/ตารางไซซ์) ห้าม AI กะจากสายตา
//   → แถวขนาดจะไม่ติ๊กให้อัตโนมัติเสมอ ต้องกดยืนยันเอง
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/spinner";

/** ช่องข้อความที่ AI เขียนให้ — เรียงตามที่เห็นในฟอร์ม */
const FIELDS: { key: string; label: string; lang: "th" | "en"; long?: boolean }[] = [
  { key: "name_th",             label: "ชื่อสินค้า",          lang: "th" },
  { key: "introduction",        label: "Introduction",        lang: "th", long: true },
  { key: "description",         label: "Description",         lang: "th", long: true },
  { key: "name_en",             label: "Name En",             lang: "en" },
  { key: "introduction_en",     label: "Introduction En",     lang: "en", long: true },
  { key: "english_description", label: "English Description", lang: "en", long: true },
];

/** ช่องขนาด — เอามาเฉพาะที่อ่านตัวเลขได้จากในรูป (ไม่ติ๊กให้อัตโนมัติ) */
const SIZE_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: "size_length_cm",    label: "Size Length Cm",    unit: "ซม." },
  { key: "size_height_cm",    label: "Size Height Cm",    unit: "ซม." },
  { key: "size_thickness_cm", label: "Size Thickness Cm", unit: "ซม." },
  { key: "weight_g",          label: "Weight G",          unit: "กรัม" },
  { key: "warranty",          label: "Warranty",          unit: "" },
];

type Sizes = Record<string, number | string | null>;
type Result = Record<string, string> & { image_count?: number; sizes?: Sizes | null; size_source?: string };

const isBlank = (v: unknown) => {
  const s = String(v ?? "").trim();
  return !s || s === "-" || s === "—" || s === "–";
};

/** คำสั่ง AI 1 ระดับ (ค่ากลาง หรือ เฉพาะแบรนด์นี้) */
type PromptRow = { brand_id: string | null; platform: string | null; prompt: string };

export function AiProductDetailModal({
  parentId, brandId, current, onApply, onClose,
}: {
  parentId: string;
  /** แบรนด์ของสินค้าตัวนี้ — ไว้ตั้งคำสั่ง AI เฉพาะแบรนด์ */
  brandId?: string | null;
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

  // ── แผงตั้งคำสั่ง AI (เปิด/ปิดในป๊อปเดียวกัน ไม่ต้องออกไปหน้าตั้งค่า) ──
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgScope, setCfgScope] = useState<"global" | "brand">("global");
  const [cfgRows, setCfgRows] = useState<PromptRow[] | null>(null);
  const [cfgDraft, setCfgDraft] = useState("");
  const [cfgBusy, setCfgBusy] = useState(false);
  const [cfgMsg, setCfgMsg] = useState("");

  const loadCfg = useCallback(async () => {
    try {
      const j = await apiFetch("/api/ai/caption-prompts").then((r) => r.json());
      setCfgRows(((j.data ?? []) as PromptRow[]).filter((r) => r.platform === "product_detail"));
    } catch { setCfgRows([]); }
  }, []);
  useEffect(() => { if (cfgOpen && cfgRows === null) void loadCfg(); }, [cfgOpen, cfgRows, loadCfg]);
  // เปลี่ยนระดับ → เติมข้อความของระดับนั้น (ไม่มี = ว่าง แปลว่ายังไม่ตั้ง จะใช้ระดับที่กว้างกว่า)
  useEffect(() => {
    if (!cfgRows) return;
    const want = cfgScope === "brand" ? brandId ?? null : null;
    setCfgDraft(cfgRows.find((r) => r.brand_id === want)?.prompt ?? "");
    setCfgMsg("");
  }, [cfgRows, cfgScope, brandId]);

  const saveCfg = async () => {
    if (!cfgDraft.trim()) { setCfgMsg("กรุณาใส่คำสั่งก่อนบันทึก"); return; }
    setCfgBusy(true); setCfgMsg("");
    try {
      const j = await apiFetch("/api/ai/caption-prompts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: cfgScope === "brand" ? brandId : null, platform: "product_detail", prompt: cfgDraft.trim() }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setCfgMsg("บันทึกคำสั่งแล้ว — กด “ให้คิดใหม่” เพื่อใช้คำสั่งใหม่");
      setCfgRows(null); void loadCfg();
    } catch (e) { setCfgMsg(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setCfgBusy(false); }
  };

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
      // ค่าเริ่มต้น: ติ๊กเฉพาะช่องข้อความที่ "ของเดิมยังว่าง" — ช่องที่มีข้อความอยู่แล้วไม่ติ๊กให้ (กันทับงานที่เขียนเอง)
      //   ช่องขนาดไม่ติ๊กให้เลย ต้องกดยืนยันเอง (ตัวเลขผิดกระทบค่าส่ง/ลูกค้าได้ของไม่ตรง)
      const init: Record<string, boolean> = {};
      for (const f of FIELDS) init[f.key] = !!String(data[f.key] ?? "").trim() && isBlank(current[f.key]);
      setPicked(init);
    } catch (e) { setErr(e instanceof Error ? e.message : "เรียก AI ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [parentId, extra, current]);

  const rows = res ? FIELDS.filter((f) => String(res[f.key] ?? "").trim()) : [];
  const sizeRows = res?.sizes
    ? SIZE_FIELDS.filter((f) => { const v = res.sizes?.[f.key]; return v !== null && v !== undefined && String(v).trim() !== ""; })
    : [];
  const pickedCount = [...rows, ...sizeRows].filter((f) => picked[f.key]).length;
  const willOverwrite = [...rows, ...sizeRows].filter((f) => picked[f.key] && !isBlank(current[f.key])).length;

  const apply = () => {
    if (!res) return;
    const out: Record<string, string> = {};
    for (const f of rows) if (picked[f.key]) out[f.key] = String(res[f.key] ?? "").trim();
    for (const f of sizeRows) if (picked[f.key]) out[f.key] = String(res.sizes?.[f.key] ?? "").trim();
    onApply(out);
    onClose();
  };

  return (
    <ERPModal open onClose={onClose} size="lg" title="✨ ให้ AI คิดรายละเอียดสินค้า"
      description="AI ดูรูปสินค้า (สูงสุด 10 รูป) + ข้อมูลที่กรอกไว้ → เขียนชื่อสินค้า / Introduction / Description ทั้งไทยและอังกฤษ · ขนาดจะเอามาให้เฉพาะที่มีตัวเลขเขียนอยู่ในรูป"
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
        {/* ⚙ ตั้งคำสั่ง AI — แก้ได้ในป๊อปนี้เลย ไม่ต้องออกไปหน้าตั้งค่า */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[12.5px] text-slate-500">คำสั่งที่ AI ใช้เขียน (ตั้งได้ทั้งค่ากลางและเฉพาะแบรนด์)</span>
          <button type="button" onClick={() => setCfgOpen((o) => !o)}
            className="h-8 px-3 text-[12.5px] font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            {cfgOpen ? "▲ ซ่อนคำสั่ง" : "⚙ ตั้งค่าคำสั่ง AI"}
          </button>
        </div>

        {cfgOpen && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white">
                <button type="button" onClick={() => setCfgScope("global")}
                  className={`h-8 px-3 text-[12px] font-medium ${cfgScope === "global" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
                  ค่ากลาง (ทุกแบรนด์)
                </button>
                <button type="button" onClick={() => setCfgScope("brand")} disabled={!brandId}
                  title={brandId ? "ตั้งคำสั่งเฉพาะแบรนด์ของสินค้าตัวนี้" : "สินค้าตัวนี้ยังไม่ได้ระบุแบรนด์"}
                  className={`h-8 px-3 text-[12px] font-medium border-l border-slate-200 disabled:opacity-40 ${cfgScope === "brand" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
                  เฉพาะแบรนด์นี้
                </button>
              </div>
              <span className="text-[11.5px] text-slate-400">
                {cfgScope === "brand" ? "ถ้าเว้นว่าง = ใช้ค่ากลาง" : "ใช้กับสินค้าทุกแบรนด์ที่ไม่ได้ตั้งเฉพาะ"}
              </span>
            </div>
            {cfgRows === null ? (
              <p className="text-[12.5px] text-slate-400 py-2"><Spinner /> กำลังโหลดคำสั่ง…</p>
            ) : (
              <>
                <textarea value={cfgDraft} onChange={(e) => setCfgDraft(e.target.value)} rows={7}
                  placeholder="เช่น เขียนโทนพรีเมียม เน้นงานคราฟต์ · ห้ามใช้คำว่า ถูกที่สุด · ปิดท้ายด้วยการรับประกัน"
                  className="w-full px-3 py-2 text-[13px] leading-relaxed border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 font-mono" />
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => void saveCfg()} disabled={cfgBusy}
                    className="h-8 px-3 text-[12.5px] font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
                    {cfgBusy ? "กำลังบันทึก…" : "บันทึกคำสั่ง"}
                  </button>
                  {cfgMsg && <span className="text-[12px] text-slate-500">{cfgMsg}</span>}
                </div>
                <p className="text-[11.5px] text-slate-400">
                  กติกาความปลอดภัย (ห้ามแต่งข้อมูลที่ไม่เห็น · ห้ามเดาขนาด · ต้องตอบเป็น JSON) ระบบใส่ให้อัตโนมัติเสมอ ไม่ต้องเขียนเอง ·
                  แก้จากหน้ารวมได้ที่ งาน → ตั้งค่า → Prompt แคปชั่น AI
                </p>
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-[12.5px] font-medium text-slate-600 mb-1">บอกใบ้เพิ่ม (ไม่บังคับ)</label>
          <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={500}
            placeholder="เช่น หนัง PU กันน้ำ · ใส่โน้ตบุ๊ก 15 นิ้วได้ · เหมาะกับนักเรียน"
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300" />
          <p className="mt-1 text-[11.5px] text-slate-400">
            AI เขียนจากสิ่งที่เห็นในรูปเท่านั้น — อะไรที่มองไม่เห็น (วัสดุจริง กันน้ำ ขนาดจุของ) พิมพ์บอกตรงนี้ AI จะเอาไปใช้ ·
            ถ้ามีรูปสเปคที่เขียนขนาดไว้ AI จะอ่านตัวเลขมาให้เลือกด้วย
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

            {/* ขนาดที่อ่านได้จากตัวเลขในรูป — ไม่ติ๊กให้อัตโนมัติ ต้องยืนยันเอง */}
            {sizeRows.length > 0 && (
              <div className="rounded-lg border border-sky-200 overflow-hidden">
                <div className="px-3 py-2 bg-sky-50 border-b border-sky-200">
                  <p className="text-[12.5px] font-semibold text-sky-800">📏 ขนาดที่ AI อ่านได้จากตัวเลขในรูป</p>
                  <p className="text-[11.5px] text-sky-700 mt-0.5">
                    {res?.size_source || "AI อ่านตัวเลขจากรูปสเปค"} · <b>เทียบกับสินค้าจริงก่อนติ๊ก</b> — ระบบไม่ติ๊กให้อัตโนมัติเพราะตัวเลขผิดจะกระทบค่าส่ง
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {sizeRows.map((f) => {
                    const now = String(current[f.key] ?? "").trim();
                    const next = String(res?.sizes?.[f.key] ?? "").trim();
                    const same = now !== "" && Number(now) === Number(next);
                    return (
                      <label key={f.key} className="flex gap-3 px-3 py-2 items-center cursor-pointer hover:bg-slate-50/70">
                        <input type="checkbox" checked={!!picked[f.key]}
                          onChange={(e) => setPicked((p) => ({ ...p, [f.key]: e.target.checked }))}
                          className="h-4 w-4 accent-sky-600 shrink-0" />
                        <span className="text-[12.5px] font-medium text-slate-600 w-[150px] shrink-0">{f.label}</span>
                        <span className="text-[12.5px] text-slate-400 tabular-nums">{isBlank(now) ? "— ว่าง" : now}</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-[13px] font-semibold text-sky-700 tabular-nums">{next} {f.unit}</span>
                        {same && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">ตรงกับของเดิม</span>}
                        {!same && !isBlank(now) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">ไม่ตรงของเดิม</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {res && !res.sizes && (
              <p className="text-[11.5px] text-slate-400">📏 ไม่พบตัวเลขขนาดเขียนอยู่ในรูป — ช่องขนาดจึงไม่ถูกแตะ (AI ไม่กะขนาดจากสายตา)</p>
            )}

            <p className="text-[11.5px] text-slate-400">
              ไม่ถูกใจผลลัพธ์? กด <b>⚙ ตั้งค่าคำสั่ง AI</b> ด้านบน แก้คำสั่ง แล้วกด “ให้คิดใหม่”
            </p>
          </>
        )}
      </div>
    </ERPModal>
  );
}
