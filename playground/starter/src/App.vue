<template>
  <main>
    <nav>
      <button
        v-for="(_, name) in views"
        :key="name"
        :aria-current="view === name ? 'page' : undefined"
        @click="go(name)"
      >
        {{ name }}
      </button>
      <button style="margin-left: auto" @click="locale = locale === 'en' ? 'fr' : 'en'">
        {{ locale }}
      </button>
      <span class="hint" style="align-self: center">{{ mode }}</span>
    </nav>
    <KeepAlive><component :is="views[view]" /></KeepAlive>
  </main>
</template>

<script setup lang="ts">
import { KeepAlive, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import Booking from './views/Booking.vue'
import Contact from './views/Contact.vue'
import Invite from './views/Invite.vue'
import Profile from './views/Profile.vue'
import SignUp from './views/SignUp.vue'
import Vael from './views/Vael.vue'
import Watch from './views/Watch.vue'

const views = {
  signup: SignUp,
  profile: Profile,
  booking: Booking,
  contact: Contact,
  team: Invite,
  watch: Watch,
  vael: Vael,
}
type View = keyof typeof views

const saved = (() => {
  try {
    return localStorage.getItem('view') as View | null
  } catch {
    return null
  }
})()
const view = shallowRef<View>(saved && saved in views ? saved : 'signup')
const { locale } = useI18n()
const mode = __MODE__

function go(next: View) {
  view.value = next
  try {
    localStorage.setItem('view', next)
  } catch {}
}
</script>
