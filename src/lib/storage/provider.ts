import "server-only";

export interface StorageProvider {
  /**
   * Uploads a file buffer to private storage.
   */
  uploadFile(
    bucket: string,
    path: string,
    content: Buffer | Uint8Array,
    mimeType: string,
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }>;

  /**
   * Generates a short-lived authenticated signed URL for downloading / viewing.
   */
  getSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number,
  ): Promise<{ ok: true; url: string } | { ok: false; error: string }>;

  /**
   * Deletes a file from storage.
   */
  deleteFile(
    bucket: string,
    path: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;

  /**
   * Checks whether a file exists in the storage bucket.
   */
  fileExists(bucket: string, path: string): Promise<boolean>;
}
