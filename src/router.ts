import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('./pages/HomePage.vue') },
  { path: '/bill', component: () => import('./pages/BillPage.vue') },
  { path: '/scan', component: () => import('./pages/ScanPage.vue') },
  { path: '/review', component: () => import('./pages/ReviewPage.vue') },
  { path: '/results', component: () => import('./pages/ResultsPage.vue') },
  { path: '/s/:code/:pid?', component: () => import('./pages/FriendPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
