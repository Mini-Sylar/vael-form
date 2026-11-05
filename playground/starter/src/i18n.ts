import { createI18n } from 'vue-i18n'

// The app's own catalog: the formKit block from the docs, translated, next to its other messages.
const formKit = {
  en: {
    required: '{field} is required',
    invalidType: { default: '{field} is not valid', number: '{field} must be a number' },
    tooSmall: {
      default: '{field} is too small (minimum {minimum})',
      string: '{field} must be at least {minimum} characters',
      number: '{field} must be at least {minimum}',
      array: '{field} needs at least {minimum} items',
    },
    tooBig: {
      default: '{field} is too large (maximum {maximum})',
      string: '{field} must be at most {maximum} characters',
      number: '{field} must be at most {maximum}',
      array: '{field} can have at most {maximum} items',
    },
    invalidFormat: {
      default: '{field} is not in the right format',
      email: 'Enter a valid email address',
      regex: '{field} is not in the right format',
    },
    invalidValue: 'Choose one of the available options for {field}',
    invalidUnion: '{field} is not valid',
    custom: '{field} is not valid',
  },
  fr: {
    required: '{field} est obligatoire',
    invalidType: { default: '{field} n’est pas valide', number: '{field} doit être un nombre' },
    tooSmall: {
      default: '{field} est trop petit (minimum {minimum})',
      string: '{field} doit contenir au moins {minimum} caractères',
      number: '{field} doit être au moins {minimum}',
      array: '{field} demande au moins {minimum} éléments',
    },
    tooBig: {
      default: '{field} est trop grand (maximum {maximum})',
      string: '{field} doit contenir au plus {maximum} caractères',
      number: '{field} doit être au plus {maximum}',
      array: '{field} accepte au plus {maximum} éléments',
    },
    invalidFormat: {
      default: '{field} n’a pas le bon format',
      email: 'Saisissez une adresse e-mail valide',
      regex: '{field} n’a pas le bon format',
    },
    invalidValue: 'Choisissez une option pour {field}',
    invalidUnion: '{field} n’est pas valide',
    custom: '{field} n’est pas valide',
  },
}

const labels = {
  en: { username: 'Username', email: 'Email', password: 'Password', confirm: 'Confirmation' },
  fr: {
    username: 'Identifiant',
    email: 'E-mail',
    password: 'Mot de passe',
    confirm: 'Confirmation',
  },
}

const errors = {
  en: {
    taken: 'That username is taken',
    terms: 'Accept the terms to continue',
    promo: 'Unknown code',
  },
  fr: {
    taken: 'Cet identifiant est pris',
    terms: 'Acceptez les conditions',
    promo: 'Code inconnu',
  },
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: { formKit: formKit.en, labels: labels.en, errors: errors.en },
    fr: { formKit: formKit.fr, labels: labels.fr, errors: errors.fr },
  },
})
