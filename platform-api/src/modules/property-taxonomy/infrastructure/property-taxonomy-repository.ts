import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type {
  Database,
  PropertyCategoriesTable,
  PropertyTypesTable
} from "../../../infrastructure/database/types.js";

type DbExecutor = Kysely<Database> | Transaction<Database>;
export type PropertyCategoryRecord = Selectable<PropertyCategoriesTable>;
export type PropertyTypeRecord = Selectable<PropertyTypesTable>;

export interface PublicPropertyCategoryRecord extends PropertyCategoryRecord {
  property_count: number;
}

export interface PublicPropertyTypeRecord extends PropertyTypeRecord {
  property_count: number;
}

export class PropertyTaxonomyRepository {
  async listCategories(db: DbExecutor): Promise<PropertyCategoryRecord[]> {
    return db
      .selectFrom("property_categories")
      .selectAll()
      .orderBy("sort_order")
      .orderBy("name")
      .execute();
  }

  async listTypes(db: DbExecutor): Promise<PropertyTypeRecord[]> {
    return db
      .selectFrom("property_types")
      .selectAll()
      .orderBy("property_category_id")
      .orderBy("sort_order")
      .orderBy("name")
      .execute();
  }

  async listPublicCategories(db: DbExecutor): Promise<PublicPropertyCategoryRecord[]> {
    return db
      .selectFrom("property_categories as category")
      .leftJoin("properties as property", (join) =>
        join
          .onRef("property.property_category_id", "=", "category.id")
          .on("property.status", "=", "LIVE")
          .on("property.public_slug", "is not", null)
      )
      .select([
        "category.id",
        "category.code",
        "category.name",
        "category.homepage_heading",
        "category.sort_order",
        "category.homepage_visible",
        "category.status",
        "category.version",
        "category.created_at",
        "category.updated_at",
        sql<number>`count(distinct property.id)::int`.as("property_count")
      ])
      .where("category.status", "=", "ACTIVE")
      .groupBy("category.id")
      .orderBy("category.sort_order")
      .orderBy("category.name")
      .execute() as Promise<PublicPropertyCategoryRecord[]>;
  }

  async listPublicTypes(db: DbExecutor): Promise<PublicPropertyTypeRecord[]> {
    return db
      .selectFrom("property_types as type")
      .innerJoin("property_categories as category", "category.id", "type.property_category_id")
      .leftJoin("properties as property", (join) =>
        join
          .onRef("property.property_type_id", "=", "type.id")
          .on("property.status", "=", "LIVE")
          .on("property.public_slug", "is not", null)
      )
      .select([
        "type.id",
        "type.property_category_id",
        "type.code",
        "type.name",
        "type.sort_order",
        "type.status",
        "type.version",
        "type.created_at",
        "type.updated_at",
        sql<number>`count(distinct property.id)::int`.as("property_count")
      ])
      .where("category.status", "=", "ACTIVE")
      .where("type.status", "=", "ACTIVE")
      .groupBy("type.id")
      .orderBy("type.property_category_id")
      .orderBy("type.sort_order")
      .orderBy("type.name")
      .execute() as Promise<PublicPropertyTypeRecord[]>;
  }

  async findCategory(db: DbExecutor, id: string): Promise<PropertyCategoryRecord | undefined> {
    return db.selectFrom("property_categories").selectAll().where("id", "=", id).executeTakeFirst();
  }

  async findType(db: DbExecutor, id: string): Promise<PropertyTypeRecord | undefined> {
    return db.selectFrom("property_types").selectAll().where("id", "=", id).executeTakeFirst();
  }

  async findCategoryByCode(
    db: DbExecutor,
    code: string
  ): Promise<PropertyCategoryRecord | undefined> {
    return db
      .selectFrom("property_categories")
      .selectAll()
      .where(sql<boolean>`lower(code) = lower(${code})`)
      .executeTakeFirst();
  }

  async findTypeByCode(db: DbExecutor, code: string): Promise<PropertyTypeRecord | undefined> {
    return db
      .selectFrom("property_types")
      .selectAll()
      .where(sql<boolean>`lower(code) = lower(${code})`)
      .executeTakeFirst();
  }

  async createCategory(
    db: DbExecutor,
    input: {
      code: string;
      name: string;
      homepageHeading: string;
      sortOrder: number;
      homepageVisible: boolean;
      enabled: boolean;
    }
  ): Promise<PropertyCategoryRecord> {
    return db
      .insertInto("property_categories")
      .values({
        code: input.code,
        name: input.name,
        homepage_heading: input.homepageHeading,
        sort_order: input.sortOrder,
        homepage_visible: input.homepageVisible,
        status: input.enabled ? "ACTIVE" : "INACTIVE"
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateCategory(
    db: DbExecutor,
    id: string,
    input: {
      name: string;
      homepageHeading: string;
      sortOrder: number;
      homepageVisible: boolean;
      enabled: boolean;
      version: number;
    }
  ): Promise<PropertyCategoryRecord | undefined> {
    return db
      .updateTable("property_categories")
      .set({
        name: input.name,
        homepage_heading: input.homepageHeading,
        sort_order: input.sortOrder,
        homepage_visible: input.homepageVisible,
        status: input.enabled ? "ACTIVE" : "INACTIVE",
        version: sql<number>`version + 1`,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("version", "=", input.version)
      .returningAll()
      .executeTakeFirst();
  }

  async createType(
    db: DbExecutor,
    input: {
      categoryId: string;
      code: string;
      name: string;
      sortOrder: number;
      enabled: boolean;
    }
  ): Promise<PropertyTypeRecord> {
    return db
      .insertInto("property_types")
      .values({
        property_category_id: input.categoryId,
        code: input.code,
        name: input.name,
        sort_order: input.sortOrder,
        status: input.enabled ? "ACTIVE" : "INACTIVE"
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateType(
    db: DbExecutor,
    id: string,
    input: { name: string; sortOrder: number; enabled: boolean; version: number }
  ): Promise<PropertyTypeRecord | undefined> {
    return db
      .updateTable("property_types")
      .set({
        name: input.name,
        sort_order: input.sortOrder,
        status: input.enabled ? "ACTIVE" : "INACTIVE",
        version: sql<number>`version + 1`,
        updated_at: new Date()
      })
      .where("id", "=", id)
      .where("version", "=", input.version)
      .returningAll()
      .executeTakeFirst();
  }

  async categoryUsageCount(db: DbExecutor, categoryId: string): Promise<number> {
    const row = await db
      .selectFrom("properties")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("property_category_id", "=", categoryId)
      .where("status", "<>", "ARCHIVED")
      .executeTakeFirstOrThrow();
    return row.count;
  }

  async typeUsageCount(db: DbExecutor, typeId: string): Promise<number> {
    const row = await db
      .selectFrom("properties")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("property_type_id", "=", typeId)
      .where("status", "<>", "ARCHIVED")
      .executeTakeFirstOrThrow();
    return row.count;
  }
}
