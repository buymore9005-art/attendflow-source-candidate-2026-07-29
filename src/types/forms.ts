export type FormFieldType = 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'switch';

export interface FormOption {
  value: string;
  labelKey?: string;
  label?: string;
}

export interface FormFieldConfig {
  name: string;
  labelKey: string;
  type: FormFieldType;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholderKey?: string;
  options?: FormOption[];
  defaultValue?: unknown;
  gridSpan?: 1 | 2;
}
