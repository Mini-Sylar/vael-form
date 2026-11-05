// @env browser
let down = false
let listening = false
const waiting = new Set<() => void>()

function release(): void {
  down = false
  if (!waiting.size) return
  // After the click this release belongs to: `click` is dispatched right after `pointerup`.
  setTimeout(flush)
}

function flush(): void {
  const run = [...waiting]
  waiting.clear()
  for (const fn of run) fn()
}

/** Listens for the mouse button or finger, once, in the browser. A form calls it as it makes inputs. */
export function trackPointer(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('pointerdown', () => (down = true), true)
  document.addEventListener('pointerup', release, true)
  document.addEventListener('pointercancel', release, true)
  // A release outside the window, or a drag that ends elsewhere, may never say so.
  window.addEventListener('blur', release)
  document.addEventListener('dragend', release, true)
}

/**
 * Runs `fn` now, or when the pointer button held down at this moment is released and its click has
 * been handled. A field that loses focus to a mouse press shows its error, the error moves the
 * button, and the press no longer lands on it: the click is lost. Waiting makes the click first.
 */
export function afterPointer(fn: () => void): void {
  if (down) waiting.add(fn)
  else fn()
}
