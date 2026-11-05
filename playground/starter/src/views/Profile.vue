<template>
  <h1>Profile <span v-if="dirty" class="badge">unsaved changes</span></h1>
  <p v-if="!user" class="hint">Loading…</p>
  <form novalidate @submit="handleSubmit">
    <div class="row">
      <TextField :field="field('name')" label="Name" />
      <TextField :field="field('email')" label="Email" type="email" />
    </div>
    <div class="field">
      <label :for="attrs.bio.id"
        >Bio <span class="hint">{{ left }} left</span></label
      >
      <textarea v-model="bio" rows="3" v-bind="attrs.bio"></textarea>
      <p :id="attrs.bio.errorId" class="error">{{ errors.bio }}</p>
    </div>
    <div class="row">
      <div class="field">
        <label :for="attrs.birthday.id">Birthday</label>
        <input v-model="birthday" type="date" v-bind="attrs.birthday" />
        <p :id="attrs.birthday.errorId" class="error">{{ errors.birthday }}</p>
      </div>
      <div class="field">
        <label :for="attrs.timezone.id">Timezone</label>
        <select v-model="timezone" v-bind="attrs.timezone">
          <option value="">Choose…</option>
          <option>Europe/London</option>
          <option>Africa/Accra</option>
          <option>America/New_York</option>
        </select>
        <p :id="attrs.timezone.errorId" class="error">{{ errors.timezone }}</p>
      </div>
    </div>
    <div class="field">
      <label :for="attrs.avatar.id">Avatar</label>
      <input
        :id="attrs.avatar.id"
        type="file"
        accept="image/*"
        @change="avatar = ($event.target as HTMLInputElement).files?.[0]"
      />
      <p class="hint">{{ avatar ? avatar.name : 'None' }}</p>
    </div>
    <div class="label">Interests</div>
    <fieldset class="choices" v-bind="attrs.interests">
      <label v-for="topic in topics" :key="topic">
        <input v-model="interests" type="checkbox" :value="topic" />
        {{ topic }}
      </label>
    </fieldset>
    <p :id="attrs.interests.errorId" class="error">{{ errors.interests }}</p>
    <div class="label">Theme</div>
    <fieldset class="choices" v-bind="attrs.theme">
      <label v-for="option in ['light', 'dark', 'auto']" :key="option">
        <input v-model="theme" type="radio" :value="option" name="theme" /> {{ option }}
      </label>
    </fieldset>
    <div class="label">Notifications</div>
    <div class="choices">
      <label
        ><input v-model="notify.email" type="checkbox" v-bind="attrs.notify.email" /> Email</label
      >
      <label><input v-model="notify.sms" type="checkbox" v-bind="attrs.notify.sms" /> SMS</label>
      <label
        ><input v-model="newsletter" type="checkbox" v-bind="attrs.newsletter" /> Newsletter</label
      >
    </div>
    <div class="actions">
      <button class="primary" :disabled="!user || submitting || !dirty">
        {{ submitting ? 'Saving…' : 'Save' }}
      </button>
      <button type="button" :disabled="!dirty" @click="reset()">Discard</button>
    </div>
    <template v-if="sent">
      <h2>Last request (multipart)</h2>
      <pre class="debug">{{ JSON.stringify(sent, null, 2) }}</pre>
    </template>
  </form>
</template>

<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { z } from 'zod'
import { useForm } from 'vael-form'
import { api } from '../api'
import type { User } from '../api'
import TextField from '../components/TextField.vue'

const schema = z.object({
  name: z.string().trim().min(2),
  email: z.email(),
  bio: z.string().max(160),
  birthday: z.string().min(1),
  avatar: z.instanceof(File).optional(),
  newsletter: z.boolean(),
  interests: z.array(z.enum(['maths', 'music', 'code', 'chess'])).min(1),
  theme: z.enum(['light', 'dark', 'auto']),
  timezone: z.string().min(1),
  notify: z.object({ email: z.boolean(), sms: z.boolean() }),
})

const user = shallowRef<User>()
onMounted(async () => (user.value = await api.loadUser()))

const sent = shallowRef<unknown>()

const { model, errors, attrs, field, handleSubmit, reset, dirty, submitting } = useForm({
  schema,
  defaultValues: user,
  onSubmit: async (values, { formData, form }) => {
    const saved = await api.saveUser(formData)
    sent.value = api.lastRequest
    form.reset({ ...values, ...saved })
  },
})
const { bio, birthday, avatar, newsletter, interests, theme, timezone, notify } = model
const topics = ['maths', 'music', 'code', 'chess'] as const
const left = computed(() => 160 - (bio.value?.length ?? 0))
</script>
