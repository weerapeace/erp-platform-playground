"use client";

/**
 * TagUsageModal — ป๊อป "🔗 แท็กนี้ลิงก์อยู่กับอะไรบ้าง" (ของกลาง)
 *   สินค้าที่ติดแท็ก · เว็บไซต์ (ต่อร้าน: ขึ้นเว็บกี่รุ่น อยู่หมวดไหน) · แท็กแม่/แท็กย่อย · กฎ AI · รหัสนำหน้า SKU
 * ใช้ที่: หน้า Tags Manager (แถวแก้ชื่ออังกฤษ) · ป๊อป 🗂️ จัดการแท็ก (ป๊อปแก้ชื่อแท็ก)
 * ข้อมูล: GET /api/product-tags/usage?tag_id= (อ่านอย่างเดียว)
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";

type Usage = {
  tag: { id: string; name: string; name_en: string | null; code_prefix: string | null; default_name: string | null; group_path: string[] };
  parents: { id: string; name: string }[];
  children: { id: string; name: string }[];
  products: { parent_count: number; active_count: number; sku_count: number; sample: { id: string; code: string; name: string; image_key: string | null; is_active: boolean }[] };
  websites: { shop_id: string; shop_name: string; slug: string; listed: number; published: number; not_listed: number; no_category: number; categories: { key: string; label: string; count: number; codes: string[] }[] }[];
  ai_rules: { id: string; name: string; is_active: boolean }[];
};

export function TagUsageModal({ tagId, onClose, zIndex }: {
  /** null = ปิด */
  tagId: string | null;
  onClose: () => void;
  /** เปิดจากป๊อปชั้นสูง (เช่น 🗂️ จัดการแท็ก) ให้ส่งชั้นที่สูงกว่า */
  zIndex?: number;
}) {
  const [data, setData] = useState<Usage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tagId) return;
    let alive = true;
    setLoading(true); setErr(null); setData(null);
    apiFetch(`/api/product-tags/usage?tag_id=${encodeURIComponent(tagId)}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error || !j.data) setErr(j.error || "โหลดข้อมูลไม่สำเร็จ"); else setData(j.data as Usage); })
      .catch(() => { if (alive) setErr("เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tagId]);

  const n = (v: number) => v.toLocaleString("th-TH");
  const sec = "rounded-xl border border-slate-200 bg-white p-3";
  const h = "mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700";

  return (
    <ERPModal open={!!tagId} onClose={onClose} size="lg" defaultExpanded={false} zIndex={zIndex}
      title={data ? `🔗 แท็ก “${data.tag.name}” ลิงก์อยู่กับอะไรบ้าง` : "🔗 แท็กนี้ลิงก์อยู่กับอะไรบ้าง"}
      footer={<button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ปิด</button>}>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{err}</div>
      ) : data ? (
        <div className="space-y-3">
          {/* ตัวแท็ก */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold text-slate-800">{data.tag.name}</span>
            <span className={data.tag.name_en ? "text-slate-500" : "text-amber-600"}>{data.tag.name_en ? `EN: ${data.tag.name_en}` : "ยังไม่มีชื่ออังกฤษ"}</span>
            <span className="text-slate-400">กลุ่ม: {data.tag.group_path.length ? data.tag.group_path.join(" ↳ ") : "ไม่มีกลุ่ม"}</span>
          </div>
          {(data.parents.length > 0 || data.children.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {data.parents.length > 0 && <><span className="text-slate-500">แท็กแม่:</span>{data.parents.map((p) => <span key={p.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">{p.name}</span>)}</>}
              {data.children.length > 0 && <><span className="ml-2 text-slate-500">แท็กย่อย:</span>{data.children.map((c) => <span key={c.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">↳ {c.name}</span>)}</>}
            </div>
          )}

          {/* สินค้า */}
          <div className={sec}>
            <div className={h}>📦 สินค้าที่ติดแท็กนี้
              <span className="text-xs font-normal text-slate-500">Parent SKU {n(data.products.parent_count)} รุ่น{data.products.parent_count !== data.products.active_count ? ` (เปิดใช้ ${n(data.products.active_count)})` : ""} · SKU ย่อย {n(data.products.sku_count)} ตัว</span>
            </div>
            {data.products.parent_count === 0 ? (
              <p className="text-xs text-slate-400">ยังไม่มีสินค้าที่ติดแท็กนี้ — ใส่แท็กให้สินค้าได้ที่หน้านี้ (ชุดแท็กด้านบน) หรือในหน้าสินค้า</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {data.products.sample.map((p) => {
                    const img = r2ImageUrl(p.image_key, 160);
                    return (
                      <Link key={p.id} href={`/master/parent-skus?open=${encodeURIComponent(p.id)}`} target="_blank" title={`${p.code} · ${p.name}${p.is_active ? "" : " (ปิดใช้งาน)"}`}
                        className={`group overflow-hidden rounded-lg border border-slate-200 hover:border-blue-400 ${p.is_active ? "" : "opacity-50"}`}>
                        <div className="aspect-square bg-slate-50">
                          {img ? <img src={img} alt={p.code} loading="lazy" className="h-full w-full object-cover" /> /* eslint-disable-line @next/next/no-img-element */
                            : <div className="flex h-full items-center justify-center text-2xl text-slate-300">📦</div>}
                        </div>
                        <div className="truncate px-1.5 py-1 text-[11px] font-medium text-slate-700 group-hover:text-blue-700">{p.code}</div>
                      </Link>
                    );
                  })}
                </div>
                {data.products.parent_count > data.products.sample.length && (
                  <p className="mt-2 text-xs text-slate-400">และอีก {n(data.products.parent_count - data.products.sample.length)} รุ่น</p>
                )}
              </>
            )}
          </div>

          {/* เว็บไซต์ */}
          <div className={sec}>
            <div className={h}>🌐 เว็บไซต์ — รุ่นที่ติดแท็กนี้อยู่หมวดไหนบนเว็บ</div>
            {data.websites.length === 0 ? (
              <p className="text-xs text-slate-400">{data.products.parent_count ? "ยังไม่มีรุ่นที่ติดแท็กนี้ขึ้นเว็บไซต์ร้านไหน" : "—"}</p>
            ) : (
              <div className="space-y-2.5">
                {data.websites.map((w) => (
                  <div key={w.shop_id}>
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-medium text-slate-800">{w.shop_name}</span>
                      <span className="text-xs text-slate-500">ขึ้นเว็บ {n(w.listed)} รุ่น (เผยแพร่ {n(w.published)}){w.not_listed > 0 ? ` · ยังไม่ขึ้นเว็บนี้ ${n(w.not_listed)} รุ่น` : ""}</span>
                      <Link href={`/website/${encodeURIComponent(w.slug)}`} target="_blank" className="ml-auto text-xs text-blue-600 hover:underline">เปิดหน้าจัดเว็บ ↗</Link>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {w.categories.map((c) => (
                        <span key={c.key} title={c.codes.join(", ") + (c.count > c.codes.length ? " …" : "")}
                          className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">📂 {c.label} <span className="text-blue-500">{n(c.count)}</span></span>
                      ))}
                      {w.no_category > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">ยังไม่อยู่หมวดไหน {n(w.no_category)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">หมวดบนเว็บมาจากการจัดหมวดของแต่ละรุ่น (หน้าจัดเว็บ แท็บ 📂 หมวดหมู่) — แท็กยังไม่ได้กำหนดหมวดเว็บเอง ตัวเลขนี้นับจากสินค้าจริง</p>
          </div>

          {/* อื่น ๆ ที่ใช้แท็กนี้ */}
          <div className={sec}>
            <div className={h}>⚙️ ที่อื่นที่ใช้แท็กนี้</div>
            <ul className="space-y-1 text-xs text-slate-600">
              <li>🤖 กฎ AI เขียนรายละเอียด: {data.ai_rules.length
                ? data.ai_rules.map((r) => <span key={r.id} className={`mr-1.5 rounded border px-1.5 py-0.5 ${r.is_active ? "border-slate-200" : "border-slate-100 text-slate-400 line-through"}`}>{r.name}</span>)
                : <span className="text-slate-400">ไม่มี</span>}</li>
              <li>🔢 รหัสนำหน้า SKU: {data.tag.code_prefix ? <span className="font-mono">{data.tag.code_prefix}</span> : <span className="text-slate-400">ไม่ได้ตั้ง</span>}</li>
              {data.tag.default_name && <li>🏷️ ชื่อตั้งต้นตอนสร้างสินค้า: {data.tag.default_name}</li>}
            </ul>
          </div>
        </div>
      ) : null}
    </ERPModal>
  );
}
