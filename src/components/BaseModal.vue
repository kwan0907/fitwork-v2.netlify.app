<script setup>
defineProps(['show', 'title'])
defineEmits(['close'])
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="modal-mask" @click.self="$emit('close')">
      <div class="modal-container">
        <div class="modal-header">
          <h3>{{ title }}</h3>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
        <div class="modal-body">
          <slot></slot> 
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 💡 核心修復：加入全螢幕遮罩與置中對齊 */
.modal-mask {
  position: fixed;
  z-index: 9999;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px); /* 背景毛玻璃效果 */
  display: flex;
  justify-content: center;
  align-items: center; /* 讓卡片完美垂直置中 */
}

.modal-container { 
  background: #fff; 
  width: 92%; 
  max-width: 420px; 
  border-radius: 28px; 
  padding: 24px; 
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3);
  /* 確保彈窗內容太多時可以滾動，不會超出螢幕 */
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-header h3 { font-size: 20px; font-weight: 900; margin: 0; color: #1e293b; }

.close-btn {
  background: #f1f5f9; border: none; width: 32px; height: 32px;
  border-radius: 50%; font-size: 14px; font-weight: 900;
  color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center;
}

.modal-body {
  overflow-y: auto; /* 內部滾動 */
  padding-right: 5px; 
}

/* 讓彈窗內的內容有呼吸感 */
:deep(.form-item) { margin-bottom: 18px; }
:deep(label) { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #475569; }

/* 漂亮的彈出動畫 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.fade-enter-active .modal-container { animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes popIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>