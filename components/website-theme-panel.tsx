"use client";

/**
 * WebsiteThemePanel — แท็บ "🎨 ดีไซน์" ในหน้า /website/<slug>
 * ตั้งสี/ฟอนต์/ความมน/โลโก้ของเว็บร้าน แล้วเว็บจริงเปลี่ยนตาม (อ่านผ่าน /api/public/storefront/site)
 * มีพรีวิวสดด้านขวา — เห็นผลก่อนบันทึก
 * ข้อมูล: /api/website/theme (guardApi + audit + เก็บประวัติใน store_theme_versions)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

type Radius = "sharp" | "soft" | "round";

interface Theme {
  colors: { brand: string; brandDeep: string; ink: string; page: string; surface: string; muted: string };
  fonts: { display: string; body: string };
  radius: Radius;
  logo: { mark: string; text: string };
}

const COLOR_FIELDS: { key: keyof Theme["colors"]; label: string; hint: string }[] = [
  { key: "brand", label: "สีหลักแบรนด์", hint: "ปุ่ม ไฮไลต์ ลิงก์" },
  { key: "brandDeep", label: "สีหลักเข้ม", hint: "ตอนชี้เมาส์" },
  { key: "ink", label: "สีตัวอักษรหลัก", hint: "หัวข้อ เนื้อหา" },
  { key: "muted", label: "สีตัวอักษรรอง", hint: "คำอธิบายจาง ๆ" },
  { key: "page", label: "สีพื้นหลังเว็บ", hint: "พื้นหลังทั้งหน้า" },
  { key: "surface", label: "สีพื้นการ์ด", hint: "กล่อง/การ์ดสินค้า" },
];

const RADIUS_PX: Record<Radius, number> = { sharp: 2, soft: 12, round: 24 };

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

export function WebsiteThemePanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [fonts, setFonts] = useState<string[]>([]);
  const [radii, setRadii] = useState<{ value: Radius; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/theme?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) toast.error(j.error);
      setTheme(j.theme ?? null);
      setFonts(j.fontChoices ?? []);
      setRadii(j.radiusChoices ?? []);
    } catch {
      toast.error("โหลดธีมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const setColor = (k: keyof Theme["colors"], v: string) =>
    setTheme((t) => (t ? { ...t, colors: { ...t.colors, [k]: v } } : t));

  const save = async () => {
    if (!theme) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/website/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, theme }),
      });
      const j = await r.json();
      if (j.ok) {
        setTheme(j.theme);
        toast.success(`บันทึกธีมแล้ว (เวอร์ชัน ${j.version}) — เว็บจะเปลี่ยนภายใน ~1 นาที`);
      } else toast.error(j.error ?? "บันทึกไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (!theme) return <div className="py-16 text-center text-sm text-slate-400">โหลดธีมไม่สำเร็จ</div>;

  const r = RADIUS_PX[theme.radius];

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-50/60 border border-blue-200 px-4 py-3">
        <p className="text-sm text-slate-700">
          ตั้งสี/ตัวอักษรของเว็บร้านนี้ — <span className="font-medium">เว็บจริงจะเปลี่ยนตามภายใน ~1 นาที</span>
        </p>
        <p className="text-xs text-slate-500 mt-0.5">ทุกครั้งที่บันทึกจะเก็บเป็นเวอร์ชันไว้ ย้อนกลับได้ภายหลัง</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
        {/* ── ฝั่งตั้งค่า ── */}
        <div className="space-y-4">
          {/* สี */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">สี</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls}>
                    {f.label} <span className="text-slate-400">· {f.hint}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.colors[f.key]}
                      onChange={(e) => setColor(f.key, e.target.value)}
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5"
                      aria-label={f.label}
                    />
                    <input
                      value={theme.colors[f.key]}
                      onChange={(e) => setColor(f.key, e.target.value)}
                      className={inputCls}
                      placeholder="#000000"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ตัวอักษร + ความมน */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">ตัวอักษร &amp; รูปทรง</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>ฟอนต์หัวข้อ</label>
                <select
                  className={inputCls}
                  value={theme.fonts.display}
                  onChange={(e) => setTheme({ ...theme, fonts: { ...theme.fonts, display: e.target.value } })}
                >
                  {fonts.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>ฟอนต์เนื้อหา</label>
                <select
                  className={inputCls}
                  value={theme.fonts.body}
                  onChange={(e) => setTheme({ ...theme, fonts: { ...theme.fonts, body: e.target.value } })}
                >
                  {fonts.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>ความมนของขอบ</label>
                <select
                  className={inputCls}
                  value={theme.radius}
                  onChange={(e) => setTheme({ ...theme, radius: e.target.value as Radius })}
                >
                  {radii.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* โลโก้ */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">โลโก้</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>อักษรในกล่อง (1-4 ตัว)</label>
                <input
                  className={inputCls}
                  maxLength={4}
                  value={theme.logo.mark}
                  onChange={(e) => setTheme({ ...theme, logo: { ...theme.logo, mark: e.target.value } })}
                  placeholder="IG"
                />
              </div>
              <div>
                <label className={labelCls}>ข้อความต่อท้าย</label>
                <input
                  className={inputCls}
                  value={theme.logo.text}
                  onChange={(e) => setTheme({ ...theme, logo: { ...theme.logo, text: e.target.value } })}
                  placeholder="International"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── พรีวิวสด ── */}
        <div className="lg:sticky lg:top-4">
          <p className="text-[11px] font-medium text-slate-500 mb-2">ตัวอย่างหน้าเว็บ (สด)</p>
          <div
            className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
            style={{ background: theme.colors.page, fontFamily: `"${theme.fonts.body}", system-ui, sans-serif` }}
          >
            {/* หัวเว็บ */}
            <div
              className="flex items-center gap-2 px-4 h-12"
              style={{ background: theme.colors.surface, borderBottom: "1px solid rgba(0,0,0,0.06)" }}
            >
              <span
                className="inline-flex items-center justify-center text-white font-semibold"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: Math.min(r, 8),
                  background: theme.colors.brand,
                  fontSize: 11,
                  fontFamily: `"${theme.fonts.display}", sans-serif`,
                }}
              >
                {theme.logo.mark || "?"}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: theme.colors.ink, fontFamily: `"${theme.fonts.display}", sans-serif` }}
              >
                {theme.logo.text || "ชื่อร้าน"}
              </span>
              <span className="ml-auto text-[10px]" style={{ color: theme.colors.muted }}>
                ร้านวัสดุ · ติดต่อ
              </span>
            </div>

            {/* hero */}
            <div className="px-4 py-5" style={{ background: theme.colors.ink }}>
              <p className="text-[9px] tracking-widest uppercase mb-1.5" style={{ color: theme.colors.brand }}>
                รับผลิต &amp; วัสดุ
              </p>
              <p
                className="text-white font-semibold leading-tight"
                style={{ fontSize: 19, fontFamily: `"${theme.fonts.display}", sans-serif` }}
              >
                งานหนังคุณภาพ
                <br />
                <span style={{ color: theme.colors.brand }}>ครบ จบ ที่เดียว</span>
              </p>
              <div className="flex gap-2 mt-3">
                <span
                  className="px-3 py-1.5 text-[10px] font-semibold text-white"
                  style={{ background: theme.colors.brand, borderRadius: 99 }}
                >
                  ขอใบเสนอราคา
                </span>
                <span
                  className="px-3 py-1.5 text-[10px] font-semibold"
                  style={{ color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 99 }}
                >
                  เข้าร้านวัสดุ
                </span>
              </div>
            </div>

            {/* การ์ดสินค้า */}
            <div className="px-4 py-4">
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: theme.colors.ink, fontFamily: `"${theme.fonts.display}", sans-serif` }}
              >
                วัสดุแนะนำ
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["หนังวัวฟอกฝาด", "หัวเข็มขัดทองเหลือง"].map((n, i) => (
                  <div
                    key={n}
                    style={{
                      background: theme.colors.surface,
                      borderRadius: r,
                      border: "1px solid rgba(0,0,0,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "4/3",
                        background: i === 0 ? "linear-gradient(135deg,#C89A5B,#8A5A2E)" : "linear-gradient(135deg,#D9C083,#A98A3C)",
                      }}
                    />
                    <div className="p-2">
                      <p className="text-[10px] leading-tight" style={{ color: theme.colors.ink }}>
                        {n}
                      </p>
                      <p className="text-[10px] font-semibold mt-0.5" style={{ color: theme.colors.brand }}>
                        ฿340
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            ตัวอย่างคร่าว ๆ — หน้าจริงจะใช้สี/ฟอนต์ชุดเดียวกันนี้
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-slate-50/80 backdrop-blur py-3">
        <button
          onClick={() => void load()}
          className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-slate-400"
        >
          ยกเลิกการแก้ไข
        </button>
        <button
          onClick={() => void save()}
          disabled={saving}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกธีม"}
        </button>
      </div>
    </div>
  );
}
