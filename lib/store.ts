import { promises as fs } from 'fs';
import path from 'path';

// ponytail: local JSON store; swap internals for Supabase when SUPABASE_URL is set (M1+).
const DATA_DIR = path.join(process.cwd(), '.data');

function fileFor(collection: string) {
  return path.join(DATA_DIR, `${collection}.json`);
}

export async function readAll<T>(collection: string): Promise<T[]> {
  try {
    return JSON.parse(await fs.readFile(fileFor(collection), 'utf8'));
  } catch {
    return [];
  }
}

export async function writeAll<T>(collection: string, items: T[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(fileFor(collection), JSON.stringify(items, null, 2));
}

export async function upsert<T extends { [k: string]: unknown }>(
  collection: string,
  idKey: string,
  item: T
): Promise<void> {
  const items = await readAll<T>(collection);
  const i = items.findIndex((x) => x[idKey] === item[idKey]);
  if (i >= 0) items[i] = item;
  else items.push(item);
  await writeAll(collection, items);
}
