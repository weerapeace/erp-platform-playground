import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("Phase 1 security guards", () => {
  const granularAdminRoutes = [
    ["app/api/admin/schema/tables/route.ts", "admin.schema.view"],
    ["app/api/admin/schema/columns/route.ts", "admin.schema.view"],
    ["app/api/admin/schema/create-table/route.ts", "admin.schema.create_table"],
    ["app/api/admin/schema/add-field/route.ts", "admin.schema.add_field"],
    ["app/api/admin/schema/delete-field/route.ts", "admin.schema.delete_field"],
    ["app/api/admin/module-layout/route.ts", "admin.module_layout.edit"],
    ["app/api/admin/section-tag-rules/route.ts", "admin.module_layout.edit"],
    ["app/api/admin/field-registry-v2/[id]/route.ts", "admin.field_registry.edit"],
    ["app/api/admin/field-registry-v2/bulk/route.ts", "admin.field_registry.bulk_edit"],
    ["app/api/admin/upload/route.ts", "files.upload"],
    ["app/api/admin/upload/route.ts", "files.delete"],
  ];

  test.each(granularAdminRoutes)("%s requires %s", (file, permission) => {
    const source = read(file);

    expect(source).toContain("guardApi");
    expect(source).toContain(`"${permission}"`);
  });

  test("module layout changes are audited through the shared audit helper", () => {
    const source = read("app/api/admin/module-layout/route.ts");

    expect(source).toContain("writeAudit");
    expect(source).toContain("module.layout_update");
  });

  test("payroll background calculation requires edit-level permission", () => {
    const source = read("app/api/payroll/calc-enqueue/route.ts");

    expect(source).toContain('guardPayroll(req, "payroll.calculate")');
  });
});
