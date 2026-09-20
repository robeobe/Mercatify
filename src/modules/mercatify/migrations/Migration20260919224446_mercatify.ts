import { Migration } from '@mikro-orm/migrations';

export class Migration20260919224446_mercatify extends Migration {

  override name = 'Migration20260919224446';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mercatify_requests" add "labs_result" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mercatify_requests" drop column "labs_result";`);
  }

}
