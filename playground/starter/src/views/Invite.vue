<template>
  <h1>Team</h1>
  <div class="card">
    <p>Invite people to your team.</p>
    <button class="primary" @click="store.show()">Invite people</button>
    <p v-if="sent" class="ok">Sent {{ sent }} invite(s)</p>
  </div>

  <dialog ref="dialog" @close="open = false">
    <h2>Invite to {{ team }}</h2>
    <form novalidate @submit="handleSubmit">
      <div class="field">
        <label :for="attrs.team.id">Team</label>
        <input v-model="team" v-bind="attrs.team" />
        <p :id="attrs.team.errorId" class="error">{{ errors.team }}</p>
      </div>
      <p v-if="list.error" class="error">{{ list.error }}</p>
      <div v-for="item in list.items" :key="item.key" class="item">
        <div class="field">
          <label :for="item.field.email.id"
            >Email <span class="hint">(member@example.com is rejected)</span></label
          >
          <input v-model="item.field.email.value" v-bind="item.field.email.attrs" />
          <p :id="item.field.email.errorId" class="error">{{ item.field.email.error }}</p>
        </div>
        <select
          v-model="item.field.role.value"
          v-bind="item.field.role.attrs"
          style="width: auto; margin-top: 1.7rem"
        >
          <option>viewer</option>
          <option>editor</option>
        </select>
        <button
          type="button"
          style="margin-top: 1.7rem"
          :disabled="list.items.length < 2"
          @click="list.remove(item.index)"
        >
          ✕
        </button>
      </div>
      <button type="button" @click="list.push({ email: '', role: 'viewer' })">Add another</button>
      <div class="actions">
        <button class="primary" :disabled="submitting">
          {{ submitting ? 'Sending…' : 'Send invites' }}
        </button>
        <button type="button" @click="open = false">Cancel</button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { nextTick, useTemplateRef, watch } from 'vue'
import { useInvite } from '../stores/invite'

const store = useInvite()
const { open, sent } = storeToRefs(store)
const { form } = store
const { model, errors, attrs, handleSubmit, submitting, field } = form
const { team } = model
const list = field('invites') // rows and list operations
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(open, async (isOpen) => {
  await nextTick()
  if (isOpen) dialog.value?.showModal()
  else dialog.value?.close()
})
</script>
