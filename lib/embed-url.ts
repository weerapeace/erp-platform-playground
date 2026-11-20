/** เติม embed=1 ให้ลิงก์ภายใน (รักษา query/hash เดิม) · ลิงก์ภายนอกคืนค่าเดิม — แยกไฟล์ให้ของกลางเบา ๆ (split-screen) ใช้ได้โดยไม่ลากป๊อปมาด้วย */
export function embedUrl(u: string): string {
  if (!u || !u.startsWith("/")) return u;
  const [path, hash] = u.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}embed=1${hash ? "#" + hash : ""}`;
}
