import { describe, it, expect } from "vitest";
import { maskSecretRows, keepSecretsOnWrite, hasSecretFields, SECRET_MASK } from "../settings-secrets";

// admin ปลอม: คืนแถวเดิมใน DB ตาม id (พอสำหรับ .from().select().eq().maybeSingle())
function fakeAdmin(row: Record<string, unknown> | null) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  return { from: () => chain } as unknown as Parameters<typeof keepSecretsOnWrite>[0];
}

describe("settings-secrets — โทเคน LINE ใน china_app_settings", () => {
  const TOKEN = "abcdefghijklmnopqrstuvwxyz1234";

  it("รู้ว่าตารางไหนมีความลับ", () => {
    expect(hasSecretFields("china_app_settings")).toBe(true);
    expect(hasSecretFields("skus_v2")).toBe(false);
  });

  it("ปิดโทเคนก่อนส่งหน้าเว็บ เหลือ 4 ตัวท้าย · คีย์อื่นไม่แตะ", () => {
    const rows = maskSecretRows("china_app_settings", [
      { id: "1", skey: "line_config", sval: { token: TOKEN, group_id: "G1" } },
      { id: "2", skey: "menu_roles", sval: { token: "not-a-secret-here" } },
    ]);
    expect((rows[0].sval as Record<string, unknown>).token).toBe(`${SECRET_MASK}1234`);
    expect((rows[0].sval as Record<string, unknown>).group_id).toBe("G1");
    expect((rows[1].sval as Record<string, unknown>).token).toBe("not-a-secret-here");
  });

  it("บันทึกค่าที่ปิดไว้กลับมา = คงโทเคนเดิม", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { token: TOKEN } });
    const out = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { token: `${SECRET_MASK}1234`, group_id: "G2" } });
    expect((out.sval as Record<string, unknown>).token).toBe(TOKEN);
    expect((out.sval as Record<string, unknown>).group_id).toBe("G2");
  });

  it("ไม่ส่งโทเคนมาเลย / ส่งค่าว่าง = คงโทเคนเดิม (กันลบทิ้งโดยไม่ตั้งใจ)", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { token: TOKEN } });
    const a = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { group_id: "G3" } });
    const b = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { token: "" } });
    expect((a.sval as Record<string, unknown>).token).toBe(TOKEN);
    expect((b.sval as Record<string, unknown>).token).toBe(TOKEN);
  });

  it("พิมพ์โทเคนใหม่ = ใช้ค่าใหม่", async () => {
    const admin = fakeAdmin({ skey: "line_config", sval: { token: TOKEN } });
    const out = await keepSecretsOnWrite(admin, "china_app_settings", "1", { sval: { token: "NEW-TOKEN-9999" } });
    expect((out.sval as Record<string, unknown>).token).toBe("NEW-TOKEN-9999");
  });

  it("สร้างแถวใหม่พร้อมค่าที่ปิดไว้ → ไม่บันทึกค่า ••••", async () => {
    const out = await keepSecretsOnWrite(fakeAdmin(null), "china_app_settings", null, { skey: "line_config", sval: { token: `${SECRET_MASK}1234` } });
    expect("token" in (out.sval as Record<string, unknown>)).toBe(false);
  });
});
