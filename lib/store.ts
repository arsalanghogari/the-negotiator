import { promises as fs } from 'fs';
import path from 'path';

// Storage seam (spec §2): Supabase when SUPABASE_URL/SUPABASE_ANON_KEY are set
// (required on Netlify — serverless FS is read-only), local JSON files otherwise.
// One table holds everything: collections(name text primary key, items jsonb).

const DATA_DIR = path.join(process.cwd(), '.data');
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

async function supabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
}

function fileFor(collection: string) {
  return path.join(DATA_DIR, `${collection}.json`);
}

export async function readAll<T>(collection: string): Promise<T[]> {
  if (useSupabase) {
    const db = await supabase();
    const { data, error } = await db.from('collections').select('items').eq('name', collection).maybeSingle();
    if (error) throw new Error(`store read ${collection}: ${error.message}`);
    return (data?.items as T[]) ?? [];
  }
  try {
    return JSON.parse(await fs.readFile(fileFor(collection), 'utf8'));
  } catch {
    return [];
  }
}

export async function writeAll<T>(collection: string, items: T[]): Promise<void> {
  if (useSupabase) {
    const db = await supabase();
    const { error } = await db.from('collections').upsert({ name: collection, items });
    if (error) throw new Error(`store write ${collection}: ${error.message}`);
    return;
  }
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
