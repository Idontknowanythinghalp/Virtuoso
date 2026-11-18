import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import type { StorageProvider } from "@/lib/storage/provider";

export class SupabaseStorageProvider implements StorageProvider {
  private async ensureBucket(bucket: string): Promise<boolean> {
    if (!isAdminSupabaseConfigured()) return false;
    try {
      const admin = createSupabaseAdminClient();
      const { data: buckets } = await admin.storage.listBuckets();
      if (!buckets?.some((b) => b.name === bucket)) {
        await admin.storage.createBucket(bucket, {
          public: false, // Strict requirement: Private storage buckets only!
          fileSizeLimit: 26214400, // 25 MB limit
        });
      }
      return true;
    } catch {
      // If listBuckets or createBucket is not permitted or already exists, proceed
      return true;
    }
  }

  async uploadFile(
    bucket: string,
    path: string,
    content: Buffer | Uint8Array,
    mimeType: string,
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        error:
          "Storage upload requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.",
      };
    }

    try {
      await this.ensureBucket(bucket);
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.storage.from(bucket).upload(path, content, {
        contentType: mimeType,
        upsert: false,
      });

      if (error || !data) {
        return {
          ok: false,
          error: error?.message ?? "Failed to upload file to storage.",
        };
      }

      return { ok: true, path: data.path };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown storage upload error.",
      };
    }
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number = 300,
  ): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        error:
          "Storage access requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.",
      };
    }

    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);

      if (error || !data?.signedUrl) {
        return {
          ok: false,
          error: error?.message ?? "Unable to generate signed URL.",
        };
      }

      return { ok: true, url: data.signedUrl };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Unknown error generating signed URL.",
      };
    }
  }

  async deleteFile(
    bucket: string,
    path: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isAdminSupabaseConfigured()) {
      return {
        ok: false,
        error:
          "Storage deletion requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.",
      };
    }

    try {
      const admin = createSupabaseAdminClient();
      const { error } = await admin.storage.from(bucket).remove([path]);
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "Unknown storage delete error.",
      };
    }
  }

  async fileExists(bucket: string, path: string): Promise<boolean> {
    if (!isAdminSupabaseConfigured()) return false;
    try {
      const admin = createSupabaseAdminClient();
      const dir = path.substring(0, path.lastIndexOf("/")) || "";
      const fileName = path.substring(path.lastIndexOf("/") + 1);
      const { data } = await admin.storage.from(bucket).list(dir);
      return Boolean(data?.some((file) => file.name === fileName));
    } catch {
      return false;
    }
  }
}
