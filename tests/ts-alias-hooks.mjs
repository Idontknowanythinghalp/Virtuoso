import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC_DIR = path.resolve(process.cwd(), "src");

function resolveTsCandidate(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = resolveTsCandidate(path.join(SRC_DIR, specifier.slice(2)));
    if (target) {
      return nextResolve(pathToFileURL(target).href, context);
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:") &&
    !path.extname(specifier)
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const target = resolveTsCandidate(path.resolve(parentDir, specifier));
    if (target) {
      return nextResolve(pathToFileURL(target).href, context);
    }
  }

  return nextResolve(specifier, context);
}
