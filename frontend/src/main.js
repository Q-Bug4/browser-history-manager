import { createApp } from 'vue';
import App from './App.vue';
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1a73e8',
          secondary: '#5f6368',
          background: '#ffffff',
          surface: '#f8f9fa',
        }
      }
    }
  }
});

const app = createApp(App);
app.use(vuetify);
app.mount('#app'); 