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
          <slot></slot> </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-container { 
  background: #fff; width: 92%; max-width: 420px; 
  border-radius: 28px; padding: 24px; 
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
}
.modal-header h3 { font-size: 20px; font-weight: 900; margin: 0; }
/* 讓彈窗內的內容有呼吸感 */
:deep(.form-item) { margin-bottom: 18px; }
:deep(label) { display: block; margin-bottom: 8px; font-weight: 700; font-size: 14px; color: var(--t2); }
</style>