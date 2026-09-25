import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type Path, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { ApiError } from '@/lib/api/errors';

/** react-hook-form + zod, with typed values. */
export function useZodForm<TIn extends FieldValues, TOut extends FieldValues>(
  schema: z.ZodType<TOut, TIn>,
  props?: Omit<UseFormProps<TIn, unknown, TOut>, 'resolver'>,
) {
  return useForm<TIn, unknown, TOut>({ mode: 'onTouched', ...props, resolver: zodResolver(schema) });
}

/**
 * Maps a Laravel 422 onto form fields. Returns true when handled (field errors shown),
 * false for any other error (caller shows a form-level message).
 */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T, unknown, FieldValues>, error: unknown): boolean {
  if (!(error instanceof ApiError) || !error.isValidation) return false;
  const fields = Object.entries(error.fieldErrors);
  const known = fields.filter(([name]) => name in form.getValues());
  known.forEach(([name, msgs], i) => form.setError(name as Path<T>, { type: 'server', message: msgs[0] }, { shouldFocus: i === 0 }));
  return known.length > 0;
}
