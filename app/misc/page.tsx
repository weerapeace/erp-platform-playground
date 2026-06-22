"use client";

/**
 * /misc — App Portal "งานอื่นๆ" 🗂️
 *
 * โชว์แอปเล็ก ๆ ในกลุ่ม misc เป็นการ์ดไอคอน (อ่านจากทะเบียนเมนู erp_menu_items)
 * โหมด "จัดการ" (แอดมิน): เพิ่ม/แก้ชื่อ+ไอคอน/ลากเรียง/ซ่อน/ลบ → บันทึกผ่าน /api/menu (ทะเบียนเดียวกับ /admin/menu)
 * "เพิ่มแอป" = สร้างไอคอน+ชื่อ + หน้าเปล่า /misc/<slug> (ฟังก์ชันจริงเติมด้วยโค้ดทีหลัง)
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { IconPicker } from "@/components/icon-picker";

type MenuItem = {
  id: string; label: string; href: string; icon: string | null; icon_url: string | null;
  sort_order: number; is_active: boolean; app_keys: string[]; permission_key: string | null;
};
type FormState = { id: string | null; label: string; icon: string; icon_url: string | null };

const imgUrl = (key: string | null) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null);
const emptyForm: FormState = { id: null, label: "", icon: "🧩", icon_url: null };

export default function MiscPortalPage() {
  const { can } = useAuth();
  const canView = can("app.misc");
  const canManage = can("admin.users");
  const router = useRouter();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [manage, setManage] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // standalone: เปิด /misc ในเชลล์เต็ม → เด้งไปแอปเดี่ยว /app/misc (เข้า ERP อื่นไม่ได้)
  // ถ้าอยู่ใน /app/misc แล้ว (โหลดผ่าน iframe ด้วย embed=1) → ไม่เด้ง แสดงพอร์ทัลตามปกติ
  const [embed, setEmbed] = useState<boolean | null>(null);
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("embed") === "1";
    if (!e) router.replace("/app/misc");
    setEmbed(e);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/menu?all=1");
      const j = await res.json();
      const all = (j.data ?? []) as MenuItem[];
      setItems(all.filter((m) => (m.app_keys ?? []).includes("misc") && m.href !== "/misc")
        .sort((a, b) => a.sort_order - b.sort_order));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // แสดงเฉพาะที่เปิดใช้งาน + มีสิทธิ์ (โหมดปกติ) · โหมดจัดการเห็นทั้งหมด
  const shown = manage
    ? items
    : items.filter((m) => m.is_active && (!m.permission_key || can(m.permission_key as Parameters<typeof can>[0])));

  // เปิดแอปแบบ embed (อยู่ใน standalone shell — เนื้อหาไม่โผล่ ERP nav)
  const openTile = (m: MenuItem) => {
    if (manage) { setForm({ id: m.id, label: m.label, icon: m.icon ?? "🧩", icon_url: m.icon_url }); return; }
    router.push(`${m.href}${m.href.includes("?") ? "&" : "?"}embed=1`);
  };

  const uploadIcon = async (file: File) => {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "app-icons");
    const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
    if (j.r2_key) setForm((f) => (f ? { ...f, icon_url: j.r2_key } : f));
    else alert("อัปโหลดไม่สำเร็จ: " + (j.error ?? ""));
  };

  const saveForm = async () => {
    if (!form || !form.label.trim()) { alert("กรุณาใส่ชื่อแอป"); return; }
    if (form.id) {
      await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id, patch: { label: form.label.trim(), icon: form.icon || "🧩", icon_url: form.icon_url } }) });
    } else {
      const slug = `app-${crypto.randomUUID().slice(0, 8)}`;
      const maxSort = items.reduce((m, x) => Math.max(m, x.sort_order), 0);
      await apiFetch("/api/menu", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: {
          section: "งานอื่นๆ", section_order: 85, sort_order: maxSort + 1,
          icon: form.icon || "🧩", icon_url: form.icon_url, label: form.label.trim(),
          href: `/misc/${slug}`, show_in_sidebar: true, show_in_launcher: false,
          permission_key: "app.misc", is_active: true, app_keys: ["misc"],
        } }) });
    }
    setForm(null); load();
  };

  const toggleActive = async (m: MenuItem) => {
    await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, patch: { is_active: !m.is_active } }) });
    load();
  };
  const removeItem = async (m: MenuItem) => {
    if (!confirm(`ลบแอป "${m.label}" ออกจากพอร์ทัล?\n(ลบเฉพาะไอคอน/ลิงก์ ไม่ลบข้อมูลในแอป)`)) return;
    await apiFetch(`/api/menu?id=${m.id}`, { method: "DELETE" });
    load();
  };

  // ลากเรียง — drop แล้วบันทึก sort_order ใหม่
  const onDrop = async (target: MenuItem) => {
    if (!dragId || dragId === target.id) { setDragId(null); return; }
    const arr = [...items];
    const from = arr.findIndex((x) => x.id === dragId), to = arr.findIndex((x) => x.id === target.id);
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    setItems(arr.map((x, k) => ({ ...x, sort_order: k + 1 })));
    setDragId(null);
    await Promise.all(arr.map((x, k) => apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: x.id, patch: { sort_order: k + 1 } }) })));
  };

  // ระหว่างเช็ค/เด้งไป standalone — โชว์ loader เปล่า (ไม่ครอบ PlaygroundShell กันแถบ ERP แวบ)
  if (embed !== true) {
    return <div className="h-[100dvh] flex items-center justify-center bg-gradient-to-b from-pink-50 to-rose-50/40 text-pink-300 text-sm">กำลังเปิดงานอื่นๆ…</div>;
  }

  if (!canView) {
    return <PlaygroundShell><div className="p-10 text-center text-slate-500"><div className="text-4xl mb-2">🔒</div>คุณไม่มีสิทธิ์เข้าแอปนี้</div></PlaygroundShell>;
  }

  return (
    <PlaygroundShell>
      <div className="min-h-full bg-gradient-to-b from-pink-50 to-rose-50/40">
        <div className="max-w-5xl mx-auto p-5 sm:p-8">
          {/* หัวข้อ */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-rose-600 flex items-center gap-2">🗂️ งานอื่นๆ</h1>
              <p className="text-sm text-rose-400 mt-0.5">รวมแอปเล็ก ๆ ที่ไม่ใช่งาน ERP หลัก — กดการ์ดเพื่อเข้าใช้งาน</p>
            </div>
            {canManage && (
              <button onClick={() => setManage((m) => !m)}
                className={`h-10 px-4 rounded-full text-sm font-medium border ${manage ? "bg-rose-500 text-white border-rose-500" : "bg-white text-rose-500 border-pink-200 hover:bg-pink-50"}`}>
                {manage ? "✓ เสร็จ" : "⚙ จัดการ"}
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-16 text-center text-pink-300 text-sm">กำลังโหลด…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {shown.map((m) => (
                <button key={m.id} onClick={() => openTile(m)}
                  draggable={manage} onDragStart={() => setDragId(m.id)} onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => manage && e.preventDefault()} onDrop={() => manage && onDrop(m)}
                  className={`relative group bg-white rounded-2xl border border-pink-100 shadow-sm p-5 flex flex-col items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition
                    ${dragId === m.id ? "opacity-40" : ""} ${!m.is_active ? "opacity-50" : ""} ${manage ? "cursor-move" : "cursor-pointer"}`}>
                  {imgUrl(m.icon_url)
                    ? <img src={imgUrl(m.icon_url)!} alt="" className="w-14 h-14 rounded-2xl object-cover border border-pink-100"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center text-3xl">{m.icon ?? "🧩"}</div>}
                  <div className="text-sm font-semibold text-slate-700 text-center leading-tight">{m.label}</div>
                  {!m.is_active && <span className="text-[10px] text-slate-400">(ซ่อนอยู่)</span>}

                  {manage && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <span onClick={(e) => { e.stopPropagation(); toggleActive(m); }} title={m.is_active ? "ซ่อน" : "แสดง"}
                        className="w-6 h-6 rounded-full bg-white border border-pink-200 flex items-center justify-center text-xs hover:bg-pink-50">{m.is_active ? "👁️" : "🚫"}</span>
                      <span onClick={(e) => { e.stopPropagation(); removeItem(m); }} title="ลบ"
                        className="w-6 h-6 rounded-full bg-white border border-pink-200 flex items-center justify-center text-xs hover:bg-red-50 hover:text-red-500">🗑️</span>
                    </div>
                  )}
                </button>
              ))}

              {/* การ์ดเพิ่มแอป (โหมดจัดการ) */}
              {manage && (
                <button onClick={() => setForm(emptyForm)}
                  className="bg-pink-50/50 rounded-2xl border-2 border-dashed border-pink-200 p-5 flex flex-col items-center justify-center gap-2 text-rose-400 hover:bg-pink-50 min-h-[140px]">
                  <div className="text-3xl">＋</div>
                  <div className="text-sm font-medium">เพิ่มแอป</div>
                </button>
              )}
            </div>
          )}

          {!loading && shown.length === 0 && !manage && (
            <div className="py-16 text-center text-pink-300 text-sm">ยังไม่มีแอป {canManage && '— กด "⚙ จัดการ" เพื่อเพิ่ม'}</div>
          )}
        </div>
      </div>

      {/* ฟอร์มเพิ่ม/แก้แอป */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-rose-600 mb-4">{form.id ? "แก้ไขแอป" : "เพิ่มแอปใหม่"}</h3>

            <label className="block text-xs font-medium text-rose-400 mb-1">ชื่อแอป</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="เช่น โน้ตงาน, เครื่องคิดเลข"
              className="w-full h-10 px-3 rounded-lg border border-pink-200 focus:border-pink-400 outline-none text-sm mb-4" />

            <label className="block text-xs font-medium text-rose-400 mb-1">ไอคอน</label>
            <div className="flex items-center gap-3 mb-5">
              {/* พรีวิว */}
              {imgUrl(form.icon_url)
                ? <img src={imgUrl(form.icon_url)!} alt="" className="w-12 h-12 rounded-xl object-cover border border-pink-100" />
                : <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center text-2xl">{form.icon || "🧩"}</div>}
              <div className="flex items-center gap-2">
                <IconPicker value={form.icon} onChange={(v) => setForm({ ...form, icon: v, icon_url: null })} />
                <label className="h-10 px-3 leading-10 rounded-md border border-pink-200 text-sm text-rose-500 cursor-pointer hover:bg-pink-50">
                  อัปโหลดรูป
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(f); }} />
                </label>
                {form.icon_url && (
                  <button onClick={() => setForm({ ...form, icon_url: null })} className="text-xs text-slate-400 hover:text-red-500">ลบรูป</button>
                )}
              </div>
            </div>

            {!form.id && (
              <p className="text-xs text-rose-300 mb-4">จะสร้างหน้าเปล่าให้ก่อน — ฟังก์ชันจริงในแอปนี้แจ้งทีมพัฒนาเพื่อเติมทีหลัง</p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="h-10 px-4 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={saveForm} className="h-10 px-5 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-semibold hover:from-pink-600 hover:to-rose-600">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </PlaygroundShell>
  );
}
