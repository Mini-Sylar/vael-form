import { isPlainObject } from './path'

function append(data: FormData, name: string, value: unknown): void {
  if (value === null || value === undefined) return
  if (typeof Blob !== 'undefined' && value instanceof Blob) data.append(name, value)
  else if (value instanceof Date) data.append(name, value.toISOString())
  else if (Array.isArray(value))
    value.forEach((item, index) => append(data, `${name}.${index}`, item))
  else if (isPlainObject(value))
    for (const [key, item] of Object.entries(value))
      append(data, name ? `${name}.${key}` : key, item)
  else if (typeof value !== 'object' && typeof value !== 'function')
    data.append(name, String(value))
}

/** The submitted values as multipart: the same names as the inputs, with files as files. */
export function toFormData(values: unknown, submitter?: HTMLElement | null): FormData {
  const data = new FormData()
  append(data, '', values)
  const pressed = submitter as { name?: string; value?: string } | null | undefined
  if (pressed?.name) data.append(pressed.name, pressed.value ?? '')
  return data
}
