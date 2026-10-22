"use client";
/**
 * 🎴 ตั้งค่าการ์ดของขวัญ (ป๊อป) — เปิดจากแท็บ 🏪 ข้อมูลร้าน กลุ่ม 🎀 ห่อของขวัญ
 *   ขนาดการ์ด (ปรับทีหลังได้) · ลายการ์ดของร้าน (อัปโหลดรูป + สีตัวหนังสือ + พื้นที่ข้อความ · ลากเรียง · เปิด/ปิด)
 *   โอกาส + ไอเดียข้อความ · ความยาวข้อความ · ไม่ระบุผู้ส่ง · แบบตัวหนังสือ — พรีวิวการ์ดจริงด้านขวา
 *   🎀 แบบห่อ (ชื่อ/รูป/ราคา · เปิด/ปิด · ลากเรียง) — มีแบบห่อ = ลูกค้าเลือกแบบ ราคาตามแบบ (แทนค่าห่อในข้อมูลร้าน)
 * บันทึก = ขึ้นเว็บทันที (ไม่ต้องเผยแพร่)
 * ของกลาง: ERPModal/ConfirmDialog · useDragReorder · ImageUploadField · ColorInput · lib/website-gift-cards (ตัววาดเดียวกับเว็บร้าน/หน้าพิมพ์)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { ImageUploadField } from "@/components/website-theme-media";
import { ColorInput } from "@/components/color-picker";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  GIFT_AREAS,
  GIFT_FONTS,
  GIFT_FONTS_HREF,
  GIFT_SIZE_PRESETS,
  giftCardHtml,
  normalizeGiftCards,
  type GiftCardConfig,
  type GiftCardDesign,
  type GiftFontKey,
  type GiftWrapStyle,
} from "@/lib/website-gift-cards";

const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 bg-white";
const lbl = "block text-[11px] text-slate-500 mb-1";
const seg = (on: boolean) => `px-2.5 py-1 text-xs rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
const newId = (p: string) => `${p}${Date.now().toString(36).slice(-5)}`;

/** การ์ด 1 ใบ (พรีวิว) — ตัววาดเดียวกับเว็บร้านและหน้าพิมพ์ */
export function GiftCardPreview({ cfg, design, to, from, message, font, className }: { cfg: GiftCardConfig; design: GiftCardDesign; to: string; from: string; message: string; font: GiftFontKey; className?: string }) {
  const html = giftCardHtml(cfg, design, { to, from, message, font }, r2ImageUrl(design.imageKey, 900), "ข้อความบนการ์ด");
  return (
    <>
      <link rel="stylesheet" href={GIFT_FONTS_HREF} />
      <div className={`rounded-md overflow-hidden ring-1 ring-slate-200 ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

export function GiftCardsEditor({ open, onClose, shopSlug, shopId }: { open: boolean; onClose: () => void; shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<GiftCardConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [font, setFont] = useState<GiftFontKey>("hand");
  const [del, setDel] = useState<GiftCardDesign | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await (await apiFetch(`/api/website/gift-cards?shop=${encodeURIComponent(shopSlug)}`)).json();
      if (j.error) return toast.error(j.error);
      const c = normalizeGiftCards(j.config);
      setCfg(c);
      setSaved(JSON.stringify(c));
    } catch {
      toast.error("โหลดตั้งค่าการ์ดไม่สำเร็จ");
    }
  }, [shopSlug, toast]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const dirty = !!cfg && JSON.stringify(cfg) !== saved;
  const set = (p: Partial<GiftCardConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));
  const setDesign = (id: string, p: Partial<GiftCardDesign>) => setCfg((c) => (c ? { ...c, designs: c.designs.map((d) => (d.id === id ? { ...d, ...p } : d)) } : c));
  const dragD = useDragReorder((a, b) => setCfg((c) => (c ? { ...c, designs: moveItem(c.designs, a, b) } : c)));
  const dragO = useDragReorder((a, b) => setCfg((c) => (c ? { ...c, occasions: moveItem(c.occasions, a, b) } : c)));
  const dragW = useDragReorder((a, b) => setCfg((c) => (c ? { ...c, wraps: moveItem(c.wraps, a, b) } : c)));
  const setWrap = (id: string, p: Partial<GiftWrapStyle>) => setCfg((c) => (c ? { ...c, wraps: c.wraps.map((w) => (w.id === id ? { ...w, ...p } : w)) } : c));

  const pv = useMemo(() => cfg?.designs.find((d) => d.id === previewId) ?? cfg?.designs.find((d) => d.enabled) ?? cfg?.designs[0], [cfg, previewId]);
  const sample = cfg?.occasions[0]?.messages[0] ?? "สุขสันต์วันเกิดนะ ขอให้ปีนี้เป็นปีที่ดีที่สุด";

  const save = async () => {
    if (!cfg) return;
    if (!cfg.designs.some((d) => d.enabled)) return toast.error("ต้องเปิดลายการ์ดอย่างน้อย 1 ลาย");
    setSaving(true);
    try {
      const j = await (await apiFetch("/api/website/gift-cards", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, config: cfg }) })).json();
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      const c = normalizeGiftCards(j.config);
      setCfg(c);
      setSaved(JSON.stringify(c));
      toast.success("บันทึกการ์ดแล้ว — เว็บอัปเดตเลย");
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const addDesign = () => {
    if (!cfg) return;
    const d: GiftCardDesign = { id: newId("d"), name: `ลาย ${cfg.designs.length + 1}`, imageKey: null, bg: "#FFFFFF", color: "#3F3A33", area: "full", align: "center", enabled: true };
    set({ designs: [...cfg.designs, d] });
    setOpenId(d.id);
    setPreviewId(d.id);
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="🎴 ตั้งค่าการ์ด + 🎀 แบบห่อ"
      description="ลูกค้าที่ติ๊กห่อของขวัญ/การ์ด จะเลือกแบบห่อและเขียนการ์ดได้ตามนี้ — บันทึกแล้วขึ้นเว็บเลย"
      size="xl"
      hasUnsavedChanges={dirty}
      footer={
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-700">มีการแก้ไขที่ยังไม่บันทึก</span>}
          <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40">
            {saving ? "กำลังบันทึก…" : "💾 บันทึก"}
          </button>
        </div>
      }
    >
      {!cfg ? (
        <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5 min-w-0">
            {/* ขนาด */}
            <section>
              <h4 className="text-sm font-semibold text-slate-800 mb-2">📐 ขนาดการ์ด</h4>
              <div className="flex flex-wrap gap-1.5">
                {GIFT_SIZE_PRESETS.map((p) => (
                  <button key={p.key} type="button" className={seg(cfg.size.preset === p.key)} onClick={() => set({ size: p.key === "custom" ? { preset: "custom", w: cfg.size.w, h: cfg.size.h } : { preset: p.key, w: p.w, h: p.h } })}>
                    {p.label}
                  </button>
                ))}
              </div>
              {cfg.size.preset === "custom" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  กว้าง
                  <input type="number" min={50} max={210} value={cfg.size.w} onChange={(e) => set({ size: { ...cfg.size, w: Number(e.target.value) || 50 } })} className={`${inputCls} w-20`} />
                  × สูง
                  <input type="number" min={50} max={210} value={cfg.size.h} onChange={(e) => set({ size: { ...cfg.size, h: Number(e.target.value) || 50 } })} className={`${inputCls} w-20`} />
                  มม. (50–210)
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1.5">เปลี่ยนขนาดทีหลังได้ — การ์ดที่ยังไม่พิมพ์จะพิมพ์ตามขนาดใหม่ · ลายการ์ดควรทำสัดส่วนเดียวกับขนาดนี้</p>
            </section>

            {/* ลายการ์ด */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800">🎨 ลายการ์ดของร้าน</h4>
                <button type="button" onClick={addDesign} className="text-xs text-blue-600 hover:underline">
                  + เพิ่มลายการ์ด
                </button>
              </div>
              <ul className="space-y-1.5">
                {cfg.designs.map((d, i) => {
                  const isOpen = openId === d.id;
                  return (
                    <li key={d.id} {...dragD.rowProps(i)} className={`rounded-lg border bg-white ${isOpen ? "border-blue-300" : "border-slate-200"} ${dragD.rowCls(i)} ${d.enabled ? "" : "opacity-60"}`}>
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <DragHandle {...dragD.handleProps(i)} />
                        <button type="button" onClick={() => setPreviewId(d.id)} className="w-16 shrink-0" title="ดูพรีวิว">
                          <GiftCardPreview cfg={cfg} design={d} to="" from="" message="" font={font} />
                        </button>
                        <input value={d.name} onChange={(e) => setDesign(d.id, { name: e.target.value.slice(0, 40) })} className={`${inputCls} flex-1 min-w-0`} />
                        <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={d.enabled} onChange={(e) => setDesign(d.id, { enabled: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                          เปิด
                        </label>
                        <button type="button" onClick={() => { setOpenId(isOpen ? null : d.id); setPreviewId(d.id); }} className={`text-xs px-2 py-1 rounded border ${isOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                          ⚙
                        </button>
                        <button type="button" onClick={() => setDel(d)} disabled={cfg.designs.length <= 1} className="text-xs text-rose-500 px-1 disabled:opacity-30" title="ลบลายนี้">
                          🗑
                        </button>
                      </div>
                      {isOpen && (
                        <div className="border-t border-slate-100 px-3 py-3 grid gap-3 sm:grid-cols-2 bg-slate-50/40">
                          <div className="sm:col-span-2">
                            <ImageUploadField label="รูปลายการ์ด" hint={`แนะนำสัดส่วน ${cfg.size.w}:${cfg.size.h} (เช่น ${cfg.size.w * 12}×${cfg.size.h * 12} px) · ไม่ใส่ = พื้นสีเรียบ`} value={d.imageKey} onChange={(k) => setDesign(d.id, { imageKey: k })} height={72} />
                          </div>
                          <div>
                            <label className={lbl}>สีตัวหนังสือ</label>
                            <ColorInput value={d.color} onChange={(v) => setDesign(d.id, { color: v })} />
                          </div>
                          <div>
                            <label className={lbl}>สีพื้น (ใช้เมื่อไม่มีรูป / ระหว่างรูปโหลด)</label>
                            <ColorInput value={d.bg} onChange={(v) => setDesign(d.id, { bg: v })} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={lbl}>พื้นที่วางข้อความ (เว้นที่ให้ลวดลายบนรูป)</label>
                            <div className="flex flex-wrap gap-1.5">
                              {GIFT_AREAS.map((a) => (
                                <button key={a.key} type="button" className={seg(d.area === a.key)} onClick={() => setDesign(d.id, { area: a.key })}>
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className={lbl}>จัดข้อความ</label>
                            <div className="flex gap-1.5">
                              <button type="button" className={seg(d.align === "center")} onClick={() => setDesign(d.id, { align: "center" })}>กึ่งกลาง</button>
                              <button type="button" className={seg(d.align === "left")} onClick={() => setDesign(d.id, { align: "left" })}>ชิดซ้าย</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 🎀 แบบห่อ */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800">🎀 แบบห่อของขวัญ</h4>
                <button
                  type="button"
                  onClick={() => set({ wraps: [...cfg.wraps, { id: newId("w"), name: cfg.wraps.length ? `แบบ ${cfg.wraps.length + 1}` : "กระดาษคราฟท์", nameEn: "", fee: 0, imageKey: null, enabled: true }] })}
                  disabled={cfg.wraps.length >= 8}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-40"
                >
                  + เพิ่มแบบห่อ
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                ไม่มีแบบห่อ = ห่อแบบเดียว ราคาตาม “ค่าห่อ” ในข้อมูลร้าน (แบบเดิม) · มีแบบห่อ = ลูกค้าเลือกแบบ และคิดราคาตามแบบ (0 = ฟรี) · ห่อรายชิ้นคิด × จำนวนชิ้น
              </p>
              {cfg.wraps.length > 0 && (
                <ul className="space-y-1.5">
                  {cfg.wraps.map((w, i) => (
                    <li key={w.id} {...dragW.rowProps(i)} className={`rounded-lg border border-slate-200 bg-white px-2 py-2 ${dragW.rowCls(i)} ${w.enabled ? "" : "opacity-60"}`}>
                      <div className="flex items-start gap-2">
                        <DragHandle {...dragW.handleProps(i)} />
                        <div className="w-24 shrink-0">
                          <ImageUploadField label="" value={w.imageKey} onChange={(k) => setWrap(w.id, { imageKey: k })} height={56} />
                        </div>
                        <div className="flex-1 min-w-0 grid gap-1.5 sm:grid-cols-3">
                          <div>
                            <label className={lbl}>ชื่อแบบ</label>
                            <input value={w.name} onChange={(e) => setWrap(w.id, { name: e.target.value.slice(0, 40) })} className={inputCls} placeholder="กล่องของขวัญ" />
                          </div>
                          <div>
                            <label className={lbl}>ชื่ออังกฤษ (ไม่ใส่ = ใช้ชื่อไทย)</label>
                            <input value={w.nameEn} onChange={(e) => setWrap(w.id, { nameEn: e.target.value.slice(0, 40) })} className={inputCls} placeholder="Gift box" />
                          </div>
                          <div>
                            <label className={lbl}>ราคา (บาท · 0 = ฟรี)</label>
                            <input type="number" min={0} value={w.fee} onChange={(e) => setWrap(w.id, { fee: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} />
                          </div>
                        </div>
                        <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer whitespace-nowrap mt-5">
                          <input type="checkbox" checked={w.enabled} onChange={(e) => setWrap(w.id, { enabled: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                          เปิด
                        </label>
                        <button type="button" onClick={() => set({ wraps: cfg.wraps.filter((x) => x.id !== w.id) })} className="text-xs text-rose-500 px-1 mt-5" title="ลบแบบห่อนี้">
                          🗑
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* โอกาส */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800">💡 โอกาส + ไอเดียข้อความ</h4>
                <button type="button" onClick={() => set({ occasions: [...cfg.occasions, { id: newId("o"), label: "โอกาสใหม่", messages: [] }] })} disabled={cfg.occasions.length >= 12} className="text-xs text-blue-600 hover:underline disabled:opacity-40">
                  + เพิ่มโอกาส
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">ลูกค้ากดโอกาสแล้วระบบเติมข้อความแรกให้ (ทั้งหน้าชำระเงินและการ์ดรายชิ้นในตะกร้า) · ไอเดียข้อความ 1 บรรทัด = 1 ข้อความ (ไม่เกิน 8)</p>
              <ul className="space-y-1.5">
                {cfg.occasions.map((o, i) => (
                  <li key={o.id} {...dragO.rowProps(i)} className={`rounded-lg border border-slate-200 bg-white px-2 py-2 flex gap-2 ${dragO.rowCls(i)}`}>
                    <DragHandle {...dragO.handleProps(i)} />
                    <div className="w-32 shrink-0">
                      <input value={o.label} onChange={(e) => set({ occasions: cfg.occasions.map((x) => (x.id === o.id ? { ...x, label: e.target.value.slice(0, 30) } : x)) })} className={inputCls} placeholder="วันเกิด" />
                    </div>
                    <textarea
                      rows={Math.max(2, o.messages.length)}
                      value={o.messages.join("\n")}
                      onChange={(e) => set({ occasions: cfg.occasions.map((x) => (x.id === o.id ? { ...x, messages: e.target.value.split("\n").slice(0, 8) } : x)) })}
                      className={`${inputCls} flex-1 min-w-0`}
                      placeholder="สุขสันต์วันเกิดนะ ขอให้ปีนี้เป็นปีที่ดีที่สุด"
                    />
                    <button type="button" onClick={() => set({ occasions: cfg.occasions.filter((x) => x.id !== o.id) })} className="text-xs text-rose-500 px-1 self-start" title="ลบโอกาสนี้">
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* กติกา */}
            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lbl}>ข้อความยาวสุด (ตัวอักษร · 30–300)</label>
                <input type="number" min={30} max={300} value={cfg.maxChars} onChange={(e) => set({ maxChars: Number(e.target.value) || 30 })} className={inputCls} />
              </div>
              <div>
                <label className={lbl}>บรรทัดสูงสุด (2–12)</label>
                <input type="number" min={2} max={12} value={cfg.maxLines} onChange={(e) => set({ maxLines: Number(e.target.value) || 2 })} className={inputCls} />
              </div>
              <div>
                <label className={lbl}>แบบตัวหนังสือที่ให้เลือก</label>
                <div className="flex flex-wrap gap-3">
                  {GIFT_FONTS.map((f) => (
                    <label key={f.key} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer" style={{ fontFamily: f.family }}>
                      <input
                        type="checkbox"
                        checked={cfg.fonts.includes(f.key)}
                        onChange={(e) => set({ fonts: e.target.checked ? [...cfg.fonts, f.key] : cfg.fonts.filter((x) => x !== f.key).length ? cfg.fonts.filter((x) => x !== f.key) : cfg.fonts })}
                        className="w-4 h-4 accent-blue-600"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer self-end">
                <input type="checkbox" checked={cfg.allowAnon} onChange={(e) => set({ allowAnon: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                ให้ลูกค้าเลือก &quot;ไม่ระบุชื่อผู้ส่ง&quot;
              </label>
            </section>
          </div>

          {/* พรีวิว */}
          <aside className="lg:sticky lg:top-0 self-start space-y-2">
            <p className="text-xs font-medium text-slate-600">พรีวิวการ์ดจริง — {pv?.name}</p>
            {pv && <GiftCardPreview cfg={cfg} design={pv} to="คุณแม่" from="น้องมิว" message={sample} font={font} />}
            <div className="flex gap-1.5">
              {GIFT_FONTS.filter((f) => cfg.fonts.includes(f.key)).map((f) => (
                <button key={f.key} type="button" className={seg(font === f.key)} style={{ fontFamily: f.family }} onClick={() => setFont(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              ขนาดจริง {cfg.size.w / 10} × {cfg.size.h / 10} ซม. · ข้อความยาวขึ้นตัวหนังสือเล็กลงเอง · พิมพ์ที่ออเดอร์ (🧾) → 🖨 พิมพ์การ์ด
            </p>
          </aside>
        </div>
      )}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del && cfg) set({ designs: cfg.designs.filter((x) => x.id !== del.id) });
          setDel(null);
        }}
        title="ลบลายการ์ดนี้?"
        message={`"${del?.name ?? ""}" จะหายจากตัวเลือกของลูกค้า (ออเดอร์เก่าที่ใช้ลายนี้จะพิมพ์เป็นลายแรกแทน) — กดบันทึกด้านล่างเพื่อให้มีผล`}
        confirmText="ลบ"
        variant="danger"
      />
    </ERPModal>
  );
}
