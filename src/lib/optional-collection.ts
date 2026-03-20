import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection } from 'astro:content';

type CollectionFilter = Parameters<typeof getCollection>[1];

const CONTENT_ROOT = join(process.cwd(), 'src', 'content');
const presenceCache = new Map<string, boolean>();

function directoryHasFiles(dirPath: string): boolean {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile()) return true;
    if (entry.isDirectory() && directoryHasFiles(join(dirPath, entry.name))) return true;
  }
  return false;
}

function collectionHasEntries(collectionName: string): boolean {
  if (presenceCache.has(collectionName)) {
    return presenceCache.get(collectionName)!;
  }

  const dirPath = join(CONTENT_ROOT, collectionName);
  const hasEntries = existsSync(dirPath) && directoryHasFiles(dirPath);
  presenceCache.set(collectionName, hasEntries);
  return hasEntries;
}

export async function getOptionalCollection(collectionName: string, filter?: CollectionFilter) {
  if (!collectionHasEntries(collectionName)) {
    return [];
  }

  return getCollection(collectionName as never, filter as never);
}
