/** กติกาหน้าต่างลอย "ดูแบบ iPhone / iPad" (ล้วน ไม่มี React — ใช้ทั้งหน้าจอและเทสต์) · หน้าจอ = components/device-preview */

export type DevicePreviewDevice = "iphone" | "ipad";
/** ขนาดจอ CSS ของเครื่องจริง (แนวตั้ง) */
export const DEVICE_PREVIEW_SIZE: Record<DevicePreviewDevice, { w: number; h: number; label: string }> = {
  iphone: { w: 390, h: 844, label: "iPhone" },
  ipad: { w: 820, h: 1180, label: "iPad" },
};
/** ย่อกรอบได้ 50 / 75 / 100% (เจ้าของเลือก 2026-11-17) */
export const DEVICE_PREVIEW_ZOOMS = [0.5, 0.75, 1] as const;
export type DevicePreviewZoom = (typeof DEVICE_PREVIEW_ZOOMS)[number];

/** zoom = null → ยังไม่เคยเลือก ให้ระบบเลือกพอดีความสูงจอ */
export type DevicePreviewPrefs = { device: DevicePreviewDevice; landscape: boolean; zoom: DevicePreviewZoom | null };

export function devicePreviewDims(device: DevicePreviewDevice, landscape: boolean): { w: number; h: number } {
  const s = DEVICE_PREVIEW_SIZE[device];
  return landscape ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}

/** เลือกขนาดใหญ่สุดที่กรอบ (บวกหัวหน้าต่าง+แถบเครื่องมือ ~150px) ยังพอดีความสูงจอ · ไม่พอเลย = 50% */
export function autoZoom(frameH: number, viewportH: number): DevicePreviewZoom {
  const room = viewportH - 150;
  for (let i = DEVICE_PREVIEW_ZOOMS.length - 1; i >= 0; i--) {
    if (frameH * DEVICE_PREVIEW_ZOOMS[i] <= room) return DEVICE_PREVIEW_ZOOMS[i];
  }
  return DEVICE_PREVIEW_ZOOMS[0];
}

export function parseDevicePreviewPrefs(raw: unknown): DevicePreviewPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<DevicePreviewPrefs>;
  const zoom = DEVICE_PREVIEW_ZOOMS.find((z) => z === r.zoom) ?? null;
  return { device: r.device === "ipad" ? "ipad" : "iphone", landscape: r.landscape === true, zoom };
}
