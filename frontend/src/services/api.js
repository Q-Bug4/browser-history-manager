import axios from 'axios';

// 创建API客户端
const api = axios.create({
  // 不设置baseURL，使用相对路径
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

export async function searchHistory(params) {
  const queryParams = new URLSearchParams();
  
  if (params.keyword) queryParams.append('keyword', params.keyword);
  if (params.domain) queryParams.append('domain', params.domain);
  if (params.dateRange?.[0]) queryParams.append('startDate', params.dateRange[0]);
  if (params.dateRange?.[1]) queryParams.append('endDate', params.dateRange[1]);
  queryParams.append('page', params.page.toString());
  queryParams.append('pageSize', params.pageSize.toString());

  try {
    // 使用/backend前缀，这会被Nginx拦截并代理到后端
    const response = await api.get(`/backend/api/history?${queryParams.toString()}`);
    
    // Transform response to match expected format
    return {
      data: {
        items: response.data.items || response.data, // Handle both new and old response format
        total: response.data.total || response.data.length,
        page: response.data.page || params.page,
        pageSize: response.data.pageSize || params.pageSize
      }
    };
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ========== URL Normalization Rules API ==========

export async function getNormalizationRules() {
  try {
    const response = await api.get('/backend/api/normalization-rules');
    return response.data;
  } catch (error) {
    console.error('Get normalization rules error:', error);
    throw error;
  }
}

export async function createNormalizationRule(rule) {
  try {
    const response = await api.post('/backend/api/normalization-rules', rule);
    return response.data;
  } catch (error) {
    console.error('Create normalization rule error:', error);
    throw error;
  }
}

export async function updateNormalizationRule(id, rule) {
  try {
    const response = await api.put(`/backend/api/normalization-rules/${id}`, rule);
    return response.data;
  } catch (error) {
    console.error('Update normalization rule error:', error);
    throw error;
  }
}

export async function deleteNormalizationRule(id) {
  try {
    const response = await api.delete(`/backend/api/normalization-rules/${id}`);
    return response.data;
  } catch (error) {
    console.error('Delete normalization rule error:', error);
    throw error;
  }
}

export async function testNormalizationRule(ruleData) {
  try {
    const response = await api.post('/backend/api/normalization-rules/test', ruleData);
    return response.data;
  } catch (error) {
    console.error('Test normalization rule error:', error);
    throw error;
  }
}

export async function refreshRulesCache() {
  try {
    const response = await api.post('/backend/api/normalization-rules/refresh-cache');
    return response.data;
  } catch (error) {
    console.error('Refresh rules cache error:', error);
    throw error;
  }
} 