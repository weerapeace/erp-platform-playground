"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal, ConfirmDialog, Drawer, ApprovalDialog } from "@/components/modal";

export default function PopupPlaygroundPage() {
  const [modal, setModal] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [unsavedModal, setUnsavedModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const simulateAction = (label: string) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setModal(null);
      setDrawerOpen(false);
      setApprovalOpen(false);
      setLastAction(label);
    }, 1500);
  };

  const demos = [
    { id: "info",    label: "Modal ดูข้อมูล",         desc: "ปิดด้วย backdrop / ESC ได้",           icon: "📋" },
    { id: "form",    label: "Modal แบบฟอร์ม",          desc: "มี unsaved changes — ถามก่อนปิด",      icon: "📝" },
    { id: "confirm", label: "ConfirmDialog",            desc: "ถามยืนยันก่อนทำ action",              icon: "✅" },
    { id: "danger",  label: "Danger Confirm",           desc: "ต้องพิมพ์ CONFIRM ก่อนลบ",            icon: "🗑️" },
    { id: "drawer",  label: "Drawer (Slide Panel)",     desc: "เลื่อนเข้าจากขวา",                    icon: "📂" },
    { id: "approve", label: "Approval Dialog",          desc: "อนุมัติ / ปฏิเสธ + เหตุผล",           icon: "🔐" },
    { id: "loading", label: "Modal + Loading",          desc: "แสดง loading ขณะ submit",              icon: "⏳" },
    { id: "lg",      label: "Modal ขนาด Large",         desc: "ใช้สำหรับเนื้อหาเยอะ",                icon: "🔲" },
  ];

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 6 — Modal & Popup
        </div>
        <h1 className="text-2xl font-bold text-slate-900">🪟 Popup Playground</h1>
        <p className="text-slate-500 mt-1">Popup กลาง — ใช้แทน modal ทุกตัวใน ERP ไม่ต้องสร้างใหม่แต่ละหน้า</p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* Last action feedback */}
        {lastAction && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <span>✅</span>
            <span>ผลลัพธ์: <strong>{lastAction}</strong></span>
            <button onClick={() => setLastAction(null)} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs">ปิด</button>
          </div>
        )}

        {/* Demo buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {demos.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                if (d.id === "drawer") setDrawerOpen(true);
                else if (d.id === "approve") setApprovalOpen(true);
                else if (d.id === "form") setUnsavedModal(true);
                else setModal(d.id);
              }}
              className="bg-white rounded-xl border border-slate-200 px-4 py-4 text-left hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">{d.icon}</div>
              <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{d.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{d.desc}</p>
            </button>
          ))}
        </div>

        {/* Feature list */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { done: true, label: "ERPModal (sm / md / lg / xl)" },
              { done: true, label: "Close on Backdrop" },
              { done: true, label: "Close on ESC" },
              { done: true, label: "Unsaved Changes Warning" },
              { done: true, label: "ConfirmDialog" },
              { done: true, label: "Danger Confirm + typed input" },
              { done: true, label: "Drawer (slide from right)" },
              { done: true, label: "Approval + Rejection Dialog" },
              { done: true, label: "Loading State" },
              { done: false, label: "Nested modals" },
              { done: false, label: "Form Modal (ERPForm inside)" },
              { done: false, label: "Full-screen mobile modal" },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}>
                <span>{item.done ? "✅" : "⬜"}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- MODALS ---- */}

      {/* Info modal */}
      <ERPModal
        open={modal === "info"}
        onClose={() => setModal(null)}
        title="รายละเอียดสินค้า"
        description="SKU-001 — กระดาษ A4 80gsm"
        size="md"
        footer={
          <button onClick={() => setModal(null)} className="h-9 px-5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
            ปิด
          </button>
        }
      >
        <div className="space-y-3">
          {[
            ["SKU", "SKU-001"],
            ["ชื่อสินค้า", "กระดาษ A4 80gsm (รีม)"],
            ["หมวดหมู่", "เครื่องเขียน"],
            ["ผู้จำหน่าย", "บริษัท ออฟฟิศซัพพลาย จำกัด"],
            ["ราคาขาย", "฿120.00"],
            ["Stock คงเหลือ", "240 รีม"],
            ["สถานะ", "Active"],
          ].map(([label, val]) => (
            <div key={label} className="flex gap-3">
              <span className="text-xs text-slate-500 w-28 flex-shrink-0 pt-0.5">{label}</span>
              <span className="text-sm text-slate-800">{val}</span>
            </div>
          ))}
        </div>
      </ERPModal>

      {/* Form modal with unsaved changes */}
      <ERPModal
        open={unsavedModal}
        onClose={() => setUnsavedModal(false)}
        title="แก้ไขสินค้า"
        description="เปลี่ยนแปลงแล้วกด X เพื่อดู unsaved changes warning"
        size="md"
        hasUnsavedChanges={true}
        footer={
          <>
            <button onClick={() => setUnsavedModal(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
              ยกเลิก
            </button>
            <button onClick={() => { setUnsavedModal(false); setLastAction("บันทึกสินค้าสำเร็จ"); }} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              บันทึก
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            💡 ลองกดปุ่ม X มุมขวาบน หรือคลิกนอก popup — จะมีป๊อปอัพถามว่าต้องการออกหรือไม่
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">ชื่อสินค้า</label>
            <input type="text" defaultValue="กระดาษ A4 80gsm (รีม)" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">ราคาขาย</label>
            <input type="number" defaultValue="120" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </ERPModal>

      {/* Confirm */}
      <ConfirmDialog
        open={modal === "confirm"}
        onClose={() => setModal(null)}
        onConfirm={() => simulateAction("Archive PR-2026-00018 สำเร็จ")}
        title="Archive เอกสาร"
        message="ต้องการ Archive PR-2026-00018 หรือไม่? เอกสารจะถูกซ่อนจากรายการหลัก แต่ยังค้นหาได้"
        confirmText="Archive"
        loading={loading}
      />

      {/* Danger confirm */}
      <ConfirmDialog
        open={modal === "danger"}
        onClose={() => setModal(null)}
        onConfirm={() => simulateAction("ลบข้อมูลสำเร็จ")}
        title="ลบข้อมูลถาวร"
        message={
          <span>
            การลบนี้<strong className="text-red-700"> ไม่สามารถกู้คืนได้</strong> ข้อมูลทั้งหมดของสินค้า SKU-001 จะถูกลบออกจากระบบ
          </span>
        }
        confirmText="ลบข้อมูล"
        variant="danger"
        requireTyped="CONFIRM"
        loading={loading}
      />

      {/* Loading modal */}
      <ERPModal
        open={modal === "loading"}
        onClose={() => !loading && setModal(null)}
        title="กำลังประมวลผล"
        size="sm"
        loading={loading}
        footer={
          !loading ? (
            <button onClick={() => setModal(null)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
          ) : undefined
        }
      >
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            onClick={() => simulateAction("ประมวลผลสำเร็จ")}
            className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            เริ่ม Loading (1.5s)
          </button>
          <p className="text-xs text-slate-400">กดปุ่มด้านบนเพื่อดู loading state</p>
        </div>
      </ERPModal>

      {/* Large modal */}
      <ERPModal
        open={modal === "lg"}
        onClose={() => setModal(null)}
        title="รายละเอียดใบขอซื้อ"
        description="PR-2026-00018 · Draft"
        size="lg"
        footer={
          <>
            <button onClick={() => setModal(null)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
            <button className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Submit</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              ["เลขที่", "PR-2026-00018"],
              ["วันที่", "28 พ.ค. 2569"],
              ["ผู้ขอ", "สมชาย ใจดี"],
              ["แผนก", "จัดซื้อ"],
              ["สถานะ", "Draft"],
              ["ผู้จำหน่าย", "บริษัท ออฟฟิศซัพพลาย จำกัด"],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="text-xs text-slate-500">{l}</div>
                <div className="text-sm font-medium text-slate-800 mt-0.5">{v}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">รายการสินค้า</p>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs text-slate-500">สินค้า</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">จำนวน</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">ราคา</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500">รวม</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[["กระดาษ A4 80gsm", "10 รีม", "฿120", "฿1,200"], ["ปากกาลูกลื่น", "5 กล่อง", "฿60", "฿300"]].map(([n, q, p, t]) => (
                  <tr key={n}><td className="px-3 py-2">{n}</td><td className="px-3 py-2 text-right">{q}</td><td className="px-3 py-2 text-right">{p}</td><td className="px-3 py-2 text-right font-medium">{t}</td></tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50"><td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">ยอดรวม</td><td className="px-3 py-2 text-right font-bold text-slate-900">฿1,500</td></tr></tfoot>
            </table>
          </div>
        </div>
      </ERPModal>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filter สินค้า"
        description="กรองรายการสินค้าตามเงื่อนไข"
        size="md"
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">รีเซ็ต</button>
            <button onClick={() => { setDrawerOpen(false); setLastAction("กรองสินค้าสำเร็จ"); }} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">ใช้งาน Filter</button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">หมวดหมู่</label>
            <select className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">ทั้งหมด</option>
              <option>เครื่องเขียน</option><option>ไอที</option><option>สินค้าทำความสะอาด</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">สถานะ</label>
            <div className="space-y-2">
              {["Active", "Low Stock", "Inactive"].map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-blue-600" defaultChecked={s === "Active"} />
                  <span className="text-sm text-slate-700">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Stock น้อยกว่า</label>
            <input type="number" defaultValue={50} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">ผู้จำหน่าย</label>
            <select className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">ทั้งหมด</option>
              <option>บริษัท ออฟฟิศซัพพลาย จำกัด</option>
              <option>ไอทีซัพพลาย จำกัด</option>
            </select>
          </div>
        </div>
      </Drawer>

      {/* Approval */}
      <ApprovalDialog
        open={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        onApprove={(comment) => simulateAction(`อนุมัติแล้ว${comment ? ` (${comment})` : ""}`)}
        onReject={(reason) => simulateAction(`ปฏิเสธแล้ว — ${reason}`)}
        documentLabel="PR-2026-00018 · กระดาษ A4 + ปากกาลูกลื่น · ฿1,500"
        loading={loading}
      />
    </PlaygroundShell>
  );
}
