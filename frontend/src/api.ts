import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: BASE });

// Dashboard
export const checkHealth = () => api.get('/health');
export const getDashboardSummary = () => api.get('/api/dashboard/summary');
export const getDashboardActivity = () => api.get('/api/dashboard/activity');
export const getDashboardAnalytics = () => api.get('/api/dashboard/analytics');

// Playground
export const runPlayground = (data: object) => api.post('/api/playground/run', data);
export const getPlaygroundHistory = () => api.get('/api/playground/history');
export const savePlaygroundTestCase = (data: object) => api.post('/api/playground/save-test-case', data);

// Evaluations
export const runEvaluation = (data: object) => api.post('/api/evaluations/run', data);
export const listEvaluations = () => api.get('/api/evaluations');
export const getEvaluation = (id: string) => api.get(`/api/evaluations/${id}`);
export const getEvaluationResults = (id: string) => api.get(`/api/evaluations/${id}/results`);

// Datasets
export const listDatasets = () => api.get('/api/datasets');
export const createDataset = (data: object) => api.post('/api/datasets', data);
export const getDataset = (id: string) => api.get(`/api/datasets/${id}`);
export const updateDataset = (id: string, data: object) => api.put(`/api/datasets/${id}`, data);
export const deleteDataset = (id: string) => api.delete(`/api/datasets/${id}`);
export const seedDatasets = () => api.post('/api/datasets/seed');
export const addTestCase = (dsId: string, data: object) => api.post(`/api/datasets/${dsId}/cases`, data);
export const updateTestCase = (dsId: string, tcId: string, data: object) => api.put(`/api/datasets/${dsId}/cases/${tcId}`, data);
export const deleteTestCase = (dsId: string, tcId: string) => api.delete(`/api/datasets/${dsId}/cases/${tcId}`);
export const importDataset = (dsId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/api/datasets/${dsId}/import`, form);
};
export const exportDataset = (dsId: string, format: string) =>
  api.get(`/api/datasets/${dsId}/export?format=${format}`, { responseType: 'blob' });

// Regression
export const createBaseline = (data: object) => api.post('/api/regression/baselines', data);
export const listBaselines = () => api.get('/api/regression/baselines');
export const runRegression = (data: object) => api.post('/api/regression/run', data);
export const listComparisons = () => api.get('/api/regression/comparisons');
export const getRegression = (id: string) => api.get(`/api/regression/${id}`);

// Safety
export const runSafety = (data: object) => api.post('/api/safety/run', data);
export const listSafetyResults = () => api.get('/api/safety/results');
export const getSafetyRun = (id: string) => api.get(`/api/safety/runs/${id}`);

// Models
export const listModels = () => api.get('/api/models');
export const testConnection = (data: object) => api.post('/api/models/test-connection', data);
export const compareModels = (data: object) => api.post('/api/models/compare', data);

// Reports
export const getReport = (id: string) => api.get(`/api/reports/${id}`);
export const exportReport = (id: string, format: string) =>
  api.get(`/api/reports/${id}/export?format=${format}`, { responseType: 'blob' });

export default api;
