<script setup>
import { useMainStore } from '../stores/mainStore'
const store = useMainStore()
const groups = [
  { title: '銷售與客戶', items: [['retail', '零售收銀', '產品結帳'], ['movement', '運動套票', '套票及服務'], ['promo', '宣傳記錄', '活動成效']] },
  { title: '管理工具', items: [['dashboard', '詳細報表', '完整數據分析'], ['herbalife', '康寶萊獎賞', '業績及獎賞'], ['settings', '設定與資料匯出', '帳戶及備份']] }
]
</script>
<template>
  <div class="bz-more">
    <header><small>所有功能</small><h1>更多工具</h1><p>常用功能已放喺底部，其餘工具喺呢度。</p></header>
    <section v-for="group in groups" :key="group.title" class="bz-more-group">
      <h2>{{ group.title }}</h2>
      <button v-for="[view, label, description] in group.items" :key="view" type="button" @click="store.view=view"><span><b>{{ label }}</b><small>{{ description }}</small></span><strong>→</strong></button>
    </section>
  </div>
</template>
