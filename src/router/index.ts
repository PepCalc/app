import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'calculator',
    component: () => import('@/views/CalculatorView.vue'),
    meta: { title: 'Calculator' },
  },
  {
    path: '/shelf',
    name: 'shelf',
    component: () => import('@/views/ShelfView.vue'),
    meta: { title: 'Shelf' },
  },
  {
    path: '/shelf/:id',
    name: 'vial',
    component: () => import('@/views/VialView.vue'),
    props: true,
    meta: { title: 'Vial' },
  },
  {
    path: '/journal',
    name: 'journal',
    component: () => import('@/views/JournalView.vue'),
    meta: { title: 'Journal' },
  },
  {
    path: '/protocols',
    name: 'protocols',
    component: () => import('@/views/ProtocolsView.vue'),
    meta: { title: 'Protocols' },
  },
  // History became Protocols; bookmarks and installed apps opened on the old tab land here.
  { path: '/history', redirect: { name: 'protocols' } },
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
export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes,
    // A section link lands below the app bar and any status bar inset above it.
    scrollBehavior: (to) =>
      to.hash ? { el: to.hash, top: appBarHeight() + 24, behavior: 'smooth' } : { top: 0 },
  })
}
