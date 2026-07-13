"use client";

/**
 * คู่มือ Flow งาน (/master/work-flows) — เฟส 1
 * เลือกงาน → ดู flow ขั้นตอน + เก็บไฟล์อะไรไว้ที่ไหน (กด "เก็บที่" เปิดที่นั่นได้เลย)
 * ข้อมูลมาจากตาราง erp_work_flows / erp_work_flow_steps (เฟส 2 จะมีหน้าให้แก้เอง)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { WorkFlow } from "@/app/api/work-flows/route";
import { WorkFlowSteps } from "@/components/work-flow-widget";

export default function WorkFlowsGuidePage() {
  const [flows, setFlows] = useState<WorkFlow[]>([]);
  const [sel, setSel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/work-flows").then((r) => r.json())
      .then((j) => { const list = (j.data ?? []) as WorkFlow[]; setFlows(list); setSel(list[0]?.flow_key ?? ""); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const cur = flows.find((f) => f.flow_key === sel);

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-5">
      <h1 className="text-lg font-semibold text-slate-800">🗺️ คู่มือ Flow งาน</h1>
      <p className="text-sm text-slate-500 mb-4">เลือกงาน → ดูว่าแต่ละขั้นตอนต้องเก็บไฟล์/ข้อมูลอะไร ไว้ที่ไหน · กดที่ป้าย “เก็บที่” เพื่อเปิดที่นั่นได้เลย</p>

      {loading ? (
        <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>
      ) : flows.length === 0 ? (
        <div className="text-sm text-slate-400 py-10 text-center">ยังไม่มีข้อมูล flow งาน</div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-5">
            {flows.map((f) => (
              <button key={f.flow_key} onClick={() => setSel(f.flow_key)}
                className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${sel === f.flow_key
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200 font-medium"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                {f.icon} {f.name}
              </button>
            ))}
          </div>

          {cur && (
            <div>
              {cur.description && <p className="text-sm text-slate-500 mb-3">{cur.description}</p>}
              <WorkFlowSteps steps={cur.steps} />
              {/* คำอธิบายไอคอนที่เก็บ */}
              <div className="flex gap-4 flex-wrap mt-5 text-xs text-slate-400">
                <span>📋 โมดูลในแอป</span><span>📁 Google Drive</span><span>🗄️ คลังไฟล์กลาง</span><span>📎 แนบในเอกสาร</span>
              </div>
              <p className="text-xs text-slate-400 mt-3">💡 คู่มือนี้เดาไว้ก่อน — เฟสถัดไปจะมีหน้าให้ทีมคุณเพิ่ม/แก้ขั้นตอน + ที่เก็บ + ลิงก์ ได้เอง</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
