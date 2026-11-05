// What an app pastes into its own locale files; the library ships no messages.
export const en = {
  formKit: {
    required: '{field} is required',
    invalidType: {
      default: '{field} is not valid',
      string: '{field} must be text',
      number: '{field} must be a number',
      int: '{field} must be a whole number',
      boolean: '{field} must be true or false',
      date: '{field} must be a valid date',
      array: '{field} must be a list',
    },
    tooSmall: {
      default: '{field} is too small (minimum {minimum})',
      string: '{field} must be at least {minimum} characters',
      number: '{field} must be at least {minimum}',
      array: '{field} needs at least {minimum} items',
      date: '{field} must be on or after {minimum}',
    },
    tooBig: {
      default: '{field} is too large (maximum {maximum})',
      string: '{field} must be at most {maximum} characters',
      number: '{field} must be at most {maximum}',
      array: '{field} can have at most {maximum} items',
      date: '{field} must be on or before {maximum}',
    },
    invalidFormat: {
      default: '{field} is not in the right format',
      email: 'Enter a valid email address',
      url: 'Enter a valid URL',
      uuid: '{field} must be a valid UUID',
      regex: '{field} is not in the right format',
      startsWith: '{field} must start with "{prefix}"',
      endsWith: '{field} must end with "{suffix}"',
      includes: '{field} must contain "{includes}"',
    },
    invalidValue: 'Choose one of the available options for {field}',
    notMultipleOf: '{field} must be a multiple of {divisor}',
    invalidUnion: '{field} is not valid',
    unrecognizedKeys: 'Unrecognized fields: {keys}',
    custom: '{field} is not valid',
  },
}

export const fr = {
  formKit: {
    required: '{field} est obligatoire',
    invalidType: { default: '{field} n’est pas valide', number: '{field} doit être un nombre' },
    tooSmall: {
      default: '{field} est trop petit (minimum {minimum})',
      string: '{field} doit contenir au moins {minimum} caractères',
    },
    tooBig: { default: '{field} est trop grand (maximum {maximum})' },
    invalidFormat: {
      default: '{field} n’a pas le bon format',
      email: 'Saisissez une adresse e-mail valide',
    },
    invalidValue: 'Choisissez l’une des options proposées pour {field}',
    custom: '{field} n’est pas valide',
  },
}
