import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database, JsonObject } from "../../../infrastructure/database/types.js";
import type { IdentityVerifier } from "../../../infrastructure/identity/identity-verifier.js";
import type { AccessRepository } from "../../access/infrastructure/access-repository.js";
import type { UserRepository } from "../../identity/infrastructure/user-repository.js";
import { AuthenticationError, ValidationError } from "../../../shared/errors/app-error.js";
import { requireAuthentication } from "../../../shared/http/authenticate.js";
import { requestMetadata } from "../../../shared/http/request-metadata.js";
import { IdempotencyService } from "../../../shared/idempotency/idempotency-service.js";
import { PropertyTaxonomyService } from "../application/property-taxonomy-service.js";

export interface PropertyTaxonomyRouteDependencies {
  db: Kysely<Database>;
  identityVerifier: IdentityVerifier;
  userRepository: UserRepository;
  accessRepository: AccessRepository;
}

interface IdParams {
  id: string;
}

interface CreateCategoryBody extends JsonObject {
  name: string;
  homepageHeading: string;
  sortOrder: number;
  homepageVisible: boolean;
  enabled: boolean;
}

interface UpdateCategoryBody extends CreateCategoryBody {
  version: number;
}

interface CreateTypeBody extends JsonObject {
  categoryId: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
}

interface UpdateTypeBody extends JsonObject {
  name: string;
  sortOrder: number;
  enabled: boolean;
  version: number;
}

const idParams = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } }
} as const;

const idempotencyHeaders = {
  type: "object",
  required: ["idempotency-key"],
  properties: {
    "idempotency-key": {
      type: "string",
      minLength: 8,
      maxLength: 200,
      pattern: "^[A-Za-z0-9._:-]+$"
    }
  }
} as const;

const categoryBody = {
  type: "object",
  additionalProperties: false,
  required: ["name", "homepageHeading", "sortOrder", "homepageVisible", "enabled"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 120 },
    homepageHeading: { type: "string", minLength: 2, maxLength: 160 },
    sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
    homepageVisible: { type: "boolean" },
    enabled: { type: "boolean" }
  }
} as const;

const updateCategoryBody = {
  ...categoryBody,
  required: [...categoryBody.required, "version"],
  properties: {
    ...categoryBody.properties,
    version: { type: "integer", minimum: 1 }
  }
} as const;

const createTypeBody = {
  type: "object",
  additionalProperties: false,
  required: ["categoryId", "name", "sortOrder", "enabled"],
  properties: {
    categoryId: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 2, maxLength: 120 },
    sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
    enabled: { type: "boolean" }
  }
} as const;

const updateTypeBody = {
  type: "object",
  additionalProperties: false,
  required: ["name", "sortOrder", "enabled", "version"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 120 },
    sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
    enabled: { type: "boolean" },
    version: { type: "integer", minimum: 1 }
  }
} as const;

function requireIdempotencyKey(headers: Record<string, unknown>): string {
  const key = headers["idempotency-key"];
  if (typeof key !== "string") throw new ValidationError("Idempotency key is required");
  return key;
}

export async function registerPropertyTaxonomyRoutes(
  app: FastifyInstance,
  deps: PropertyTaxonomyRouteDependencies
): Promise<void> {
  const authenticate = requireAuthentication(deps);
  const idempotency = new IdempotencyService(deps.db);
  const service = new PropertyTaxonomyService();

  app.get(
    "/v1/public/property-taxonomy",
    {
      schema: {
        tags: ["Public Booking"],
        summary: "List active database-backed property categories and types"
      }
    },
    async (_request, reply) => {
      void reply.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
      return service.listPublic(deps.db);
    }
  );

  app.get(
    "/v1/platform/property-taxonomy",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Manage database-backed property categories and types",
        security: [{ bearerAuth: [] }]
      }
    },
    async (request, reply) => {
      if (!request.actor) throw new AuthenticationError();
      void reply.header("cache-control", "no-store");
      return service.listAdmin(deps.db, request.actor);
    }
  );

  app.post<{ Body: CreateCategoryBody }>(
    "/v1/platform/property-taxonomy/categories",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        security: [{ bearerAuth: [] }],
        headers: idempotencyHeaders,
        body: categoryBody
      }
    },
    async (request, reply) => {
      if (!request.actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `property-taxonomy.category.create:user:${request.actor.userId}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 201,
          body: await service.createCategory(
            trx,
            request.actor!,
            request.body,
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.put<{ Params: IdParams; Body: UpdateCategoryBody }>(
    "/v1/platform/property-taxonomy/categories/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        security: [{ bearerAuth: [] }],
        params: idParams,
        headers: idempotencyHeaders,
        body: updateCategoryBody
      }
    },
    async (request, reply) => {
      if (!request.actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `property-taxonomy.category.update:${request.params.id}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.updateCategory(
            trx,
            request.actor!,
            request.params.id,
            request.body,
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.post<{ Body: CreateTypeBody }>(
    "/v1/platform/property-taxonomy/types",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        security: [{ bearerAuth: [] }],
        headers: idempotencyHeaders,
        body: createTypeBody
      }
    },
    async (request, reply) => {
      if (!request.actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `property-taxonomy.type.create:user:${request.actor.userId}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 201,
          body: await service.createType(
            trx,
            request.actor!,
            request.body,
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.put<{ Params: IdParams; Body: UpdateTypeBody }>(
    "/v1/platform/property-taxonomy/types/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        security: [{ bearerAuth: [] }],
        params: idParams,
        headers: idempotencyHeaders,
        body: updateTypeBody
      }
    },
    async (request, reply) => {
      if (!request.actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `property-taxonomy.type.update:${request.params.id}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.updateType(
            trx,
            request.actor!,
            request.params.id,
            request.body,
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );
}
