<template>
  <v-card class="pa-4">
    <v-row>
      <v-col cols="12" md="4">
        <v-text-field
          v-model="localKeyword"
          label="Search URL"
          placeholder="Enter keywords"
          prepend-inner-icon="mdi-magnify"
          clearable
          @keyup.enter="search"
        />
      </v-col>

      <v-col cols="12" md="4">
        <v-text-field
          v-model="localDomain"
          label="Domain"
          placeholder="e.g. google.com"
          prepend-inner-icon="mdi-web"
          clearable
          @keyup.enter="search"
        />
      </v-col>

      <v-col cols="12" md="3">
        <v-menu
          v-model="menu"
          :close-on-content-click="false"
        >
          <template v-slot:activator="{ props }">
            <v-text-field
              v-bind="props"
              v-model="dateRangeText"
              label="Date Range"
              prepend-inner-icon="mdi-calendar"
              readonly
              clearable
              @click:clear="clearDateRange"
            />
          </template>
          
          <v-date-picker
            v-model="localDateRange"
            range
            @update:model-value="updateDateRange"
          />
        </v-menu>
      </v-col>

      <v-col cols="12" md="1" class="d-flex align-center">
        <v-btn
          color="primary"
          @click="search"
          :loading="loading"
        >
          Search
        </v-btn>
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { format } from 'date-fns';

const props = defineProps({
  keyword: String,
  domain: String,
  dateRange: Array,
  loading: Boolean,
});

const emit = defineEmits(['update:keyword', 'update:domain', 'update:dateRange', 'search']);

const menu = ref(false);
const localKeyword = ref(props.keyword);
const localDomain = ref(props.domain);
const localDateRange = ref(props.dateRange);

const dateRangeText = computed(() => {
  if (!localDateRange.value || localDateRange.value.length !== 2) return '';
  
  const [start, end] = localDateRange.value;
  return `${format(new Date(start), 'MMM d, yyyy')} - ${format(new Date(end), 'MMM d, yyyy')}`;
});

function search() {
  emit('update:keyword', localKeyword.value);
  emit('update:domain', localDomain.value);
  emit('search');
}

function updateDateRange(range) {
  if (range.length === 2) {
    menu.value = false;
    emit('update:dateRange', range);
    localDateRange.value = range;
  }
}

function clearDateRange() {
  localDateRange.value = null;
  emit('update:dateRange', null);
}
</script> 