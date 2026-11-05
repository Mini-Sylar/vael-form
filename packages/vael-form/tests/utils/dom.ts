import { nextTick } from 'vue'

export const $ = <T extends HTMLElement = HTMLElement>(host: ParentNode, name: string): T | null =>
  host.querySelector<T>(`[data-test="${name}"]`)

export const text = (host: ParentNode, name: string): string | undefined =>
  $(host, name)?.textContent?.trim()

/** Waits for Vue to render, and for a promise or two that the render waits on. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await nextTick()
    await Promise.resolve()
  }
}

export async function type(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
}

export async function blur(input: HTMLElement): Promise<void> {
  input.dispatchEvent(new FocusEvent('blur'))
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await flush()
}
