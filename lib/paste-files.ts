// ============================================================
// paste-files — ตั้งชื่อไฟล์ที่ได้จากการวาง (Ctrl+V) ให้ไม่ซ้ำกัน (ของกลาง useFileDrop · pure เทสต์ได้)
// เบราว์เซอร์ตั้งชื่อรูปจากคลิปบอร์ดว่า "image.png" ทุกครั้ง → วางหลายรอบชื่อชนกัน อ่านไม่ออกว่าอันไหน
// ============================================================

const pad = (n: number) => String(n).padStart(2, "0");

export function pastedFileName(f: { name?: string; type?: string }, now: Date, index = 0): string {
  const name = f.name ?? "";
  const generic = !name || /^image\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
  if (!generic) return name;   // คัดลอกไฟล์จากโฟลเดอร์มา = คงชื่อเดิม
  const ext = (f.type?.split("/")[1] || name.split(".").pop() || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "png";
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `วางรูป-${stamp}${index ? `-${index + 1}` : ""}.${ext}`;
}
