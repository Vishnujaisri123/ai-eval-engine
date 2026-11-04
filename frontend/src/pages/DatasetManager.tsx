import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Upload, Download, Trash2, Edit, Search,
  Database, ArrowLeft, FileText
} from 'lucide-react';
import {
  listDatasets, getDataset, createDataset,
  deleteDataset, addTestCase, updateTestCase, deleteTestCase,
  importDataset, exportDataset, seedDatasets
} from '../api';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';

export default function DatasetManager() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [datasets, setDatasets] = useState<any[]>([]);
  const [activeDataset, setActiveDataset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Dataset Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newDatasetDesc, setNewDatasetDesc] = useState('');

  // Add/Edit TestCase Modal
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [casePrompt, setCasePrompt] = useState('');
  const [caseSystem, setCaseSystem] = useState('');
  const [caseContext, setCaseContext] = useState('');
  const [caseExpected, setCaseExpected] = useState('');
  const [caseActual, setCaseActual] = useState('');
  const [caseKeywords, setCaseKeywords] = useState('');
  const [caseCategory, setCaseCategory] = useState('general');
  const [caseThreshold, setCaseThreshold] = useState(0.70);
  const [caseTags, setCaseTags] = useState('');

  // Import State
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await listDatasets();
      setDatasets(res.data);

      if (datasetId) {
        const dsRes = await getDataset(datasetId);
        setActiveDataset(dsRes.data);
      } else {
        setActiveDataset(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [datasetId]);

  const handleCreateDataset = async () => {
    if (!newDatasetName.trim()) return;
    try {
      const res = await createDataset({
        name: newDatasetName,
        description: newDatasetDesc,
      });
      setShowCreateModal(false);
      setNewDatasetName('');
      setNewDatasetDesc('');
      navigate(`/datasets/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create dataset');
    }
  };

  const handleDeleteDataset = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete dataset '${name}'?`)) return;
    try {
      await deleteDataset(id);
      if (datasetId === id) {
        navigate('/datasets');
      } else {
        loadData();
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete dataset');
    }
  };

  const handleSaveTestCase = async () => {
    if (!casePrompt.trim() || !activeDataset) return;

    const keywords = caseKeywords.split(',').map((k) => k.trim()).filter(Boolean);
    const tags = caseTags.split(',').map((t) => t.trim()).filter(Boolean);

    const payload = {
      prompt: casePrompt,
      system_instructions: caseSystem,
      context: caseContext,
      expected_output: caseExpected,
      actual_output: caseActual,
      expected_keywords: keywords,
      category: caseCategory,
      threshold: caseThreshold,
      tags,
    };

    try {
      if (editingCaseId) {
        await updateTestCase(activeDataset.id, editingCaseId, payload);
      } else {
        await addTestCase(activeDataset.id, payload);
      }

      setShowCaseModal(false);
      resetCaseForm();
      const dsRes = await getDataset(activeDataset.id);
      setActiveDataset(dsRes.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save testcase');
    }
  };

  const handleDeleteTestCase = async (tcId: string) => {
    if (!activeDataset || !window.confirm('Delete this test case?')) return;
    try {
      await deleteTestCase(activeDataset.id, tcId);
      const dsRes = await getDataset(activeDataset.id);
      setActiveDataset(dsRes.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete testcase');
    }
  };

  const openEditTestCase = (tc: any) => {
    setEditingCaseId(tc.id);
    setCasePrompt(tc.prompt || '');
    setCaseSystem(tc.system_instructions || '');
    setCaseContext(tc.context || '');
    setCaseExpected(tc.expected_output || '');
    setCaseActual(tc.actual_output || '');
    setCaseKeywords((tc.expected_keywords || []).join(', '));
    setCaseCategory(tc.category || 'general');
    setCaseThreshold(tc.threshold || 0.70);
    setCaseTags((tc.tags || []).join(', '));
    setShowCaseModal(true);
  };

  const resetCaseForm = () => {
    setEditingCaseId(null);
    setCasePrompt('');
    setCaseSystem('');
    setCaseContext('');
    setCaseExpected('');
    setCaseActual('');
    setCaseKeywords('');
    setCaseCategory('general');
    setCaseThreshold(0.70);
    setCaseTags('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDataset) return;

    try {
      setImporting(true);
      setImportMessage(null);
      const res = await importDataset(activeDataset.id, file);
      setImportMessage(`Successfully imported ${res.data.imported} test cases!`);
      const dsRes = await getDataset(activeDataset.id);
      setActiveDataset(dsRes.data);
    } catch (err: any) {
      setImportMessage(`Import error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = (format: string) => {
    if (!activeDataset) return;
    exportDataset(activeDataset.id, format)
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${activeDataset.name.replace(/\s+/g, '_')}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch((err) => console.error(err));
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Dataset Manager" />
        <LoadingState message="Loading test datasets..." />
      </div>
    );
  }

  // Filter test cases
  const filteredCases = (activeDataset?.test_cases || []).filter((tc: any) => {
    const q = searchQuery.toLowerCase();
    return (
      tc.prompt.toLowerCase().includes(q) ||
      tc.expected_output.toLowerCase().includes(q) ||
      tc.category.toLowerCase().includes(q) ||
      tc.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <Header
        title={activeDataset ? `Dataset: ${activeDataset.name}` : 'Dataset Manager'}
        description={
          activeDataset
            ? activeDataset.description || 'Manage test cases, expected ground truth, and keyword coverage.'
            : 'Organize regression test suites, import CSV/JSON test cases, and manage reference ground truth.'
        }
        actions={
          <div className="flex items-center gap-2">
            {activeDataset ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate('/datasets')}
                >
                  <ArrowLeft size={13} /> Back to Suites
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".json,.csv"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  <Upload size={13} /> {importing ? 'Importing...' : 'Upload JSON/CSV'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleExport('json')}
                >
                  <Download size={13} /> Export JSON
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    resetCaseForm();
                    setShowCaseModal(true);
                  }}
                >
                  <Plus size={13} /> Add Test Case
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await seedDatasets();
                    loadData();
                  }}
                >
                  <Database size={13} /> Seed Starter Suites
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus size={13} /> Create Test Suite
                </button>
              </>
            )}
          </div>
        }
      />

      {/* ACTIVE DATASET DETAIL VIEW */}
      {activeDataset ? (
        <div className="flex flex-col gap-4">
          {importMessage && (
            <div
              className={`alert ${importMessage.includes('error') ? 'alert-error' : 'alert-success'} flex items-center justify-between`}
            >
              <span>{importMessage}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setImportMessage(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Test Cases Table */}
          <div className="card">
            <div className="section-header">
              <div className="flex items-center gap-3">
                <h3>Test Cases ({filteredCases.length})</h3>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '28px', width: '260px' }}
                  placeholder="Search prompts, categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search size={13} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              </div>
            </div>

            {filteredCases.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No test cases in this suite"
                description="Add your first test case manually or upload a JSON/CSV file containing prompts and expected outputs."
                actionLabel="Add Test Case"
                onAction={() => {
                  resetCaseForm();
                  setShowCaseModal(true);
                }}
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Category</th>
                      <th>Input Prompt</th>
                      <th>Context</th>
                      <th>Expected Ground Truth</th>
                      <th>Keywords</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((tc: any) => (
                      <tr key={tc.id}>
                        <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{tc.id}</td>
                        <td>
                          <span className="badge badge-gray">{tc.category}</span>
                        </td>
                        <td style={{ maxWidth: '220px' }} className="truncate">
                          {tc.prompt}
                        </td>
                        <td style={{ maxWidth: '200px' }} className="truncate text-muted">
                          {tc.context || '-'}
                        </td>
                        <td style={{ maxWidth: '220px' }} className="truncate">
                          {tc.expected_output || '-'}
                        </td>
                        <td>
                          <div className="flex gap-1" style={{ flexWrap: 'wrap', maxWidth: '140px' }}>
                            {(tc.expected_keywords || []).map((k: string) => (
                              <span key={k} className="badge badge-violet" style={{ fontSize: '10px' }}>
                                {k}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="btn-icon"
                              title="Edit Case"
                              onClick={() => openEditTestCase(tc)}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon text-red"
                              title="Delete Case"
                              onClick={() => handleDeleteTestCase(tc.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* DATASETS LIST VIEW */
        <div className="cards-grid cards-grid-3">
          {datasets.map((d) => (
            <div key={d.id} className="card flex flex-col justify-between" style={{ minHeight: '180px' }}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-blue">{d.test_case_count} test cases</span>
                  <button
                    type="button"
                    className="btn-icon text-red"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDataset(d.id, d.name);
                    }}
                    title="Delete Dataset"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>{d.name}</h3>
                <p className="text-secondary" style={{ fontSize: '13px' }}>
                  {d.description || 'Custom regression evaluation test suite.'}
                </p>
              </div>

              <div className="flex items-center justify-between mt-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <span className="text-muted" style={{ fontSize: '11px' }}>
                  {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/datasets/${d.id}`)}
                >
                  Open Suite
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE DATASET MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Test Suite</h3>
            </div>
            <div className="modal-body flex flex-col gap-3">
              <div className="form-group">
                <label className="form-label">Suite Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Smart Appliance QA Suite"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Brief description of the domain or feature being tested..."
                  value={newDatasetDesc}
                  onChange={(e) => setNewDatasetDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateDataset}
                disabled={!newDatasetName.trim()}
              >
                Create Suite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT TEST CASE MODAL */}
      {showCaseModal && (
        <div className="modal-overlay" onClick={() => setShowCaseModal(false)}>
          <div className="modal" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCaseId ? 'Edit Test Case' : 'Add New Test Case'}</h3>
            </div>
            <div className="modal-body flex flex-col gap-3">
              <div className="form-group">
                <label className="form-label">User Prompt / Question *</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={casePrompt}
                  onChange={(e) => setCasePrompt(e.target.value)}
                  placeholder="Question or command submitted to the AI..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">System Instructions</label>
                <input
                  type="text"
                  className="form-input"
                  value={caseSystem}
                  onChange={(e) => setCaseSystem(e.target.value)}
                  placeholder="e.g. Answer strictly using context."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reference Context (RAG Information)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={caseContext}
                  onChange={(e) => setCaseContext(e.target.value)}
                  placeholder="Source text, product manual, or documentation chunk..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Expected Output (Ground Truth Reference)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={caseExpected}
                  onChange={(e) => setCaseExpected(e.target.value)}
                  placeholder="The ideal verified response..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Required Keywords (comma-separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={caseKeywords}
                    onChange={(e) => setCaseKeywords(e.target.value)}
                    placeholder="e.g. 28w, bldc, warranty"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input
                    type="text"
                    className="form-input"
                    value={caseCategory}
                    onChange={(e) => setCaseCategory(e.target.value)}
                    placeholder="e.g. power_consumption, safety, general"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCaseModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveTestCase}
                disabled={!casePrompt.trim()}
              >
                Save Test Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
