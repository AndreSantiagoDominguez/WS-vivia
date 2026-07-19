import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileCache1784415561133 implements MigrationInterface {
  name = 'AddUserProfileCache1784415561133';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat"."user_profile_cache" ("user_id" uuid NOT NULL, "name" character varying NOT NULL, "photo_url" text, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2e157249efa6b5c2e3ad4543612" PRIMARY KEY ("user_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "chat"."user_profile_cache"`);
  }
}
