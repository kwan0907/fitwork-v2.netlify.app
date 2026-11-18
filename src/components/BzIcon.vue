<script setup>
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 24 } })
const paths = {
  home: ['m3 10 9-7 9 7v10H3V10Z', 'M9 21v-7h6v7'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87'],
  userPlus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M20 8v6m-3-3h6'],
  box: ['m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10'],
  chart: ['M3 21h18M6 18v-5h3v5M11 18V8h3v10M16 18V4h3v14'],
  receipt: ['M5 3h14v18l-3-2-4 2-4-2-3 2V3Z', 'M8 8h8M8 12h8M8 16h5'],
  cart: ['M2 3h2l2.4 11.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L22 6H5'],
  wallet: ['M2 5h20v15H2z', 'M2 9h20M16 15h3'],
  calendar: ['M3 5h18v16H3z', 'M7 3v4M17 3v4M3 10h18'],
  user: ['M4 21v-2a8 8 0 0 1 16 0v2'],
  bag: ['M4 8h16l-1 13H5L4 8ZM9 9V6a3 3 0 0 1 6 0v3'],
  coins: ['M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5', 'M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3M5 15c0 1.7 3.1 3 7 3s7-1.3 7-3'],
  search: ['m16.5 16.5 5 5'],
  chevronRight: ['m9 5 7 7-7 7'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  plus: ['M12 5v14M5 12h14']
}
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(d, i) in paths[name] || []" :key="i" :d="d" />
    <circle v-if="name === 'search'" cx="11" cy="11" r="7" />
    <circle v-if="name === 'users' || name === 'userPlus'" cx="9" cy="7" r="4" />
    <circle v-if="name === 'user'" cx="12" cy="8" r="4" />
    <circle v-if="name === 'cart'" cx="10" cy="20" r="1" />
    <circle v-if="name === 'cart'" cx="18" cy="20" r="1" />
    <ellipse v-if="name === 'coins'" cx="12" cy="5" rx="7" ry="3" />
  </svg>
</template>
