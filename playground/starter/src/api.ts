// A pretend server: slow, and sometimes says no.
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(timer), resolve()))
  })

export interface User {
  name: string
  email: string
  bio: string
  birthday: string
  newsletter: boolean
  interests: ('maths' | 'music' | 'code' | 'chess')[]
  theme: 'light' | 'dark' | 'auto'
  timezone: string
  notify: { email: boolean; sms: boolean }
}

let saved: User = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  bio: 'First programmer.',
  birthday: '1815-12-10',
  newsletter: true,
  interests: ['maths'],
  theme: 'auto',
  timezone: 'Europe/London',
  notify: { email: true, sms: false },
}

export const taken = ['ada', 'grace', 'admin']

export const api = {
  async usernameTaken(name: string, signal?: AbortSignal) {
    await wait(350, signal)
    return taken.includes(name.toLowerCase())
  },
  async promoValid(code: string, signal?: AbortSignal) {
    await wait(300, signal)
    return code === 'SAVE10'
  },
  async signUp(body: { email: string; username: string }) {
    await wait(500)
    if (body.email === 'taken@example.com') throw new Error('email')
    return { id: 1 }
  },
  async loadUser(): Promise<User> {
    await wait(700)
    return structuredClone(saved)
  },
  async saveUser(body: FormData): Promise<User> {
    await wait(500)
    const entries = [...body.entries()].map(([key, value]) => [
      key,
      value instanceof File ? `File(${value.name})` : value,
    ])
    api.lastRequest = Object.fromEntries(entries)
    saved = { ...saved, name: String(body.get('name')), email: String(body.get('email')) }
    return structuredClone(saved)
  },
  async book(body: unknown) {
    await wait(600)
    api.lastRequest = body
    return { reference: 'TRP-2041' }
  },
  async invite(emails: string[]) {
    await wait(400)
    const dupe = emails.findIndex((email) => email === 'member@example.com')
    return dupe === -1 ? { ok: true as const } : { ok: false as const, index: dupe }
  },
  lastRequest: undefined as unknown,
}
