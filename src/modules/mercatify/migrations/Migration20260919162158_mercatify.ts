import { Migration } from '@mikro-orm/migrations';

export class Migration20260919162158_mercatify extends Migration {

  override name = 'Migration20260919162158';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mercatify_requests" add "overrides" jsonb null, add "mapped_at" timestamptz null, add "report" jsonb null, add "sent_at" timestamptz null, add "client_response" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_requests" drop column "overrides", drop column "mapped_at", drop column "report", drop column "sent_at", drop column "client_response";`);
  }

}
