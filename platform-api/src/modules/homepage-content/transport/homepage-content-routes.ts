import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database, JsonObject } from "../../../infrastructure/database/types.js";
import type { IdentityVerifier } from "../../../infrastructure/identity/identity-verifier.js";
import type { PropertyAssetStorage } from "../../../infrastructure/storage/property-asset-storage.js";
import type { AccessRepository } from "../../access/infrastructure/access-repository.js";
import type { UserRepository } from "../../identity/infrastructure/user-repository.js";
import { HomepageContentService } from "../application/homepage-content-service.js";
import {
  HomepageContentUploadService,
  MAX_HOMEPAGE_IMAGE_BYTES
} from "../application/homepage-content-upload-service.js";
import {
  AuthenticationError,
  NotFoundError,
  ValidationError
} from "../../../shared/errors/app-error.js";
import { requireAuthentication } from "../../../shared/http/authenticate.js";
import { requestMetadata } from "../../../shared/http/request-metadata.js";
import { IdempotencyService } from "../../../shared/idempotency/idempotency-service.js";

export interface HomepageContentRouteDependencies {
  db: Kysely<Database>;
  identityVerifier: IdentityVerifier;
  userRepository: UserRepository;
  accessRepository: AccessRepository;
  propertyAssetStorage: PropertyAssetStorage;
}

interface ManagedUploadHeaders {
  "idempotency-key": string;
  "x-content-sha256": string;
}

interface HomepageMediaParams {
  mediaId: string;
}

interface HomepageItemParams {
  id: string;
}

interface HeroCreateQuery {
  headline: string;
  subtitle?: string;
  offerLabel?: string;
  ctaLabel?: string;
  ctaHref?: string;
  altText?: string;
  focalXPercent?: number;
  focalYPercent?: number;
  sortOrder?: number;
  enabled?: boolean;
  startsAt?: string;
  endsAt?: string;
}

interface HeroUpdateBody extends JsonObject {
  headline: string;
  subtitle: string | null;
  offerLabel: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  altText: string | null;
  focalXPercent: number;
  focalYPercent: number;
  sortOrder: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  version: number;
}

interface DestinationCreateQuery {
  city: string;
  stateRegion?: string;
  countryCode: string;
  altText?: string;
  sortOrder?: number;
  enabled?: boolean;
}

interface DestinationUpdateBody extends JsonObject {
  altText: string | null;
  sortOrder: number;
  enabled: boolean;
  version: number;
}

interface ReplaceImageQuery {
  version: number;
  altText?: string;
}

interface ArchiveBody extends JsonObject {
  version: number;
}

const nullableString = {
  anyOf: [{ type: "string" }, { type: "null" }]
} as const;

const idParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", format: "uuid" }
  }
} as const;

const publicMediaParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mediaId"],
  properties: {
    mediaId: { type: "string", format: "uuid" }
  }
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

const managedUploadHeaders = {
  type: "object",
  required: ["idempotency-key", "x-content-sha256"],
  properties: {
    ...idempotencyHeaders.properties,
    "x-content-sha256": {
      type: "string",
      pattern: "^[a-f0-9]{64}$"
    }
  }
} as const;

const heroCreateQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline"],
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 160 },
    subtitle: { type: "string", maxLength: 300 },
    offerLabel: { type: "string", maxLength: 80 },
    ctaLabel: { type: "string", maxLength: 60 },
    ctaHref: { type: "string", maxLength: 500 },
    altText: { type: "string", maxLength: 500 },
    focalXPercent: { type: "integer", minimum: 0, maximum: 100, default: 50 },
    focalYPercent: { type: "integer", minimum: 0, maximum: 100, default: 50 },
    sortOrder: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
    enabled: { type: "boolean", default: false },
    startsAt: { type: "string", format: "date-time" },
    endsAt: { type: "string", format: "date-time" }
  }
} as const;

const heroUpdateBodySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "subtitle",
    "offerLabel",
    "ctaLabel",
    "ctaHref",
    "altText",
    "focalXPercent",
    "focalYPercent",
    "sortOrder",
    "enabled",
    "startsAt",
    "endsAt",
    "version"
  ],
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 160 },
    subtitle: nullableString,
    offerLabel: nullableString,
    ctaLabel: nullableString,
    ctaHref: nullableString,
    altText: nullableString,
    focalXPercent: { type: "integer", minimum: 0, maximum: 100 },
    focalYPercent: { type: "integer", minimum: 0, maximum: 100 },
    sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
    enabled: { type: "boolean" },
    startsAt: {
      anyOf: [{ type: "string", format: "date-time" }, { type: "null" }]
    },
    endsAt: {
      anyOf: [{ type: "string", format: "date-time" }, { type: "null" }]
    },
    version: { type: "integer", minimum: 1 }
  }
} as const;

const destinationCreateQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["city", "countryCode"],
  properties: {
    city: { type: "string", minLength: 1, maxLength: 150 },
    stateRegion: { type: "string", maxLength: 150 },
    countryCode: { type: "string", pattern: "^[A-Za-z]{2}$" },
    altText: { type: "string", maxLength: 500 },
    sortOrder: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
    enabled: { type: "boolean", default: true }
  }
} as const;

const destinationUpdateBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["altText", "sortOrder", "enabled", "version"],
  properties: {
    altText: nullableString,
    sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
    enabled: { type: "boolean" },
    version: { type: "integer", minimum: 1 }
  }
} as const;

const replaceImageQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["version"],
  properties: {
    version: { type: "integer", minimum: 1 },
    altText: { type: "string", maxLength: 500 }
  }
} as const;

const archiveBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["version"],
  properties: {
    version: { type: "integer", minimum: 1 }
  }
} as const;

const publicHomepageResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["heroSlides", "destinations"],
  properties: {
    heroSlides: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "headline",
          "subtitle",
          "offerLabel",
          "ctaLabel",
          "ctaHref",
          "imageId",
          "altText",
          "focalXPercent",
          "focalYPercent"
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          headline: { type: "string" },
          subtitle: nullableString,
          offerLabel: nullableString,
          ctaLabel: nullableString,
          ctaHref: nullableString,
          imageId: { type: "string", format: "uuid" },
          altText: nullableString,
          focalXPercent: { type: "integer", minimum: 0, maximum: 100 },
          focalYPercent: { type: "integer", minimum: 0, maximum: 100 }
        }
      }
    },
    destinations: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "city",
          "stateRegion",
          "countryCode",
          "propertyCount",
          "imageId",
          "altText"
        ],
        properties: {
          city: { type: "string" },
          stateRegion: nullableString,
          countryCode: { type: "string", pattern: "^[A-Z]{2}$" },
          propertyCount: { type: "integer", minimum: 1 },
          imageId: {
            anyOf: [{ type: "string", format: "uuid" }, { type: "null" }]
          },
          altText: nullableString
        }
      }
    }
  }
} as const;

function requireIdempotencyKey(headers: Record<string, unknown>): string {
  const key = headers["idempotency-key"];
  if (typeof key !== "string") {
    throw new ValidationError("Idempotency key is required");
  }
  return key;
}

function dateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function registerHomepageContentRoutes(
  app: FastifyInstance,
  deps: HomepageContentRouteDependencies
): Promise<void> {
  const authenticate = requireAuthentication(deps);
  const idempotency = new IdempotencyService(deps.db);
  const service = new HomepageContentService();
  const uploads = new HomepageContentUploadService(deps.propertyAssetStorage);

  app.get(
    "/v1/public/homepage",
    {
      schema: {
        tags: ["Public Booking"],
        summary: "Get published Wildleaf homepage content",
        response: { 200: publicHomepageResponseSchema }
      }
    },
    async (_request, reply) => {
      void reply.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
      return service.getPublicHomepage(deps.db);
    }
  );

  app.get<{ Params: HomepageMediaParams }>(
    "/v1/public/homepage/media/:mediaId",
    {
      schema: {
        tags: ["Public Booking"],
        summary: "Open a published homepage image",
        params: publicMediaParamsSchema
      }
    },
    async (request, reply) => {
      const storageKey = await service.getPublicMediaStorage(
        deps.db,
        request.params.mediaId
      );
      const url = await deps.propertyAssetStorage.createReadUrl(
        storageKey,
        new Date(Date.now() + 10 * 60 * 1000)
      );
      void reply.header("cache-control", "public, max-age=300");
      return reply.redirect(url);
    }
  );

  app.get(
    "/v1/platform/homepage-content",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Manage Wildleaf homepage content",
        security: [{ bearerAuth: [] }]
      }
    },
    async (request, reply) => {
      if (!request.actor) throw new AuthenticationError();
      void reply.header("cache-control", "no-store");
      return service.listAdmin(deps.db, request.actor);
    }
  );

  app.post<{
    Querystring: HeroCreateQuery;
    Headers: ManagedUploadHeaders;
  }>(
    "/v1/platform/homepage-content/hero-slides",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Create a homepage hero slide with an image",
        security: [{ bearerAuth: [] }],
        headers: managedUploadHeaders,
        consumes: ["multipart/form-data"],
        querystring: heroCreateQuerySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      service.assertManage(actor);

      const key = requireIdempotencyKey(request.headers);
      const part = await request.file();
      if (!part || part.fieldname !== "file") {
        throw new ValidationError("A single multipart file field named 'file' is required");
      }
      const contentSha256 = request.headers["x-content-sha256"];
      const stored = await uploads.storeHeroImage({
        actor,
        assetId: "new",
        idempotencyKey: key,
        contentType: part.mimetype,
        contentSha256,
        stream: part.file
      });
      if (part.file.truncated) {
        throw new ValidationError("Uploaded image is too large", {
          maxBytes: MAX_HOMEPAGE_IMAGE_BYTES
        });
      }

      const input = {
        headline: request.query.headline,
        subtitle: request.query.subtitle ?? null,
        offerLabel: request.query.offerLabel ?? null,
        ctaLabel: request.query.ctaLabel ?? null,
        ctaHref: request.query.ctaHref ?? null,
        altText: request.query.altText ?? null,
        focalXPercent: request.query.focalXPercent ?? 50,
        focalYPercent: request.query.focalYPercent ?? 50,
        sortOrder: request.query.sortOrder ?? 0,
        enabled: request.query.enabled ?? false,
        startsAt: dateOrNull(request.query.startsAt),
        endsAt: dateOrNull(request.query.endsAt)
      };

      const result = await idempotency.execute(
        {
          scopeKey: `homepage.hero.create:user:${actor.userId}`,
          key,
          requestBody: {
            ...request.query,
            contentSha256,
            contentType: part.mimetype
          }
        },
        async (trx) => ({
          statusCode: 201,
          body: await service.createHeroSlide(
            trx,
            actor,
            input,
            {
              storageProvider: "GCS",
              storageKey: stored.objectKey,
              mimeType: stored.contentType
            },
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.put<{ Params: HomepageItemParams; Body: HeroUpdateBody }>(
    "/v1/platform/homepage-content/hero-slides/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Update homepage hero slide content and publishing rules",
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        headers: idempotencyHeaders,
        body: heroUpdateBodySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `homepage.hero.update:${request.params.id}:user:${actor.userId}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.updateHeroSlide(
            trx,
            actor,
            request.params.id,
            {
              ...request.body,
              startsAt: dateOrNull(request.body.startsAt),
              endsAt: dateOrNull(request.body.endsAt)
            },
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.post<{
    Params: HomepageItemParams;
    Querystring: ReplaceImageQuery;
    Headers: ManagedUploadHeaders;
  }>(
    "/v1/platform/homepage-content/hero-slides/:id/image",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Replace a homepage hero image",
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        headers: managedUploadHeaders,
        consumes: ["multipart/form-data"],
        querystring: replaceImageQuerySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      service.assertManage(actor);
      const key = requireIdempotencyKey(request.headers);
      const part = await request.file();
      if (!part || part.fieldname !== "file") {
        throw new ValidationError("A single multipart file field named 'file' is required");
      }
      const contentSha256 = request.headers["x-content-sha256"];
      const stored = await uploads.storeHeroImage({
        actor,
        assetId: request.params.id,
        idempotencyKey: key,
        contentType: part.mimetype,
        contentSha256,
        stream: part.file
      });
      if (part.file.truncated) {
        throw new ValidationError("Uploaded image is too large", {
          maxBytes: MAX_HOMEPAGE_IMAGE_BYTES
        });
      }
      const result = await idempotency.execute(
        {
          scopeKey: `homepage.hero.image:${request.params.id}:user:${actor.userId}`,
          key,
          requestBody: {
            ...request.query,
            contentSha256,
            contentType: part.mimetype
          }
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.replaceHeroImage(
            trx,
            actor,
            request.params.id,
            request.query.version,
            request.query.altText ?? null,
            {
              storageProvider: "GCS",
              storageKey: stored.objectKey,
              mimeType: stored.contentType
            },
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.delete<{ Params: HomepageItemParams; Body: ArchiveBody }>(
    "/v1/platform/homepage-content/hero-slides/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Archive a homepage hero slide",
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        headers: idempotencyHeaders,
        body: archiveBodySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `homepage.hero.archive:${request.params.id}:user:${actor.userId}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.archiveHeroSlide(
            trx,
            actor,
            request.params.id,
            request.body.version,
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.post<{
    Querystring: DestinationCreateQuery;
    Headers: ManagedUploadHeaders;
  }>(
    "/v1/platform/homepage-content/destination-images",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Add a managed destination image",
        security: [{ bearerAuth: [] }],
        headers: managedUploadHeaders,
        consumes: ["multipart/form-data"],
        querystring: destinationCreateQuerySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      service.assertManage(actor);
      const key = requireIdempotencyKey(request.headers);
      const part = await request.file();
      if (!part || part.fieldname !== "file") {
        throw new ValidationError("A single multipart file field named 'file' is required");
      }
      const contentSha256 = request.headers["x-content-sha256"];
      const stored = await uploads.storeDestinationImage({
        actor,
        assetId: "new",
        idempotencyKey: key,
        contentType: part.mimetype,
        contentSha256,
        stream: part.file
      });
      if (part.file.truncated) {
        throw new ValidationError("Uploaded image is too large", {
          maxBytes: MAX_HOMEPAGE_IMAGE_BYTES
        });
      }
      const input = {
        city: request.query.city,
        stateRegion: request.query.stateRegion ?? null,
        countryCode: request.query.countryCode,
        altText: request.query.altText ?? null,
        sortOrder: request.query.sortOrder ?? 0,
        enabled: request.query.enabled ?? true
      };
      const result = await idempotency.execute(
        {
          scopeKey: `homepage.destination.create:user:${actor.userId}`,
          key,
          requestBody: {
            ...request.query,
            contentSha256,
            contentType: part.mimetype
          }
        },
        async (trx) => ({
          statusCode: 201,
          body: await service.createDestinationImage(
            trx,
            actor,
            input,
            {
              storageProvider: "GCS",
              storageKey: stored.objectKey,
              mimeType: stored.contentType
            },
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.put<{ Params: HomepageItemParams; Body: DestinationUpdateBody }>(
    "/v1/platform/homepage-content/destination-images/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Update destination image publishing settings",
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        headers: idempotencyHeaders,
        body: destinationUpdateBodySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `homepage.destination.update:${request.params.id}:user:${actor.userId}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.updateDestinationImage(
            trx,
            actor,
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

  app.post<{
    Params: HomepageItemParams;
    Querystring: ReplaceImageQuery;
    Headers: ManagedUploadHeaders;
  }>(
    "/v1/platform/homepage-content/destination-images/:id/image",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Replace a destination image",
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        headers: managedUploadHeaders,
        consumes: ["multipart/form-data"],
        querystring: replaceImageQuerySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      service.assertManage(actor);
      const key = requireIdempotencyKey(request.headers);
      const part = await request.file();
      if (!part || part.fieldname !== "file") {
        throw new ValidationError("A single multipart file field named 'file' is required");
      }
      const contentSha256 = request.headers["x-content-sha256"];
      const stored = await uploads.storeDestinationImage({
        actor,
        assetId: request.params.id,
        idempotencyKey: key,
        contentType: part.mimetype,
        contentSha256,
        stream: part.file
      });
      if (part.file.truncated) {
        throw new ValidationError("Uploaded image is too large", {
          maxBytes: MAX_HOMEPAGE_IMAGE_BYTES
        });
      }
      const result = await idempotency.execute(
        {
          scopeKey: `homepage.destination.image:${request.params.id}:user:${actor.userId}`,
          key,
          requestBody: {
            ...request.query,
            contentSha256,
            contentType: part.mimetype
          }
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.replaceDestinationImage(
            trx,
            actor,
            request.params.id,
            request.query.version,
            request.query.altText ?? null,
            {
              storageProvider: "GCS",
              storageKey: stored.objectKey,
              mimeType: stored.contentType
            },
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );

  app.delete<{ Params: HomepageItemParams; Body: ArchiveBody }>(
    "/v1/platform/homepage-content/destination-images/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Homepage Content"],
        summary: "Archive a destination image",
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        headers: idempotencyHeaders,
        body: archiveBodySchema
      }
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) throw new AuthenticationError();
      const key = requireIdempotencyKey(request.headers);
      const result = await idempotency.execute(
        {
          scopeKey: `homepage.destination.archive:${request.params.id}:user:${actor.userId}`,
          key,
          requestBody: request.body
        },
        async (trx) => ({
          statusCode: 200,
          body: await service.archiveDestinationImage(
            trx,
            actor,
            request.params.id,
            request.body.version,
            requestMetadata(request, "platform-api")
          )
        })
      );
      if (result.replayed) void reply.header("idempotency-replayed", "true");
      return reply.status(result.statusCode).send(result.body);
    }
  );
}
