<template>
  <v-card>
    <v-data-table
      :headers="headers"
      :items="items"
      :loading="loading"
      :items-per-page="-1"
    >
      <template v-slot:item.url="{ item }">
        <a :href="item.url" target="_blank" class="text-decoration-none">
          {{ item.url }}
        </a>
      </template>

      <template v-slot:item.timestamp="{ item }">
        {{ formatDate(item.timestamp) }}
      </template>

      <template v-slot:no-data>
        <div class="text-center py-4">
          {{ loading ? 'Loading...' : 'No history records found' }}
        </div>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup>
import { format } from 'date-fns';

const props = defineProps({
  items: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const headers = [
  {
    title: 'Time',
    key: 'timestamp',
    width: '200px'
  },
  {
    title: 'URL',
    key: 'url',
  },
  {
    title: 'Domain',
    key: 'domain',
    width: '200px'
  }
];

function formatDate(timestamp) {
  return format(new Date(timestamp), 'MMM d, yyyy HH:mm:ss');
}
</script> 