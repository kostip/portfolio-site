import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageMetadata } from 'astro/assets/utils';

const publicRoot = path.resolve(process.cwd(), 'public');
const projectContentRoot = path.resolve(process.cwd(), 'src/content/projects');
const rasterImagePattern = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const imageDimensions = new Map();

function isInsideDirectory(filePath, directory) {
  const relativePath = path.relative(directory, filePath);
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..';
}

function isProjectMarkdown(fileUrl) {
  if (!fileUrl) return false;
  return isInsideDirectory(fileURLToPath(fileUrl), projectContentRoot);
}

function resolvePublicImagePath(src) {
  if (!src.startsWith('/')) return undefined;

  const pathname = decodeURIComponent(src.split(/[?#]/, 1)[0]);
  if (!rasterImagePattern.test(pathname)) return undefined;

  const filePath = path.resolve(publicRoot, `.${pathname}`);
  if (!isInsideDirectory(filePath, publicRoot)) {
    throw new Error(`Image path escapes public/: ${src}`);
  }

  return filePath;
}

export async function getPublicImageDimensions(src) {
  const filePath = resolvePublicImagePath(src);
  if (!filePath) return undefined;

  let dimensions = imageDimensions.get(filePath);
  if (!dimensions) {
    dimensions = readFile(filePath).then(async (contents) => {
      const metadata = await imageMetadata(contents, src);
      return { width: metadata.width, height: metadata.height };
    });
    imageDimensions.set(filePath, dimensions);
  }

  return dimensions;
}

function getHtmlAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function setHtmlAttribute(tag, name, value) {
  const attributePattern = new RegExp(
    `(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s>]+)`,
    'i',
  );

  if (attributePattern.test(tag)) {
    return tag.replace(attributePattern, `$1"${value}"`);
  }

  const selfClosing = /\/>\s*$/.test(tag);
  const tagWithoutClosing = tag.replace(/\s*\/?>\s*$/, '');
  return `${tagWithoutClosing} ${name}="${value}"${selfClosing ? ' />' : '>'}`;
}

async function enhanceRawImageTag(tag) {
  const src = getHtmlAttribute(tag, 'src');
  if (!src) return tag;

  const dimensions = await getPublicImageDimensions(src);
  let enhancedTag = setHtmlAttribute(tag, 'loading', 'lazy');
  enhancedTag = setHtmlAttribute(enhancedTag, 'decoding', 'async');

  if (dimensions) {
    enhancedTag = setHtmlAttribute(enhancedTag, 'width', dimensions.width);
    enhancedTag = setHtmlAttribute(enhancedTag, 'height', dimensions.height);
  }

  return enhancedTag;
}

async function enhanceRawHtmlImages(value) {
  const imageTagPattern = /<img\b[^>]*>/gi;
  let enhancedHtml = '';
  let previousIndex = 0;

  for (const match of value.matchAll(imageTagPattern)) {
    const matchIndex = match.index ?? 0;
    enhancedHtml += value.slice(previousIndex, matchIndex);
    enhancedHtml += await enhanceRawImageTag(match[0]);
    previousIndex = matchIndex + match[0].length;
  }

  return enhancedHtml + value.slice(previousIndex);
}

export function createProjectImageAttributesPlugin() {
  return {
    name: 'project-image-attributes',
    element: {
      filter: ['img'],
      async visit(node, context) {
        if (!isProjectMarkdown(context.fileURL)) return;

        const src = typeof node.properties?.src === 'string' ? node.properties.src : undefined;
        if (!src) return;

        const dimensions = await getPublicImageDimensions(src);
        context.setProperty(node, 'loading', 'lazy');
        context.setProperty(node, 'decoding', 'async');

        if (dimensions) {
          context.setProperty(node, 'width', dimensions.width);
          context.setProperty(node, 'height', dimensions.height);
        }
      },
    },
    async raw(node, context) {
      if (!isProjectMarkdown(context.fileURL) || !node.value.includes('<img')) return;

      const value = await enhanceRawHtmlImages(node.value);
      context.replaceNode(node, { ...node, value });
    },
  };
}
