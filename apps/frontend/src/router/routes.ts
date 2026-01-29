import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/lock',
    component: () => import('pages/LockPage.vue'),
  },
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/IndexPage.vue') },
      { path: 'role-selection', component: () => import('pages/RoleSelectionPage.vue') },
      {
        path: 'dashboard',
        component: () => import('pages/DashboardPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'profile',
        component: () => import('pages/ProfilePage.vue'),
        meta: { requiresAuth: true },
      },
      { path: 'theme', component: () => import('pages/ThemeShowcasePage.vue') },
      { path: 'about', component: () => import('pages/AboutPage.vue') },
    ],
  },

  // Always leave this as last one, but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
