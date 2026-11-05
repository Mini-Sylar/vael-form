import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { z } from 'zod'
import { useForm } from 'vael-form'
import { api } from '../api'

const schema = z.object({
  team: z.string().min(2),
  invites: z.array(z.object({ email: z.email(), role: z.enum(['viewer', 'editor']) })).min(1),
})

// The form lives in a store, so the dialog and the page share it.
export const useInvite = defineStore('invite', () => {
  const open = shallowRef(false)
  const sent = shallowRef(0)

  const form = useForm({
    schema,
    id: 'invite',
    defaultValues: { team: 'Core', invites: [{ email: '', role: 'viewer' }] },
    onSubmit: async (values, { form }) => {
      const result = await api.invite(values.invites.map((invite) => invite.email))
      if (!result.ok) {
        form.setErrors({ [`invites.${result.index}.email`]: 'Already a member' })
        return
      }
      sent.value = values.invites.length
      open.value = false
    },
  })

  function show() {
    form.reset({ team: 'Core', invites: [{ email: '', role: 'viewer' }] })
    open.value = true
  }

  return { form, open, sent, show }
})
