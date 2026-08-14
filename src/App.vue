<script setup lang="ts">
import { useApp } from './composables/useApp.ts';

const { state, setLang, setTheme, tr } = useApp();
</script>

<template>
  <div class="min-h-dvh min-h-svh w-full bg-[#FAFAF9] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
    <!-- Header lengkap menyusul tugas 10 (AppLayout). Tombol ini sementara,
         cuma buat buktikan tema + bahasa jalan sebelum halaman sungguhan ada. -->
    <div class="flex items-center gap-2 p-4">
      <button type="button" @click="setLang(state.lang === 'id' ? 'en' : 'id')">
        {{ state.lang.toUpperCase() }}
      </button>
      <button type="button" @click="setTheme(state.theme === 'light' ? 'dark' : 'light')">
        {{ state.theme }}
      </button>
      <span>{{ tr('appName') }}</span>
    </div>
    <router-view />
  </div>
</template>
