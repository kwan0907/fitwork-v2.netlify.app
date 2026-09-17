import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import './app-polish-round2.css'
import './styles/clients-mobile.css'
import './styles/operations-mobile.css'
import './styles/remaining-pages-mobile.css'
import './styles/quick-actions.css'
import './styles/retail-checkout-fix.css'
import './styles/mobile-touch-safety.css'
import './styles/initial-loading.css'
import './styles/purchase-import.css'
import './styles/purchase-import-v2.css'
import { useMainStore } from './stores/mainStore'
import { installQuickActions } from './quickActions'
import { installInitialLoading } from './initialLoading'
import { installPurchaseImportV2 } from './purchaseImportV2'
import { installPurchaseImportCompat } from './purchaseImportCompat'
import { installSubmitGuard } from './submitGuard'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

const store = useMainStore(pinia)
installQuickActions(store)
installInitialLoading(store)
installPurchaseImportCompat()
installPurchaseImportV2(store)
installSubmitGuard()