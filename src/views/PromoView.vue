<script setup>
import { ref } from 'vue'

const history = ref([
  { id: 1, loc: 'rest', date: '21/4/2026', time: '下午03:11 至 下午03:11', duration: '0 分鐘', flyers: 10, trials: 0 }
])
</script>

<template>
  <div class="page">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h2 class="page-title" style="margin:0;">宣傳打卡系統</h2>
      <button style="background:var(--p); color:white; border:none; padding:8px 16px; border-radius:20px; font-weight:800;">+ 新增紀錄</button>
    </div>

    <div style="font-size:14px; font-weight:800; color:var(--t2); margin-bottom:10px;">📊 宣傳轉換漏斗 (歷史累計)</div>
    <div class="card" style="padding:10px 20px; margin-bottom:25px;">
      <div class="funnel-row"><span>📄 派發傳單總數</span><span class="val">10 張</span></div>
      <div class="funnel-row"><span>📱 獲得電話數</span><span class="val" style="color:var(--p);">0 個</span></div>
      <div class="funnel-row"><span>💬 產生查詢數</span><span class="val" style="color:#d97706;">0 次</span></div>
      <div class="funnel-row"><span>🏃 成功試堂數</span><span class="val" style="color:var(--p);">0 人</span></div>
      <div class="funnel-row final"><span>⭐ 最終轉化為正式客戶</span><span class="val">0 人</span></div>
    </div>

    <div style="font-size:14px; font-weight:800; color:var(--t2); margin-bottom:10px;">📝 近期宣傳紀錄</div>
    <div v-for="h in history" :key="h.id" class="card" style="padding:15px; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between;">
        <div style="font-weight:900; color:var(--p); font-size:15px;">📍 {{ h.loc }}</div>
        <div style="cursor:pointer; opacity:0.5;">🗑️</div>
      </div>
      <div style="font-size:11px; font-weight:700; color:var(--t3); margin:6px 0 12px;">
        📅 {{ h.date }} · {{ h.time }}<br>
        歷時 {{ h.duration }}
      </div>
      <div style="display:flex; gap:10px;">
        <div class="badge-blue">傳單: {{ h.flyers }}</div>
        <div class="badge-outline">試堂: {{ h.trials }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.funnel-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 800; color: var(--t2); }
.funnel-row.final { border-bottom: none; color: #16a34a; }
.funnel-row .val { font-weight: 900; font-size: 14px; color: var(--t); }

.badge-blue { background: #eef2ff; color: var(--p); padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; }
.badge-outline { border: 1px solid var(--border); color: var(--t3); padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; }
</style>