import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../src/infrastructure/database/types.js";

type DbExecutor = Kysely<Database> | Transaction<Database>;

export async function propertyTaxonomyPair(
  db: DbExecutor,
  typeCode: string
): Promise<{ propertyCategoryId: string; propertyTypeId: string }> {
  const row = await db
    .selectFrom("property_types as type")
    .innerJoin("property_categories as category", "category.id", "type.property_category_id")
    .select(["category.id as category_id", "type.id as type_id"])
    .where("type.code", "=", typeCode)
    .where("type.status", "=", "ACTIVE")
    .where("category.status", "=", "ACTIVE")
    .executeTakeFirstOrThrow();

  return {
    propertyCategoryId: row.category_id,
    propertyTypeId: row.type_id
  };
}
