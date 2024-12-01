<template>
  <v-card>
    <v-data-table
      :headers="headers"
      :items="items"
      :loading="loading"
      :items-per-page="-1"
      hide-default-footer
    >
      <template v-slot:item.index="{ item, index }">
        {{ calculateIndex(index) }}
      </template>

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
  },
  page: {
    type: Number,
    default: 1
  },
  pageSize: {
    type: Number,
    default: 30
  }
});

const headers = [
  {
    title: '#',
    key: 'index',
    width: '70px'
  },
  {
    title: 'Time',
    key: 'timestamp',
    width: '180px'
  },
  {
    title: 'URL',
    key: 'url',
    width: 'auto'
  },
  {
    title: 'Domain',
    key: 'domain',
    width: '200px'
  }
];

function formatDate(timestamp) {
  return format(new Date(timestamp), 'yyyy-MM-dd-HH-mm-ss');
}

function calculateIndex(index) {
  return (props.page - 1) * props.pageSize + index + 1;
}
</script>

<style scoped>
:deep(.v-data-table-header th:nth-child(2)),
:deep(.v-data-table tbody td:nth-child(2)) {
  white-space: nowrap;
}

:deep(.v-data-table tbody td:nth-child(3)) {
  word-break: break-all;
  white-space: normal;
}
</style> 