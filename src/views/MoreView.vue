<script setup>
import { useMainStore } from '../stores/mainStore'
const store = useMainStore()
const groups = [
  { title: '記錄與銷售', items: [['history', '回補舊紀錄', '補一筆，或者貼 Excel 成批檢查'], ['retail', '新增交易／出貨', '產品結帳及庫存扣減'], ['inventory', '入貨／補貨', '批量採購及單件入庫'], ['accounting', '收支流水帳', '查閱及新增帳目'], ['movement', '運動套票', '套票及服務']] },
  { title: '管理與分析', items: [['products', '產品管理', '產品資料、售價及成本'], ['dashboard', '報表分析', '完整數據分析'], ['promo', '宣傳記錄', '活動成效'], ['herbalife', '康寶萊獎賞', '業績及獎賞'], ['settings', '設定與資料匯出', '帳戶及備份']] }
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
