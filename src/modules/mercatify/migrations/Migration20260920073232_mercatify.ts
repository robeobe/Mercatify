import { Migration } from '@mikro-orm/migrations';

export class Migration20260920073232_mercatify extends Migration {

  override name = 'Migration20260920073232';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mercatify_requests" add "workspace_preview" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_requests" drop column "workspace_preview";`);
  }

}
