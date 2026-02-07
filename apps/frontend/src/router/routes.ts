import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/IndexPage.vue') },
      {
        path: 'dashboard',
        component: () => import('pages/DashboardPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'members',
        component: () => import('pages/MembersPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'areas',
        component: () => import('pages/AreasPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'areas/create',
        component: () => import('pages/EditAreaPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'areas/:id/edit',
        component: () => import('pages/EditAreaPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'equipment',
        component: () => import('pages/EquipmentPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'equipment/create',
        component: () => import('pages/EditEquipmentPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'equipment/:id/edit',
        component: () => import('pages/EditEquipmentPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'members/:id/edit',
        component: () => import('pages/EditMemberPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'ausstattung',
        component: () => import('pages/AusstattungsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'audit-logs',
        component: () => import('pages/AuditLogsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'profile',
        redirect: () => {
          const memberId = localStorage.getItem('memberId');
          return memberId ? `/members/${memberId}/edit?source=profile` : '/';
        },
        meta: { requiresAuth: true },
      },
      { path: 'theme', component: () => import('pages/ThemeShowcasePage.vue') },
    ],
  },

  // Always leave this as last one, but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
