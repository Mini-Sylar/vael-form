import { createVaporApp, vaporInteropPlugin } from 'vue'
import { formPlugin } from 'vael-form'
import { i18n } from 'playground-shared'
import App from './App.vue'

const app = createVaporApp(App)
app.use(vaporInteropPlugin)
app.use(formPlugin, { i18n: i18n.global })
app.mount('#app')
