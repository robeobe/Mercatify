import { Migration } from '@mikro-orm/migrations';

export class Migration20260919140038_mercatify extends Migration {

  override name = 'Migration20260919140038';

  override up(): void | Promise<void> {
    this.addSql(`create table "mercatify_requests" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "company" text not null, "industry" text null, "people_count" int null, "currency" text not null default 'EUR', "status" text not null default 'new', "owner_user_id" uuid null, "owner_name" text null, "pains" text null, "must_keep" text null, "tools" jsonb not null, "submitted_by_user_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
  }

}
