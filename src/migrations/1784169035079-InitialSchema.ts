import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1784169035079 implements MigrationInterface {
  name = 'InitialSchema1784169035079';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat"."conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "participant_one_id" uuid NOT NULL, "participant_one_role" character varying NOT NULL, "participant_two_id" uuid NOT NULL, "participant_two_role" character varying NOT NULL, "property_id" uuid, "property_title" character varying, "last_message_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fef713373c6a94a0851f69a774" ON "chat"."conversations" ("participant_one_id", "participant_two_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "chat"."messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "type" character varying NOT NULL DEFAULT 'text', "content" text, "document_url" text, "document_name" character varying, "document_mime_type" character varying, "document_size_bytes" integer, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8584a1974e1ca95f4861d975ff" ON "chat"."messages" ("conversation_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "chat"."user_identities" ("email" character varying NOT NULL, "user_id" uuid NOT NULL, "is_temporary" boolean NOT NULL DEFAULT true, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_713a554aa1799f9038348becf7a" PRIMARY KEY ("email"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat"."messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "chat"."conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat"."messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`,
    );
    await queryRunner.query(`DROP TABLE "chat"."user_identities"`);
    await queryRunner.query(
      `DROP INDEX "chat"."IDX_8584a1974e1ca95f4861d975ff"`,
    );
    await queryRunner.query(`DROP TABLE "chat"."messages"`);
    await queryRunner.query(
      `DROP INDEX "chat"."IDX_fef713373c6a94a0851f69a774"`,
    );
    await queryRunner.query(`DROP TABLE "chat"."conversations"`);
  }
}
