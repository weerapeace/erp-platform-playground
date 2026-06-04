"use client";

/**
 * ตั้งค่าโมดูล (Module Settings) — /admin/module/<moduleKey>
 *
 * รวมการตั้งค่าที่เกี่ยวกับโมดูลเดียวไว้ที่เดียว (เข้าจากหมวด "⚙ ตั้งค่า" ในแถบเมนูซ้ายของแต่ละแอป)
 *  - Field Registry : ฝัง SchemaSyncClient (ล็อกเฉพาะโมดูลนี้)
 *  - Saved Views    : ดู/ลบ/ตั้ง default มุมมองของตารางนี้ (inline)
 *  - Table Layout   : ลิงก์ไปตัวจัดเลย์เอาต์ของตารางนี้ (ของกลางเดิม)
 *
 * tableId = `master-<moduleKey>` (คอนเวนชันกลางของ MasterPage/MasterCRUD)
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

const SchemaSyncClient = dynamic(
  () => import("@/app/admin/schema-sync/schema-sync-client").then((m) => m.SchemaSyncClient),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

type Tab = "fields" | "views" | "layout";
type SavedView = {
  id: string; table_id: string; label: string; visibility: "personal" | "team" | "system";
  is_default: boolean; owner_name: string | null; updated_at: string;
};

const VIS_ICON: Record<string, string> = { personal: "👤", team: "👥", system: "⭐" };

export default function ModuleSettingsPage() {
  const moduleKey = String(useParams().key ?? "");
  const tableId = `master-${moduleKey}`;
  const [tab, setTab] = useState<Tab>("fields");
  const [label, setLabel] = useState(moduleKey);

  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => {
      const m = (j.data as { key: string; label: string }[] | undefined)?.find((x) => x.key === moduleKey);
      if (m?.label) setLabel(m.label);
    }).catch(() => {});
  }, [moduleKey]);

  return (
    <PlaygroundShell>
      <div className="min-h-screen bg-slate-50">
        {/* header */}
        <div className="bg-white border-b border-slate-200 px-6 pt-5">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
            <Link href="/admin/schema-sync" className="hover:text-slate-600">ตั้งค่า</Link>
            <span>/</span>
            <span className="text-slate-600">{label}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">⚙ ตั้งค่าโมดูล: {label}</h1>
          <p className="text-sm text-slate-500 mt-0.5">โมดูล <code className="text-xs bg-slate-100 px-1 rounded">{moduleKey}</code> · ตาราง <code className="text-xs bg-slate-100 px-1 rounded">{tableId}</code></p>
          {/* tabs */}
          <div className="flex gap-1 mt-4 -mb-px">
            {([
              { id: "fields", label: "🗂️ Field Registry" },
              { id: "views",  label: "🔖 Saved Views" },
              { id: "layout", label: "📐 Table Layout" },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`h-10 px-4 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        {tab === "fields" && (
          <SchemaSyncClient initialModule={moduleKey} lockModule embedded />
        )}
        {tab === "views"  && <SavedViewsPanel tableId={tableId} />}
        {tab === "layout" && <LayoutPanel tableId={tableId} />}
      </div>
    </PlaygroundShell>
  );
}

// ---- Saved Views (inline) ----
function SavedViewsPanel({ tableId }: { tableId: string }) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/saved-views?table_id=${encodeURIComponent(tableId)}`).then((r) => r.json());
      setViews((j.data ?? []) as SavedView[]);
    } catch { setViews([]); } finally { setLoading(false); }
  }, [tableId]);
  useEffect(() => { load(); }, [load]);

  const setDefault = async (id: string, makeDefault: boolean) => {
    await apiFetch(`/api/saved-views?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: makeDefault }),
    });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("ลบมุมมองนี้?")) return;
    await apiFetch(`/api/saved-views?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <p className="text-sm text-slate-500 mb-3">มุมมองที่บันทึกไว้ของตารางนี้ — กดดาวเพื่อตั้งเป็นค่าเริ่มต้น (เปิดหน้านี้ครั้งหน้าจะใช้มุมมองนั้น)</p>
      {loading ? (
        <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>
      ) : views.length === 0 ? (
        <div className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-200 rounded-lg">— ยังไม่มีมุมมองที่บันทึกไว้ —<br /><span className="text-xs">ไปที่หน้าตารางของโมดูลนี้ แล้วกดปุ่ม + เพื่อบันทึกมุมมอง</span></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {views.map((v) => (
            <div key={v.id} className="flex items-center gap-2 px-4 py-2.5">
              <button onClick={() => setDefault(v.id, !v.is_default)} title={v.is_default ? "ยกเลิก default" : "ตั้งเป็น default"}
                className={`w-7 h-7 rounded inline-flex items-center justify-center ${v.is_default ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}>
                {v.is_default ? "★" : "☆"}
              </button>
              <span className="text-sm">{VIS_ICON[v.visibility] ?? "👤"}</span>
              <span className="flex-1 text-sm text-slate-700">{v.label}</span>
              {v.owner_name && <span className="text-xs text-slate-400">{v.owner_name}</span>}
              <button onClick={() => remove(v.id)} title="ลบ"
                className="w-7 h-7 rounded text-slate-300 hover:text-red-500 inline-flex items-center justify-center">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Table Layout (link to dedicated editor) ----
function LayoutPanel({ tableId }: { tableId: string }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
        <div className="text-4xl mb-2 opacity-40">📐</div>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">ค่าเริ่มต้นของตาราง (Table Layout)</h3>
        <p className="text-sm text-slate-500 mb-4">กำหนดคอลัมน์เริ่มต้น ความหนาแน่น จำนวนต่อหน้า และมุมมองเริ่มต้นของตารางโมดูลนี้</p>
        <Link href={`/admin/table-layouts?table=${encodeURIComponent(tableId)}`}
          className="inline-flex h-10 px-5 items-center text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          เปิดตัวจัดเลย์เอาต์ของตารางนี้ →
        </Link>
      </div>
    </div>
  );
}
