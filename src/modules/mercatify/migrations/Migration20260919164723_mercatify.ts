import { Migration } from '@mikro-orm/migrations';

export class Migration20260919164723_mercatify extends Migration {

  override name = 'Migration20260919164723';

  override up(): void | Promise<void> {
    this.addSql(`create table "mercatify_mapping_rows" ("id" uuid not null default gen_random_uuid(), "case_id" uuid not null, "position" int not null default 0, "capability" text not null, "decision" text not null, "target_kind" text not null, "target_module_id" text null, "target_tool_name" text null, "target_label" text null, "justification" text not null, "confidence" text not null, "flagged" boolean not null default false, "flag_reason" text null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "mercatify_mapping_rows_org_tenant_case_idx" on "mercatify_mapping_rows" ("organization_id", "tenant_id", "case_id");`);

    this.addSql(`alter table "mercatify_interview_cases" add "mapping_confirmed_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_cases" drop column "mapping_confirmed_at";`);
  }

}
