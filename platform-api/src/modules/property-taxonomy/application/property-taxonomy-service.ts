import type { Kysely, Transaction } from "kysely";
import { randomUUID } from "node:crypto";
import type { Database, JsonObject } from "../../../infrastructure/database/types.js";
import type { ActorContext } from "../../access/domain/actor-context.js";
import { AuthorizationService } from "../../access/domain/authorization-service.js";
import { Permissions } from "../../access/domain/permissions.js";
import { AuditService } from "../../../shared/audit/audit-service.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";
import type { RequestMetadata } from "../../../shared/http/request-metadata.js";
import type {
  CreatePropertyCategoryInput,
  CreatePropertyTypeInput,
  PropertyCategoryView,
  PropertyTypeView,
  UpdatePropertyCategoryInput,
  UpdatePropertyTypeInput
} from "../domain/property-taxonomy.js";
import {
  PropertyTaxonomyRepository,
  type PropertyCategoryRecord,
  type PropertyTypeRecord,
  type PublicPropertyCategoryRecord,
  type PublicPropertyTypeRecord
} from "../infrastructure/property-taxonomy-repository.js";

function cleanText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length < 2) throw new ValidationError(`${label} is required`);
  if (normalized.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function order(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new ValidationError("Display order must be a whole number between 0 and 10000");
  }
  return value;
}

function codePart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || "ITEM";
}

function categoryView(
  row: PropertyCategoryRecord | PublicPropertyCategoryRecord
): PropertyCategoryView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    homepageHeading: row.homepage_heading,
    sortOrder: row.sort_order,
    homepageVisible: row.homepage_visible,
    enabled: row.status === "ACTIVE",
    version: row.version,
    ...("property_count" in row ? { propertyCount: row.property_count } : {})
  };
}

function typeView(row: PropertyTypeRecord | PublicPropertyTypeRecord): PropertyTypeView {
  return {
    id: row.id,
    categoryId: row.property_category_id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
    enabled: row.status === "ACTIVE",
    version: row.version,
    ...("property_count" in row ? { propertyCount: row.property_count } : {})
  };
}

export class PropertyTaxonomyService {
  constructor(
    private readonly repository = new PropertyTaxonomyRepository(),
    private readonly authorization = new AuthorizationService()
  ) {}

  private assertManage(actor: ActorContext): void {
    this.authorization.assert(actor, Permissions.HOMEPAGE_CONTENT_MANAGE, { kind: "platform" });
  }

  async listPublic(
    db: Kysely<Database>
  ): Promise<{ categories: PropertyCategoryView[]; types: PropertyTypeView[] }> {
    const [categories, types] = await Promise.all([
      this.repository.listPublicCategories(db),
      this.repository.listPublicTypes(db)
    ]);
    return { categories: categories.map(categoryView), types: types.map(typeView) };
  }

  async listAdmin(
    db: Kysely<Database>,
    actor: ActorContext
  ): Promise<{ categories: PropertyCategoryView[]; types: PropertyTypeView[] }> {
    this.assertManage(actor);
    const [categories, types] = await Promise.all([
      this.repository.listCategories(db),
      this.repository.listTypes(db)
    ]);
    return { categories: categories.map(categoryView), types: types.map(typeView) };
  }

  async createCategory(
    trx: Transaction<Database>,
    actor: ActorContext,
    input: CreatePropertyCategoryInput,
    request: RequestMetadata
  ): Promise<{ category: PropertyCategoryView }> {
    this.assertManage(actor);
    const name = cleanText(input.name, "Category name", 120);
    const homepageHeading = cleanText(input.homepageHeading, "Homepage heading", 160);
    let code = codePart(name);
    if (await this.repository.findCategoryByCode(trx, code)) {
      code = `${code.slice(0, 38)}_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    }
    const row = await this.repository.createCategory(trx, {
      code,
      name,
      homepageHeading,
      sortOrder: order(input.sortOrder),
      homepageVisible: Boolean(input.homepageVisible),
      enabled: Boolean(input.enabled)
    });
    const view = categoryView(row);
    await new AuditService(trx).record({
      actor,
      action: "property_taxonomy.category.created",
      entityType: "property_category",
      entityId: row.id,
      before: null,
      after: { ...view } as JsonObject,
      request
    });
    return { category: view };
  }

  async updateCategory(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    input: UpdatePropertyCategoryInput,
    request: RequestMetadata
  ): Promise<{ category: PropertyCategoryView }> {
    this.assertManage(actor);
    const before = await this.repository.findCategory(trx, id);
    if (!before) throw new NotFoundError("Property category not found");
    if (!input.enabled && before.status === "ACTIVE") {
      const usage = await this.repository.categoryUsageCount(trx, id);
      if (usage > 0) {
        throw new ValidationError(
          "Reclassify or archive properties using this category before disabling it"
        );
      }
    }
    const row = await this.repository.updateCategory(trx, id, {
      name: cleanText(input.name, "Category name", 120),
      homepageHeading: cleanText(input.homepageHeading, "Homepage heading", 160),
      sortOrder: order(input.sortOrder),
      homepageVisible: Boolean(input.homepageVisible),
      enabled: Boolean(input.enabled),
      version: input.version
    });
    if (!row) throw new ConflictError("Property category was changed by another request");
    const view = categoryView(row);
    await new AuditService(trx).record({
      actor,
      action: "property_taxonomy.category.updated",
      entityType: "property_category",
      entityId: row.id,
      before: { ...categoryView(before) } as JsonObject,
      after: { ...view } as JsonObject,
      request
    });
    return { category: view };
  }

  async createType(
    trx: Transaction<Database>,
    actor: ActorContext,
    input: CreatePropertyTypeInput,
    request: RequestMetadata
  ): Promise<{ propertyType: PropertyTypeView }> {
    this.assertManage(actor);
    const category = await this.repository.findCategory(trx, input.categoryId);
    if (!category) throw new NotFoundError("Property category not found");
    const name = cleanText(input.name, "Property type name", 120);
    let code = `${codePart(category.code)}_${codePart(name)}`.slice(0, 96);
    if (await this.repository.findTypeByCode(trx, code)) {
      code = `${code.slice(0, 85)}_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    }
    const row = await this.repository.createType(trx, {
      categoryId: category.id,
      code,
      name,
      sortOrder: order(input.sortOrder),
      enabled: Boolean(input.enabled)
    });
    const view = typeView(row);
    await new AuditService(trx).record({
      actor,
      action: "property_taxonomy.type.created",
      entityType: "property_type",
      entityId: row.id,
      before: null,
      after: { ...view } as JsonObject,
      request
    });
    return { propertyType: view };
  }

  async updateType(
    trx: Transaction<Database>,
    actor: ActorContext,
    id: string,
    input: UpdatePropertyTypeInput,
    request: RequestMetadata
  ): Promise<{ propertyType: PropertyTypeView }> {
    this.assertManage(actor);
    const before = await this.repository.findType(trx, id);
    if (!before) throw new NotFoundError("Property type not found");
    if (!input.enabled && before.status === "ACTIVE") {
      const usage = await this.repository.typeUsageCount(trx, id);
      if (usage > 0) {
        throw new ValidationError(
          "Reclassify or archive properties using this type before disabling it"
        );
      }
    }
    const row = await this.repository.updateType(trx, id, {
      name: cleanText(input.name, "Property type name", 120),
      sortOrder: order(input.sortOrder),
      enabled: Boolean(input.enabled),
      version: input.version
    });
    if (!row) throw new ConflictError("Property type was changed by another request");
    const view = typeView(row);
    await new AuditService(trx).record({
      actor,
      action: "property_taxonomy.type.updated",
      entityType: "property_type",
      entityId: row.id,
      before: { ...typeView(before) } as JsonObject,
      after: { ...view } as JsonObject,
      request
    });
    return { propertyType: view };
  }

  async assertSelectablePair(
    db: Kysely<Database> | Transaction<Database>,
    categoryId: string,
    typeId: string
  ): Promise<{ legacyPropertyType: string }> {
    const [category, propertyType] = await Promise.all([
      this.repository.findCategory(db, categoryId),
      this.repository.findType(db, typeId)
    ]);
    if (!category || category.status !== "ACTIVE") {
      throw new ValidationError("Select an active Property Category");
    }
    if (
      !propertyType ||
      propertyType.status !== "ACTIVE" ||
      propertyType.property_category_id !== category.id
    ) {
      throw new ValidationError("Select a Property Type belonging to the chosen Property Category");
    }

    const legacyPropertyType =
      {
        HOTEL: "HOTEL",
        RESORT: "RESORT",
        VILLA: "VILLA",
        HOMESTAY: "HOMESTAY",
        COTTAGE_CLUSTER: "COTTAGE_CLUSTER",
        SERVICED_APARTMENT: "APARTMENT",
        HOSTEL: "HOSTEL"
      }[propertyType.code] ?? "OTHER";

    return { legacyPropertyType };
  }
}
