<template>
  <div class="d-flex align-center justify-space-between">
    <v-select
      v-model="localItemsPerPage"
      :items="pageSizeOptions"
      label="Items per page"
      style="max-width: 150px"
    />

    <v-pagination
      v-model="localPage"
      :length="pageCount"
      :total-visible="7"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  page: {
    type: Number,
    required: true
  },
  itemsPerPage: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['update:page', 'update:itemsPerPage']);

const localPage = ref(props.page);
const localItemsPerPage = ref(props.itemsPerPage);

const pageSizeOptions = [
  { title: '30 items', value: 30 },
  { title: '100 items', value: 100 },
  { title: '200 items', value: 200 }
];

const pageCount = computed(() => {
  return Math.ceil(props.total / localItemsPerPage.value);
});

watch(localPage, (newValue) => {
  emit('update:page', newValue);
});

watch(localItemsPerPage, (newValue) => {
  emit('update:itemsPerPage', newValue);
  localPage.value = 1;
});
</script> 