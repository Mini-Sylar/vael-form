// Mounts and unmounts a busy form many times; the page driver measures what is left behind.
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { z } from 'zod'
import { formPlugin, useForm } from 'vael-form'
import { i18n } from './i18n'

const schema = z.object({
  name: z.string().min(3),
  email: z.email(),
  members: z.array(z.object({ name: z.string().min(1) })).min(1),
})

let variant = 'full'

const Plain = defineComponent({
  setup() {
    const name = ref('')
    const members = ref([{ name: '' }])
    return () =>
      h('form', { onSubmit: (e: Event) => e.preventDefault() }, [
        h('input', {
          value: name.value,
          onInput: (e: Event) => (name.value = (e.target as HTMLInputElement).value),
        }),
        h('p', name.value.length < 3 ? 'short' : ''),
        h('input'),
        ...members.value.map((m, i) => h('input', { key: i, value: m.name })),
        h('button', { onClick: () => members.value.push({ name: '' }) }, 'add'),
      ])
  },
})

const Busy = defineComponent({
  setup() {
    const form = useForm({
      schema,
      defaultValues: { name: '', email: '', members: [{ name: '' }] },
      debounce: 20,
      rules: variant.includes('norules')
        ? undefined
        : {
            name: async (value: string, { signal }: { signal: AbortSignal }) =>
              signal.aborted ? undefined : value === 'taken' ? 'Taken' : undefined,
          },
      onSubmit: () => undefined,
    })
    const { model, attrs, errors, field } = form
    const { name, email, members } = model
    if (!variant.includes('nowatch')) {
      name.watch(() => undefined, { debounce: 10 })
      members.watch(() => undefined)
    }
    const list = field('members')
    return () =>
      h('form', { onSubmit: form.handleSubmit }, [
        h('input', {
          ...attrs.name,
          value: name.value,
          onInput: (e: Event) => (name.value = (e.target as HTMLInputElement).value),
        }),
        h('p', errors.name),
        h('input', { ...attrs.email, value: email.value }),
        h('p', errors.email),
        ...list.items.map((item) =>
          h('input', { key: item.key, ...item.field.name.attrs, value: item.field.name.value }),
        ),
        h('button', { onClick: () => list.push({ name: '' }) }, 'add'),
        h('p', String(form.valid.value) + form.errorList.value.length),
      ])
  },
})

const host = document.getElementById('host')!

// One app, as in a real page: the form component comes and goes inside it.
const show = ref(false)
const Root = defineComponent({
  render: () => (show.value ? h(variant.startsWith('plain') ? Plain : Busy) : null),
})
let started = false

function start(): void {
  const app = createApp(Root)
  if (variant.includes('i18n') || variant.includes('full')) app.use(i18n)
  if (variant.includes('plugin') || variant.includes('full'))
    app.use(formPlugin, { i18n: i18n.global })
  app.mount(host)
  started = true
}

async function cycle(): Promise<void> {
  if (!started) start()
  show.value = true
  await nextTick()
  const form = host.querySelector('form')!
  const input = host.querySelectorAll('input')[0] as HTMLInputElement
  input.focus()
  input.value = 'ab'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.blur()
  host.querySelector('button')!.click()
  host.querySelector('button')!.click()
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  show.value = false
  await nextTick()
}

;(window as unknown as { __cycle: (n: number, v?: string) => Promise<void> }).__cycle = async (
  n,
  v = 'full',
) => {
  variant = v
  for (let i = 0; i < n; i++) await cycle()
}
document.title = 'ready'
