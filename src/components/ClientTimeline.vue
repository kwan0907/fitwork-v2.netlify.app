<script setup>
import { computed } from 'vue'
import { buildClientTimeline } from '../clientTimeline.js'

const props = defineProps({ client: Object, clients: Array, transactions: Array, incomplete: Boolean })
const timeline = computed(() => buildClientTimeline(props.client, props.transactions, props.clients))
</script>

<template>
  <details class="bz-client-timeline">
    <summary><span>客戶時間線 <small>已連結 {{ timeline.confirmed.length }} · 同名待核對 {{ timeline.possible.length }}</small></span><span aria-hidden="true">⌄</span></summary>
    <div class="timeline-body">
      <p v-if="incomplete" class="timeline-alert">舊交易仍在讀取，以下時間線可能未齊。</p>
      <p v-if="!timeline.confirmed.length" class="timeline-empty">暫時冇已連結事件。可以先記錄試堂或續卡。</p>
      <ol v-else><li v-for="item in timeline.confirmed" :key="item.key">
        <time>{{ item.day || '日期未明' }}</time><div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p><small>{{ item.source }}{{ item.imported ? ' · 舊紀錄回補' : '' }}</small></div>
      </li></ol>
      <section v-if="timeline.possible.length" class="timeline-possible">
        <h3>同名舊帳目 · 未連結客戶檔案</h3>
        <p>只列作核對線索，唔會用佢自動改加入日期、身份或點數。</p>
        <ol><li v-for="item in timeline.possible" :key="item.key"><time>{{ item.day || '日期未明' }}</time><div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div></li></ol>
      </section>
    </div>
  </details>
</template>

<style scoped>
.bz-client-timeline { margin:14px 0 2px; border:1px solid #e7d7c8; border-radius:15px; background:#fffaf5; color:#45382e; overflow:hidden; }
.bz-client-timeline summary { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:13px; cursor:pointer; list-style:none; font-size:14px; font-weight:800; }
.bz-client-timeline summary::-webkit-details-marker { display:none; }
.bz-client-timeline summary small { display:block; margin-top:3px; color:#817368; font-size:11px; font-weight:600; }
.bz-client-timeline[open] summary { border-bottom:1px solid #eaded2; }
.timeline-body { max-height:310px; overflow:auto; padding:8px 13px 13px; }
.timeline-body ol { margin:0; padding:0; list-style:none; }
.timeline-body li { display:grid; grid-template-columns:85px 1fr; gap:9px; padding:10px 0; border-bottom:1px solid #efe5da; }
.timeline-body li:last-child { border-bottom:0; }
.timeline-body time { color:#a56242; font-size:11px; font-weight:800; }
.timeline-body strong { font-size:12px; }.timeline-body p { margin:3px 0; color:#6d6055; font-size:11px; line-height:1.45; }.timeline-body small { color:#8c7c6f; font-size:10px; }
.timeline-alert,.timeline-empty { padding:7px 0; }.timeline-alert { color:#965c32 !important; }
.timeline-possible { margin-top:10px; padding:10px; border-radius:11px; background:#fbf2df; }.timeline-possible h3 { margin:0; font-size:12px; }.timeline-possible li { grid-template-columns:75px 1fr; }
@media(max-width:350px) { .timeline-body li { grid-template-columns:72px 1fr; } }
</style>
