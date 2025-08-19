<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6">
      <h1 class="text-h4">URL Normalization Rules</h1>
      <v-btn 
        color="primary" 
        @click="showCreateDialog = true"
        prepend-icon="mdi-plus"
      >
        Add New Rule
      </v-btn>
    </div>

    <!-- Description -->
    <v-alert type="info" class="mb-6">
      <v-alert-title>About URL Normalization</v-alert-title>
      <p class="mb-2">
        URL normalization rules help consolidate similar URLs for better link highlighting in the browser extension.
        When multiple URL variants (like different query parameters or fragments) point to the same content,
        these rules normalize them to a single canonical form.
      </p>
      <p class="mb-0">
        <strong>Example:</strong> URLs like <code>example.com/page?utm_source=twitter</code> and 
        <code>example.com/page#section1</code> can both normalize to <code>example.com/page</code>
      </p>
    </v-alert>

    <!-- Rules List -->
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Rules ({{ rules.length }})</span>
        <v-btn
          variant="text"
          @click="refreshCache"
          :loading="refreshingCache"
          prepend-icon="mdi-refresh"
        >
          Refresh Cache
        </v-btn>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="rules"
        :loading="loading"
        item-value="id"
        class="elevation-0"
      >
        <template v-slot:item.enabled="{ item }">
          <v-chip 
            :color="item.enabled ? 'success' : 'default'"
            size="small"
          >
            {{ item.enabled ? 'Active' : 'Disabled' }}
          </v-chip>
        </template>

        <template v-slot:item.pattern="{ item }">
          <code class="text-red">{{ item.pattern }}</code>
        </template>

        <template v-slot:item.replacement="{ item }">
          <code class="text-blue">{{ item.replacement }}</code>
        </template>

        <template v-slot:item.created_at="{ item }">
          {{ formatDate(item.created_at) }}
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn
            icon="mdi-test-tube"
            size="small"
            variant="text"
            @click="openTestDialog(item)"
            :disabled="!item.enabled"
          />
          <v-btn
            icon="mdi-pencil"
            size="small"
            variant="text"
            @click="openEditDialog(item)"
          />
          <v-btn
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            @click="confirmDelete(item)"
          />
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/Edit Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="600">
      <v-card>
        <v-card-title>
          {{ editingRule ? 'Edit Rule' : 'Create New Rule' }}
        </v-card-title>
        
        <v-card-text>
          <v-form ref="form" v-model="formValid">
            <v-text-field
              v-model="formData.pattern"
              label="Regular Expression Pattern"
              hint="JavaScript regex pattern (e.g., https://example\.com/video/(\d+).*)"
              persistent-hint
              :rules="patternRules"
              class="mb-4"
            />
            
            <v-text-field
              v-model="formData.replacement"
              label="Replacement String"
              hint="Use $1, $2, etc. for captured groups (e.g., https://example.com/video/$1)"
              persistent-hint
              :rules="replacementRules"
              class="mb-4"
            />
            
            <v-text-field
              v-model.number="formData.order_index"
              label="Order (Priority)"
              type="number"
              hint="Lower numbers have higher priority"
              persistent-hint
              :rules="orderRules"
              class="mb-4"
            />
            
            <v-switch
              v-model="formData.enabled"
              label="Enable this rule"
              color="primary"
            />
          </v-form>
        </v-card-text>
        
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeDialog">Cancel</v-btn>
          <v-btn 
            color="primary" 
            @click="saveRule"
            :disabled="!formValid"
            :loading="saving"
          >
            {{ editingRule ? 'Update' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Test Dialog -->
    <v-dialog v-model="showTestDialog" max-width="600">
      <v-card>
        <v-card-title>Test Rule</v-card-title>
        
        <v-card-text>
          <div class="mb-4">
            <div class="text-subtitle-2 mb-2">Pattern:</div>
            <code class="text-red">{{ testRule?.pattern }}</code>
          </div>
          
          <div class="mb-4">
            <div class="text-subtitle-2 mb-2">Replacement:</div>
            <code class="text-blue">{{ testRule?.replacement }}</code>
          </div>
          
          <v-text-field
            v-model="testUrl"
            label="Test URL"
            placeholder="Enter a URL to test against this rule"
            @input="runTest"
            class="mb-4"
          />
          
          <div v-if="testResult">
            <v-alert 
              :type="testResult.data.matched ? 'success' : 'warning'"
              class="mb-4"
            >
              <v-alert-title>
                {{ testResult.data.matched ? '✓ Rule Matched' : '✗ Rule Not Matched' }}
              </v-alert-title>
              
              <div v-if="testResult.data.matched">
                <div class="mb-2"><strong>Original:</strong> {{ testResult.data.original_url }}</div>
                <div><strong>Normalized:</strong> {{ testResult.data.normalized_url }}</div>
              </div>
              <div v-else>
                The URL doesn't match this rule pattern.
              </div>
            </v-alert>
          </div>
        </v-card-text>
        
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showTestDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>Confirm Delete</v-card-title>
        <v-card-text>
          Are you sure you want to delete this rule?
          <div class="mt-2">
            <code class="text-red">{{ deleteRule?.pattern }}</code>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn 
            color="error" 
            @click="deleteRuleConfirmed"
            :loading="deleting"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar for messages -->
    <v-snackbar
      v-model="showSnackbar"
      :color="snackbarColor"
      :timeout="4000"
    >
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import {
  getNormalizationRules,
  createNormalizationRule,
  updateNormalizationRule,
  deleteNormalizationRule,
  testNormalizationRule,
  refreshRulesCache
} from '../services/api';

const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const refreshingCache = ref(false);
const rules = ref([]);

const showCreateDialog = ref(false);
const showTestDialog = ref(false);
const showDeleteDialog = ref(false);
const editingRule = ref(null);
const deleteRule = ref(null);
const testRule = ref(null);

const formValid = ref(false);
const formData = reactive({
  pattern: '',
  replacement: '',
  order_index: 1,
  enabled: true
});

const testUrl = ref('');
const testResult = ref(null);

const showSnackbar = ref(false);
const snackbarMessage = ref('');
const snackbarColor = ref('success');

const headers = [
  { title: 'Order', key: 'order_index', width: '80px' },
  { title: 'Status', key: 'enabled', width: '100px' },
  { title: 'Pattern', key: 'pattern', width: '300px' },
  { title: 'Replacement', key: 'replacement', width: '300px' },
  { title: 'Created', key: 'created_at', width: '150px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '120px' }
];

const patternRules = [
  v => !!v || 'Pattern is required',
  v => {
    try {
      new RegExp(v);
      return true;
    } catch (e) {
      return 'Invalid regular expression';
    }
  }
];

const replacementRules = [
  v => !!v || 'Replacement is required'
];

const orderRules = [
  v => v >= 1 || 'Order must be at least 1'
];

async function fetchRules() {
  loading.value = true;
  try {
    const response = await getNormalizationRules();
    rules.value = response.data || [];
  } catch (error) {
    showMessage('Failed to fetch rules', 'error');
  } finally {
    loading.value = false;
  }
}

function openEditDialog(rule) {
  editingRule.value = rule;
  formData.pattern = rule.pattern;
  formData.replacement = rule.replacement;
  formData.order_index = rule.order_index;
  formData.enabled = rule.enabled;
  showCreateDialog.value = true;
}

function closeDialog() {
  showCreateDialog.value = false;
  editingRule.value = null;
  resetForm();
}

function resetForm() {
  formData.pattern = '';
  formData.replacement = '';
  formData.order_index = 1;
  formData.enabled = true;
}

async function saveRule() {
  saving.value = true;
  try {
    if (editingRule.value) {
      await updateNormalizationRule(editingRule.value.id, formData);
      showMessage('Rule updated successfully');
    } else {
      await createNormalizationRule(formData);
      showMessage('Rule created successfully');
    }
    
    closeDialog();
    await fetchRules();
  } catch (error) {
    showMessage(error.response?.data?.message || 'Failed to save rule', 'error');
  } finally {
    saving.value = false;
  }
}

function confirmDelete(rule) {
  deleteRule.value = rule;
  showDeleteDialog.value = true;
}

async function deleteRuleConfirmed() {
  deleting.value = true;
  try {
    await deleteNormalizationRule(deleteRule.value.id);
    showMessage('Rule deleted successfully');
    showDeleteDialog.value = false;
    await fetchRules();
  } catch (error) {
    showMessage('Failed to delete rule', 'error');
  } finally {
    deleting.value = false;
  }
}

function openTestDialog(rule) {
  testRule.value = rule;
  testUrl.value = '';
  testResult.value = null;
  showTestDialog.value = true;
}

async function runTest() {
  if (!testUrl.value || !testRule.value) return;
  
  try {
    testResult.value = await testNormalizationRule({
      pattern: testRule.value.pattern,
      replacement: testRule.value.replacement,
      test_url: testUrl.value
    });
  } catch (error) {
    showMessage('Test failed: ' + (error.response?.data?.message || error.message), 'error');
  }
}

async function refreshCache() {
  refreshingCache.value = true;
  try {
    await refreshRulesCache();
    showMessage('Cache refreshed successfully');
  } catch (error) {
    showMessage('Failed to refresh cache', 'error');
  } finally {
    refreshingCache.value = false;
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString();
}

function showMessage(message, color = 'success') {
  snackbarMessage.value = message;
  snackbarColor.value = color;
  showSnackbar.value = true;
}

onMounted(() => {
  fetchRules();
});
</script>

<style scoped>
.text-red {
  color: #d32f2f;
}

.text-blue {
  color: #1976d2;
}

code {
  background-color: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.875rem;
}
</style>
