import { createVaporApp } from 'vue'
import { formPlugin } from 'vael-form'
import { i18n } from 'playground-shared'
import App from './App.vue'

createVaporApp(App).use(formPlugin, { i18n: i18n.global }).mount('#app')
