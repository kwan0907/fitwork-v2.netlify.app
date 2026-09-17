import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import './app-polish-round2.css'
import './styles/clients-mobile.css'
import './styles/operations-mobile.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')