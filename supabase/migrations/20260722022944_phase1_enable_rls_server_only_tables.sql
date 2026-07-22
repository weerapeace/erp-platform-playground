-- RLS remediation เฟส 1: เปิด RLS ตารางที่แอปเข้าผ่าน service_role (bypassrls) หรือ SECURITY DEFINER RPC เท่านั้น
-- ไม่ตั้ง policy = ปิด anon/authenticated ที่เข้าตรง · service_role + definer functions ยังทำงานปกติ
alter table public.belt_diagram_layout            enable row level security;
alter table public.ui_config                       enable row level security;
alter table public.brand_themes                    enable row level security;
alter table public.platform_central_categories     enable row level security;
alter table public.lazada_categories               enable row level security;
alter table public.erp_work_flows                  enable row level security;
alter table public.erp_work_flow_steps             enable row level security;
alter table public.subscription_personal_shares    enable row level security;
alter table public.subscription_streaming_services enable row level security;
alter table public.content_calendar_brand_style    enable row level security;
alter table public.erp_canvas_tables               enable row level security;
alter table public.erp_creative_task_assignees     enable row level security;
alter table public.erp_creative_task_reviewers     enable row level security;
alter table public.erp_artwork_drive_folders       enable row level security;
alter table public.erp_brand_drive_folders         enable row level security;
alter table public.erp_playground_delivery_notes   enable row level security;
alter table public.erp_playground_delivery_note_lines enable row level security;
