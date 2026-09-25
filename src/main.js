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
import './styles/client-modal-mobile-fix.css'
import { useMainStore } from './stores/mainStore'
import { installQuickActions } from './quickActions'
import { installInitialLoading } from './initialLoading'
import { installPurchaseImportV3 } from './purchaseImportV3'
import { installSubmitGuard } from './submitGuard'
import { installClientModalMobileFix } from './clientModalMobileFix'
import { installInventoryOrderImportV2 } from './inventoryOrderImportV2'
import { installInventoryPhotoUploadFix } from './inventoryPhotoUploadFix'
import { installStocktakeImport } from './stocktakeImport'
import { installStocktakeMobileUXFix } from './stocktakeMobileUXFix'
import { installClientSmartPasteV2 } from './clientSmartPasteV2'
import { installTrialFollowUp } from './trialFollowUp'
import { installTrialFollowUpEnhance } from './trialFollowUpEnhance'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

const store = useMainStore(pinia)
installQuickActions(store)
installInitialLoading(store)
installPurchaseImportV3(store)
installSubmitGuard()
installClientModalMobileFix()
installInventoryOrderImportV2(store)
installInventoryPhotoUploadFix()
installStocktakeImport(store)
installStocktakeMobileUXFix()
installClientSmartPasteV2()
installTrialFollowUp(store)
installTrialFollowUpEnhance(store)
