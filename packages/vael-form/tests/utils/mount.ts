import { createApp, createVaporApp, h, vaporInteropPlugin } from 'vue'
import type { App, Component } from 'vue'
import { inject } from 'vitest'

export type Mode = 'vdom' | 'vapor' | 'interop'

declare module 'vitest' {
  interface ProvidedContext {
    mode: Mode
  }
}

export interface Mounted {
  host: HTMLElement
  app: App
  unmount: () => void
}

// A Vapor root takes its props as getters; a function value passed as is would be called as one.
const getters = (props?: Record<string, unknown>) =>
  props && Object.fromEntries(Object.entries(props).map(([key, value]) => [key, () => value]))

/** Mounts `component` the way the current project does: VDOM, pure Vapor, or Vapor in a VDOM app. */
export function mount(
  component: Component,
  props?: Record<string, unknown>,
  setup?: (app: App) => void,
): Mounted {
  const mode = inject('mode')
  const host = document.createElement('div')
  document.body.append(host)

  const app = (
    mode === 'vapor'
      ? createVaporApp(component as Parameters<typeof createVaporApp>[0], getters(props))
      : // Vapor components can't be the root of a VDOM app, but a VDOM parent can render one.
        createApp(mode === 'interop' ? { render: () => h(component, props) } : component, props)
  ) as App
  if (mode === 'interop') app.use(vaporInteropPlugin)
  setup?.(app)
  app.mount(host)

  return {
    host,
    app,
    unmount() {
      app.unmount()
      host.remove()
    },
  }
}
