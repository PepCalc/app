import {
  createRouter,
  createWebHashHistory,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'calculator',
    component: () => import('@/views/CalculatorView.vue'),
    meta: { title: 'Calculator' },
  },
  {
    path: '/stack',
    name: 'stack',
    component: () => import('@/views/StackView.vue'),
    meta: { title: 'Stack' },
  },
  {
    path: '/stack/levels',
    name: 'levels',
    component: () => import('@/views/LevelsView.vue'),
    meta: { title: 'Compare levels' },
  },
  {
    path: '/stack/vial/:id',
    name: 'vial',
    component: () => import('@/views/VialView.vue'),
    props: true,
    meta: { title: 'Vial' },
  },
  {
    path: '/stack/:key',
    name: 'peptide',
    component: () => import('@/views/PeptideView.vue'),
    props: (route) => ({ peptideKey: String(route.params.key) }),
    meta: { title: 'Peptide' },
  },
  // Old paths redirect permanently so installed shortcuts and bookmarks keep working.
  { path: '/shelf', redirect: '/stack' },
  {
    path: '/shelf/:id',
    redirect: (to) => ({ name: 'vial', params: { id: to.params.id } }),
  },
  { path: '/protocols', redirect: '/stack' },
  { path: '/history', redirect: '/stack' },
  {
    path: '/journal',
    name: 'journal',
    component: () => import('@/views/JournalView.vue'),
    meta: { title: 'Journal' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings' },
  },
  {
    path: '/settings/health',
    name: 'health',
    component: () => import('@/views/HealthView.vue'),
    meta: { title: 'Health apps' },
    // Only the apps can reach the phone's health store.
    beforeEnter: () => (__NATIVE__ ? true : { name: 'settings' }),
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

// Measured rather than fixed: in the Android app the bar also covers the status bar inset.
function appBarHeight(): number {
  return document.querySelector<HTMLElement>('.v-app-bar')?.offsetHeight ?? 48
}

/*
 * Hash history: GitHub Pages has no SPA rewrite, so a path URL reloaded offline or opened from
 * a bookmark would 404. With a hash every URL resolves to index.html.
 */
export function createAppRouter(history: RouterHistory = createWebHashHistory()) {
  return createRouter({
    history,
    routes,
    // A section link lands below the app bar and any status bar inset above it.
    scrollBehavior: (to) =>
      to.hash ? { el: to.hash, top: appBarHeight() + 24, behavior: 'smooth' } : { top: 0 },
  })
}
