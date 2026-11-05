import { createApp, createVaporApp } from 'vue'
import { createPinia } from 'pinia'
import { formPlugin } from 'vael-form'
import App from './App.vue'
import { i18n } from './i18n'
import 'vael-ui/style.css'
import './style.css'

function install(app: ReturnType<typeof createApp>) {
  app.use(i18n)
  app.use(createPinia())
  app.use(formPlugin, { i18n: i18n.global })
  app.mount('#app')
}

// The Vapor app takes the same plugins; only its component type differs.
if (__MODE__ === 'vapor') install(createVaporApp(App as never) as never)
else install(createApp(App))
