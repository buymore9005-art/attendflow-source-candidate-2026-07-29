import { getSupabase } from '@/lib/supabase';
import { safeFileName } from '@/utils/sanitize';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export async function uploadOrganizationFile(bucket: string, organizationId: string, category: string, file: File): Promise<string> {
  if (!allowedTypes.has(file.type)) throw new Error('Unsupported file type');
  if (file.size > 8 * 1024 * 1024) throw new Error('File exceeds 8 MB');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${organizationId}/${category}/${crypto.randomUUID()}-${safeFileName(file.name.replace(new RegExp(`\\.${extension}$`, 'i'), ''))}.${extension}`;
  const { error } = await getSupabase().storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function createSignedFileUrl(bucket: string, path: string, expiresIn = 300): Promise<string> {
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeOrganizationFiles(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getSupabase().storage.from(bucket).remove(paths);
  if (error) throw error;
}
