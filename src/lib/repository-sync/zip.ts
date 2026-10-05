import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import {
  RepositorySyncFormatError,
  repositoryManifestPath,
  repositorySyncLimits,
} from "./manifest";

export function unzipRepositorySyncBundle(
  archive: Uint8Array,
): Promise<Record<string, Uint8Array>> {
  if (archive.byteLength > repositorySyncLimits.bundleBytes) {
    return Promise.reject(new RepositorySyncFormatError("invalid_size"));
  }

  return new Promise((resolve, reject) => {
    const files: Record<string, Uint8Array> = {};
    const names = new Set<string>();
    let fileCount = 0;
    let totalBytes = 0;
    let completedFiles = 0;
    let archiveParsed = false;
    let settled = false;

    const finish = () => {
      if (settled || !archiveParsed || completedFiles !== fileCount) return;
      if (fileCount === 0 || !files[repositoryManifestPath]) {
        fail("invalid_manifest");
        return;
      }
      settled = true;
      resolve(files);
    };

    const fail = (
      code: ConstructorParameters<typeof RepositorySyncFormatError>[0],
    ) => {
      if (settled) return;
      settled = true;
      reject(new RepositorySyncFormatError(code));
    };

    const unzip = new Unzip((file) => {
      fileCount += 1;
      if (fileCount > repositorySyncLimits.files + 1) {
        fail("invalid_size");
        file.terminate();
        return;
      }

      const foldedName = file.name.normalize("NFC").toLowerCase();
      if (
        !file.name.startsWith(".ideon/") ||
        file.name.endsWith("/") ||
        names.has(foldedName)
      ) {
        fail("unexpected_file");
        file.terminate();
        return;
      }
      names.add(foldedName);

      if (
        file.originalSize !== undefined &&
        file.originalSize > repositorySyncLimits.fileBytes
      ) {
        fail("invalid_size");
        file.terminate();
        return;
      }

      const chunks: Uint8Array[] = [];
      let fileBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (error) {
          fail("invalid_manifest");
          return;
        }
        if (chunk) {
          fileBytes += chunk.byteLength;
          totalBytes += chunk.byteLength;
          if (
            fileBytes > repositorySyncLimits.fileBytes ||
            totalBytes > repositorySyncLimits.bundleBytes
          ) {
            fail("invalid_size");
            file.terminate();
            return;
          }
          chunks.push(chunk);
        }
        if (final) {
          if (
            file.originalSize !== undefined &&
            file.originalSize !== fileBytes
          ) {
            fail("invalid_size");
            return;
          }
          const output = new Uint8Array(fileBytes);
          let offset = 0;
          for (const part of chunks) {
            output.set(part, offset);
            offset += part.byteLength;
          }
          files[file.name] = output;
          completedFiles += 1;
          finish();
        }
      };

      try {
        file.start();
      } catch {
        fail("invalid_manifest");
      }
    });

    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    try {
      unzip.push(archive, true);
      archiveParsed = true;
      finish();
    } catch {
      fail("invalid_manifest");
    }
  });
}
