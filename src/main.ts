import 'vuetify/styles'
import '@/plugins/fonts'
import '@/styles/tokens.css'
import '@/styles/theme.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { vuetify } from './plugins/vuetify'
import { createAppRouter } from './router'

const router = createAppRouter()
createApp(App).use(createPinia()).use(router).use(vuetify).mount('#app')

// A tapped dose reminder opens Today's log dialog for that subject (see TodayView).
if (__NATIVE__) {
  void import('@/services/reminders/nativeReminders').then(({ onReminderTap }) =>
    onReminderTap(
      (subjectId) =>
        void router.push(
          subjectId ? { name: 'today', query: { log: subjectId } } : { name: 'today' },
        ),
    ),
  )
}
