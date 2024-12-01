<template>
  <v-app>
    <v-main>
      <v-container>
        <h1 class="text-h4 mb-6">Browser History</h1>
        
        <search-filters
          v-model:keyword="filters.keyword"
          v-model:domain="filters.domain"
          v-model:dateRange="filters.dateRange"
          :loading="loading"
          @search="fetchHistory"
        />

        <div class="d-flex align-center justify-space-between mt-6 mb-2">
          <span class="text-subtitle-1">
            Total Records: {{ totalItems }}
          </span>
        </div>

        <history-table
          :loading="loading"
          :items="historyItems"
          :page="pagination.page"
          :page-size="pagination.itemsPerPage"
        />

        <custom-pagination
          v-model:page="pagination.page"
          v-model:itemsPerPage="pagination.itemsPerPage"
          :total="totalItems"
          @update:page="fetchHistory"
          @update:itemsPerPage="fetchHistory"
          class="mt-4"
        />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, reactive } from 'vue';
import SearchFilters from './components/SearchFilters.vue';
import HistoryTable from './components/HistoryTable.vue';
import CustomPagination from './components/CustomPagination.vue';
import { searchHistory } from './services/api';

const loading = ref(false);
const historyItems = ref([]);
const totalItems = ref(0);

const filters = reactive({
  keyword: '',
  domain: '',
  dateRange: null,
});

const pagination = reactive({
  page: 1,
  itemsPerPage: 30,
});

async function fetchHistory() {
  loading.value = true;
  try {
    const response = await searchHistory({
      ...filters,
      page: pagination.page,
      pageSize: pagination.itemsPerPage,
    });
    
    historyItems.value = response.data.items;
    totalItems.value = response.data.total;
  } catch (error) {
    console.error('Failed to fetch history:', error);
    historyItems.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
}

// Initial fetch
fetchHistory();
</script>

<style>
.v-container {
  max-width: 1200px;
}
</style> 