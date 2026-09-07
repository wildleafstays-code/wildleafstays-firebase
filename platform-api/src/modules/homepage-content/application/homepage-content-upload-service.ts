import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";
import {
  PropertyAssetConflictError,
  PropertyAssetIntegrityError,
  PropertyAssetTooLargeError,
  type PropertyAssetStorage,
  type StoredPropertyAsset
} from "../../../infrastructure/storage/property-asset-storage.js";
import type { ActorContext } from "../../access/domain/actor-context.js";
import { ConflictError, ValidationError } from "../../../shared/errors/app-error.js";

export const MAX_HOMEPAGE_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);

class HomepageImageSignatureVerifier extends Transform {
  private prefix = Buffer.alloc(0);

  constructor(private readonly contentType: string) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void
  ): void {
    if (this.prefix.length < 16) {
      this.prefix = Buffer.concat([this.prefix, chunk]).subarray(0, 16);
    }
    callback(null, chunk);
  }

  override _flush(callback: (error?: Error | null) => void): void {
    const valid =
      (this.contentType === "image/jpeg" &&
        this.prefix.length >= 3 &&
        this.prefix[0] === 0xff &&
        this.prefix[1] === 0xd8 &&
        this.prefix[2] === 0xff) ||
      (this.contentType === "image/png" &&
        this.prefix.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
      (this.contentType === "image/webp" &&
        this.prefix.subarray(0, 4).toString("ascii") === "RIFF" &&
        this.prefix.subarray(8, 12).toString("ascii") === "WEBP") ||
      (this.contentType === "image/avif" &&
        this.prefix.subarray(4, 8).toString("ascii") === "ftyp" &&
        ["avif", "avis", "mif1"].includes(this.prefix.subarray(8, 12).toString("ascii")));

    callback(
      valid
        ? null
        : new PropertyAssetIntegrityError("Uploaded bytes do not match the declared file type")
    );
  }
}

function verifyFileSignature(stream: Readable, contentType: string): Readable {
  return stream.pipe(new HomepageImageSignatureVerifier(contentType));
}

function assertSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new ValidationError("X-Content-SHA256 must be a lowercase hexadecimal SHA-256 digest");
  }
  return value;
}

async function translateStorageErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PropertyAssetTooLargeError) {
      throw new ValidationError("Uploaded file is too large", { maxBytes: error.maxBytes });
    }
    if (error instanceof PropertyAssetIntegrityError) {
      throw new ValidationError(error.message);
    }
    if (error instanceof PropertyAssetConflictError) {
      throw new ConflictError(error.message);
    }
    throw error;
  }
}

export interface HomepageImageUploadInput {
  actor: ActorContext;
  assetId: string;
  idempotencyKey: string;
  contentType: string;
  contentSha256: string;
  stream: Readable;
}

export class HomepageContentUploadService {
  constructor(private readonly storage: PropertyAssetStorage) {}

  async storeHeroImage(input: HomepageImageUploadInput): Promise<StoredPropertyAsset> {
    return this.storeImage(input, "hero");
  }

  async storeDestinationImage(input: HomepageImageUploadInput): Promise<StoredPropertyAsset> {
    return this.storeImage(input, "destination");
  }

  private async storeImage(
    input: HomepageImageUploadInput,
    kind: "hero" | "destination"
  ): Promise<StoredPropertyAsset> {
    const extension = IMAGE_TYPES.get(input.contentType);
    if (!extension) {
      throw new ValidationError("Homepage images must be JPEG, PNG, WebP or AVIF");
    }

    const sha256 = assertSha256(input.contentSha256);
    const objectId = createHash("sha256")
      .update(`${kind}:${input.assetId}:${input.actor.userId}:${input.idempotencyKey}`)
      .digest("hex");
    const objectKey = `homepage/${kind}/${input.assetId}/${objectId}.${extension}`;

    return translateStorageErrors(() =>
      this.storage.store({
        objectKey,
        contentType: input.contentType,
        expectedSha256: sha256,
        maxBytes: MAX_HOMEPAGE_IMAGE_BYTES,
        stream: verifyFileSignature(input.stream, input.contentType),
        cacheControl: "public, max-age=31536000, immutable"
      })
    );
  }
}
