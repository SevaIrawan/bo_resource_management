import { BRAND_SELECT } from '@/config/dbColumns';
import { TABLES } from '@/config/tables';
import { getSupabase } from '@/lib/supabase';
import type { Brand } from '@/types/database';

export async function ensureBrand(input: {
  userId: string;
  brandName: string;
  emptySlotCount?: number;
}): Promise<Brand> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');

  const name = input.brandName.trim();

  const { data: existing, error: findError } = await supabase
    .from(TABLES.brands)
    .select(BRAND_SELECT)
    .eq('user_id', input.userId)
    .eq('name', name)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as Brand;

  const { data, error } = await supabase
    .from(TABLES.brands)
    .insert({
      user_id: input.userId,
      name,
      empty_slot_count: input.emptySlotCount ?? 3,
    })
    .select(BRAND_SELECT)
    .single();

  if (error) throw error;
  return data as Brand;
}

export async function loadUserBrands(userId: string): Promise<Brand[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLES.brands)
    .select(BRAND_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data as Brand[]) ?? [];
}
