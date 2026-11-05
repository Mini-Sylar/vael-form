import { createI18n } from 'vue-i18n'
import { z } from 'zod'
import { msg } from 'vael-form'
// The app's own catalog: the formKit block from the docs, translated, next to its other messages.
const messages = {
  en: {
    formKit: {
      required: '{field} is required',
      tooSmall: {
        default: '{field} is too small (minimum {minimum})',
        string: '{field} must be at least {minimum} characters',
      },
      invalidFormat: {
        default: '{field} is not in the right format',
        email: 'Enter a valid email address',
      },
    },
    errors: { members: 'Add at least one member', taken: 'That email is already registered' },
    labels: { email: 'Email', password: 'Password' },
  },
  fr: {
    formKit: {
      required: '{field} est obligatoire',
      tooSmall: {
        default: '{field} est trop petit (minimum {minimum})',
        string: '{field} doit contenir au moins {minimum} caractères',
      },
      invalidFormat: {
        default: '{field} n’a pas le bon format',
        email: 'Saisissez une adresse e-mail valide',
      },
    },
    errors: {
      members: 'Ajoutez au moins un membre',
      taken: 'Cette adresse e-mail est déjà utilisée',
    },
    labels: { email: 'E-mail', password: 'Mot de passe' },
  },
}

export const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages })

export const schema = z.object({
  email: z.email(),
  password: z.string().min(8),
  // a rule that is not a Zod default keeps its own key
  members: z.array(z.object({ name: z.string().min(1) })).min(1, msg('errors.members')),
})

export const labels = { email: 'labels.email', password: 'labels.password' }

// What a schema shouldn't hold: a call to a server. Try taken@example.com.
export const rules = {
  email: async (email: string, { signal }: { signal: AbortSignal }) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    return signal.aborted || email !== 'taken@example.com' ? undefined : msg('errors.taken')
  },
}
