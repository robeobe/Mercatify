import { Migration } from '@mikro-orm/migrations';

export class Migration20260919171414_mercatify extends Migration {

  override name = 'Migration20260919171414';

  override up(): void | Promise<void> {
    this.addSql(`create table "mercatify_interview_case_tools" ("id" uuid not null default gen_random_uuid(), "interview_case_id" uuid not null, "catalog_tool_id" text null, "name" text not null, "selected_module_ids" jsonb not null, "custom_use" text null, "seats" int null, "monthly_cost" numeric(12,2) null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "mercatify_interview_case_tools_scope_idx" on "mercatify_interview_case_tools" ("interview_case_id", "organization_id", "tenant_id");`);

    this.addSql(`alter table "mercatify_interview_cases" add "company_name" text null, add "industry" text null, add "people_count" int null, add "currency" text null default 'EUR', add "pains" text null, add "must_keep" text null;`);

    this.addSql(`alter table "mercatify_interview_case_tools" add constraint "mercatify_interview_case_tools_interview_case_id_foreign" foreign key ("interview_case_id") references "mercatify_interview_cases" ("id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_interview_case_tools" drop constraint "mercatify_interview_case_tools_interview_case_id_foreign";`);
    this.addSql(`drop table if exists "mercatify_interview_case_tools";`);
    this.addSql(`alter table "mercatify_interview_cases" drop column "company_name", drop column "industry", drop column "people_count", drop column "currency", drop column "pains", drop column "must_keep";`);
  }

}
