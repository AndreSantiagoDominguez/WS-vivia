import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeleteEditHideSupport1784340687147 implements MigrationInterface {
  name = 'AddDeleteEditHideSupport1784340687147';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat"."messages" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat"."messages" ADD "edited_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat"."conversations" ADD "hidden_for_participant_one_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat"."conversations" ADD "hidden_for_participant_two_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat"."conversations" DROP COLUMN "hidden_for_participant_two_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat"."conversations" DROP COLUMN "hidden_for_participant_one_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat"."messages" DROP COLUMN "edited_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat"."messages" DROP COLUMN "deleted_at"`,
    );
  }
}
