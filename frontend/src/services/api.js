import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8080',
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
    const response = await api.get(`/api/history?${queryParams.toString()}`);
    
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