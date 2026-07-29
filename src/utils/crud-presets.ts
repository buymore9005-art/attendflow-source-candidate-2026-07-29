export interface NamedFormField {
  name: string;
}

export interface BulkUpdatePreset {
  labelKey: string;
  patch: Record<string, unknown>;
}

export function defaultActiveBulkPresets(fields: readonly NamedFormField[]): BulkUpdatePreset[] {
  if (!fields.some((field) => field.name === 'is_active')) return [];
  return [
    { labelKey: 'common.active', patch: { is_active: true } },
    { labelKey: 'common.inactive', patch: { is_active: false } }
  ];
}
