import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'

export const zodSignup = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(8, 'Too short'),
})

export const valibotSignup = v.object({
  email: v.pipe(v.string(), v.email('Invalid email')),
  password: v.pipe(v.string(), v.minLength(8, 'Too short')),
})

export const arkSignup = type({
  email: type('string.email').configure({ message: 'Invalid email' }),
  password: type('string >= 8').configure({ message: 'Too short' }),
})

export const signupSchemas = {
  zod: zodSignup,
  valibot: valibotSignup,
  arktype: arkSignup,
} as const
