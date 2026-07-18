import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve("public/images");
const SOURCE_PATTERN = /\.(?:png|jpe?g)$/i;
const EXCLUDED_DIRECTORIES = new Set(["_source", "dist", "node_modules"]);
const KNOWN_INEFFICIENT = new Set(["optima-servis/old-site.jpg"]);
const DELETE_ORIGINALS = process.argv.includes("--delete-originals");

async function walk(directory, pattern = SOURCE_PATTERN) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) files.push(...(await walk(entryPath, pattern)));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function publicPath(filePath) {
  return `/${path.relative(path.resolve("public"), filePath).split(path.sep).join("/")}`;
}

async function inspect(filePath) {
  const image = sharp(filePath);
  const [metadata, imageStats, fileStats] = await Promise.all([image.metadata(), image.stats(), fs.stat(filePath)]);
  return { metadata, isOpaque: imageStats.isOpaque, bytes: fileStats.size };
}

function validate(source, output, sourcePath) {
  if (!output.bytes) throw new Error("WebP is empty");
  if (output.metadata.format !== "webp") throw new Error("Output is not readable WebP");
  if (source.metadata.width !== output.metadata.width || source.metadata.height !== output.metadata.height) {
    throw new Error(
      `Dimensions changed: ${source.metadata.width}x${source.metadata.height} -> ${output.metadata.width}x${output.metadata.height}`,
    );
  }
  if (!source.isOpaque && output.isOpaque) throw new Error("Transparency was lost");
  if (source.metadata.orientation && source.metadata.orientation !== 1) {
    throw new Error(`EXIF orientation ${source.metadata.orientation} needs an explicit manual decision: ${sourcePath}`);
  }
}

const sourceFiles = (await walk(ROOT)).sort();
const report = [];

for (const sourcePath of sourceFiles) {
  const outputPath = sourcePath.replace(SOURCE_PATTERN, ".webp");
  const source = await inspect(sourcePath);
  const relativeSourcePath = path.relative(ROOT, sourcePath).split(path.sep).join("/");

  if (KNOWN_INEFFICIENT.has(relativeSourcePath)) {
    report.push({
      source: publicPath(sourcePath),
      output: null,
      before: source.bytes,
      after: source.bytes,
      status: "kept-original-known-not-smaller",
    });
    continue;
  }

  try {
    const outputExists = await fs
      .stat(outputPath)
      .then(() => true)
      .catch((error) => {
        if (error?.code === "ENOENT") return false;
        throw error;
      });

    if (outputExists) {
      const existing = await inspect(outputPath);
      validate(source, existing, sourcePath);
      report.push({
        source: publicPath(sourcePath),
        output: publicPath(outputPath),
        before: source.bytes,
        after: existing.bytes,
        status: existing.bytes < source.bytes ? "reused" : "existing-output-is-not-smaller",
      });
      continue;
    }

    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    try {
      const buffer = await sharp(sourcePath).webp({ lossless: true, effort: 6 }).toBuffer();
      await fs.writeFile(temporaryPath, buffer, { flag: "wx" });
      const output = await inspect(temporaryPath);
      validate(source, output, sourcePath);

      if (output.bytes >= source.bytes) {
        await fs.unlink(temporaryPath);
        report.push({
          source: publicPath(sourcePath),
          output: null,
          before: source.bytes,
          after: output.bytes,
          status: "kept-original-not-smaller",
        });
        continue;
      }

      await fs.rename(temporaryPath, outputPath);
      report.push({
        source: publicPath(sourcePath),
        output: publicPath(outputPath),
        before: source.bytes,
        after: output.bytes,
        status: "converted",
      });
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
  } catch (error) {
    report.push({
      source: publicPath(sourcePath),
      output: null,
      before: source.bytes,
      after: null,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const totals = report.reduce(
  (summary, item) => {
    summary[item.status] = (summary[item.status] ?? 0) + 1;
    summary.before += item.before;
    if (item.output && item.after) summary.after += item.after;
    else summary.after += item.before;
    return summary;
  },
  { before: 0, after: 0 },
);

console.table(report);
console.log(JSON.stringify({ settings: { lossless: true, effort: 6 }, totals }, null, 2));

const failed = report.some((item) => item.status === "error" || item.status === "existing-output-is-not-smaller");

const sourceCodeFiles = await walk(path.resolve("src"), /\.(?:astro|css|js|json|md|ts)$/i);
const missingReferences = [];

for (const sourceCodePath of sourceCodeFiles) {
  const contents = await fs.readFile(sourceCodePath, "utf8");
  const references = contents.match(/\/(?:assets|images)\/[^\s"'()<>]+\.(?:gif|jpe?g|png|svg|webp)/gi) ?? [];

  for (const reference of references) {
    const targetPath = path.join(path.resolve("public"), reference);
    try {
      await fs.access(targetPath);
    } catch {
      missingReferences.push({ source: path.relative(process.cwd(), sourceCodePath), reference });
    }
  }
}

console.log(JSON.stringify({ checkedReferences: true, missingReferences }, null, 2));

if (DELETE_ORIGINALS && !failed && missingReferences.length === 0) {
  const deleted = [];
  const blockedByReferences = [];

  for (const item of report.filter((entry) => entry.output)) {
    const references = [];
    for (const sourceCodePath of sourceCodeFiles) {
      const contents = await fs.readFile(sourceCodePath, "utf8");
      if (contents.includes(item.source)) references.push(path.relative(process.cwd(), sourceCodePath));
    }

    if (references.length) {
      blockedByReferences.push({ source: item.source, references });
      continue;
    }

    await fs.unlink(path.join(path.resolve("public"), item.source));
    deleted.push(item.source);
  }

  console.log(JSON.stringify({ deleted, blockedByReferences }, null, 2));
  if (blockedByReferences.length) process.exitCode = 1;
}

if (failed || missingReferences.length) {
  process.exitCode = 1;
}
