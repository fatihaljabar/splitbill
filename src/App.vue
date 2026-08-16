<script setup lang="ts">
import AppLayout from './components/AppLayout.vue';
import Toast from './components/ui/Toast.vue';
</script>

<template>
  <router-view v-slot="{ Component, route }">
    <AppLayout>
      <component :is="Component" :key="route.path" />
    </AppLayout>
  </router-view>
  <Toast />
</template>
