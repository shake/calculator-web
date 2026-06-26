import { createRouter, createWebHistory } from 'vue-router';
import CalculatorPage from './pages/Calculator.page.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'calculator',
      component: CalculatorPage,
      alias: ['/calculator'],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

export default router;
