// @env browser
const SELECTORS = [':autofill', ':-webkit-autofill']

/**
 * Whether `target` still holds a value its browser filled in. Chrome reveals autofill as a whole
 * interaction (focus, input, change, blur, all in a few milliseconds), so the blur it sends is not
 * the user leaving the field. The state ends as soon as the user types in it.
 */
export function isAutofilled(target: EventTarget | null | undefined): boolean {
  const element = target as { matches?: (selector: string) => boolean } | null | undefined
  if (typeof element?.matches !== 'function') return false
  for (const selector of SELECTORS) {
    try {
      if (element.matches(selector)) return true
    } catch {
      // a browser knows one of the two spellings
    }
  }
  return false
}
