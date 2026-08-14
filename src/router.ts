import { h } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

// Placeholder sampai tugas 12-15 (halaman sungguhan). Membuktikan routing,
// mode history, dan parameter rute (:code) bekerja tanpa file sekali-pakai.
// h() dipakai, bukan `template:` string — build Vite pakai Vue runtime-only,
// yang tidak menyertakan compiler untuk template string di waktu jalan.
const Placeholder = {
  props: { name: { type: String, default: '' } },
  render(this: { name: string }) {
    return h('div', { style: 'padding:2rem' }, this.name);
  },
};

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('./pages/HomePage.vue') },
  { path: '/bill', component: Placeholder, props: { name: 'BillPage' } },
  { path: '/scan', component: Placeholder, props: { name: 'ScanPage' } },
  { path: '/review', component: () => import('./pages/ReviewPage.vue') },
  { path: '/results', component: Placeholder, props: { name: 'ResultsPage' } },
  {
    path: '/s/:code',
    component: Placeholder,
    props: (route) => ({ name: `FriendPage ${route.params.code}` }),
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
