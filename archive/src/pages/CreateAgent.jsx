import { useState, useEffect } from 'react';
import { Eye, Copy, RefreshCw, Plus, X, User, Hash, Tag, FileText, Database, DollarSign, Folder, FolderOpen, Table, Code, Info, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react';
import Spinner from '../components/Spinner';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Toast from '../components/Toast';
import { listBQDatasets, listBQTables, getBQTableSchema, createAgent } from '../utils/api';
import { GUARD_RAILS_DISPLAY_TEXT } from '../constants/guardRails';
import { CURRENCIES, getCurrency, setCurrencyForAgent } from '../utils/currency';

const CreateAgent = () => {
  const [agentId, setAgentId] = useState('');
  const [label, setLabel] = useState('');
  const [instruction, setInstruction] = useState('');
  const [currency, setCurrency] = useState(getCurrency());
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [gcpDatasets, setGcpDatasets] = useState([]);
  const [gcpTables, setGcpTables] = useState([]);
  const [gcpSelectedDataset, setGcpSelectedDataset] = useState('');
  const [gcpSelectedTable, setGcpSelectedTable] = useState('');
  const [loadingGcpDatasets, setLoadingGcpDatasets] = useState(false);
  const [loadingGcpTables, setLoadingGcpTables] = useState(false);
  const [tableSchema, setTableSchema] = useState(null);
  const [loadingTableSchema, setLoadingTableSchema] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [sources, setSources] = useState([]);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const [cache, setCache] = useState({
    projects: null,
    datasetsByProject: {},
    tablesByPD: {},
  });

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
  };

  useEffect(() => {
    if (sources.length === 0) {
      addSource();
    }
  }, []);

  const addSource = () => {
    setSources([
      ...sources,
      {
        id: Date.now(),
        project: '',
        dataset: '',
        table: '',
      },
    ]);
  };

  const updateSource = (id, field, value) => {
    setSources(
      sources.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const loadDatasets = async (project) => {
    if (!project) return [];
    const key = project;
    if (cache.datasetsByProject[key]) {
      return cache.datasetsByProject[key];
    }
    try {
      const data = await listBQDatasets(project);
      const datasetIds = data.map((d) => d.id);
      setCache((prev) => ({
        ...prev,
        datasetsByProject: { ...prev.datasetsByProject, [key]: datasetIds },
      }));
      return datasetIds;
    } catch (e) {
      setStatus(`Datasets error: ${e.message}`);
      showToast(`Datasets error: ${e.message}`, 'error');
      return [];
    }
  };

  const loadTables = async (project, dataset) => {
    if (!project || !dataset) return [];
    const key = `${project}/${dataset}`;
    if (cache.tablesByPD[key]) {
      return cache.tablesByPD[key];
    }
    try {
      const data = await listBQTables(project, dataset);
      const tableIds = data.map((t) => t.id);
      setCache((prev) => ({
        ...prev,
        tablesByPD: { ...prev.tablesByPD, [key]: tableIds },
      }));
      return tableIds;
    } catch (e) {
      setStatus(`Tables error: ${e.message}`);
      showToast(`Tables error: ${e.message}`, 'error');
      return [];
    }
  };

  const handleLoadGcpProject = async () => {
    const project = gcpProjectId.trim();
    if (!project) {
      showToast('Enter a GCP Project ID first', 'error');
      return;
    }
    setLoadingGcpDatasets(true);
    setGcpSelectedDataset('');
    setGcpSelectedTable('');
    setGcpTables([]);
    try {
      const datasetIds = await loadDatasets(project);
      setGcpDatasets(datasetIds);
      setStatus('');
      if (datasetIds.length > 0) {
        showToast(`Found ${datasetIds.length} dataset(s)`, 'success');
        if (sources.length > 0) {
          updateSource(sources[0].id, 'project', project);
        }
      } else {
        showToast('No datasets in this project', 'info');
      }
    } catch (e) {
      setGcpDatasets([]);
      showToast(e.message || 'Failed to load datasets', 'error');
    } finally {
      setLoadingGcpDatasets(false);
    }
  };

  const handleGcpDatasetChange = (dataset) => {
    setGcpSelectedDataset(dataset);
    setGcpSelectedTable('');
    setGcpTables([]);
    setTableSchema(null);
    setSchemaOpen(false);
    if (sources.length > 0) {
      const firstId = sources[0].id;
      setSources((prev) =>
        prev.map((s) =>
          s.id === firstId ? { ...s, dataset, table: '' } : s
        )
      );
    }
    if (dataset && gcpProjectId.trim()) {
      setLoadingGcpTables(true);
      loadTables(gcpProjectId.trim(), dataset)
        .then((tableIds) => {
          setGcpTables(tableIds);
        })
        .catch(() => setGcpTables([]))
        .finally(() => setLoadingGcpTables(false));
    }
  };

  const handleGcpTableChange = (table) => {
    setGcpSelectedTable(table);
    setTableSchema(null);
    setSchemaOpen(false);
    if (sources.length > 0) {
      updateSource(sources[0].id, 'table', table);
    }
  };

  useEffect(() => {
    const project = gcpProjectId.trim();
    if (!project || !gcpSelectedDataset || !gcpSelectedTable) return;
    setLoadingTableSchema(true);
    getBQTableSchema(project, gcpSelectedDataset, gcpSelectedTable)
      .then((data) => setTableSchema(data))
      .catch(() => setTableSchema(null))
      .finally(() => setLoadingTableSchema(false));
  }, [gcpProjectId, gcpSelectedDataset, gcpSelectedTable]);

  const slugOK = (s) => /^[a-z0-9_-]+$/.test(s || '');

  const collectPayload = () => {
    const id = agentId.trim();
    if (!slugOK(id)) {
      throw new Error(
        'Agent ID must be lowercase letters, numbers, hyphens or underscores.'
      );
    }
    const agentLabel = label.trim() || id;
    const agentInstruction = instruction.trim();

    const validSources = sources.filter(
      (s) => s.project && s.dataset
    );
    if (!validSources.length) {
      throw new Error(
        'Please add at least one BigQuery source (project + dataset).'
      );
    }

    return {
      id,
      label: agentLabel,
      dataAnalyticsAgent: {
        publishedContext: {
          systemInstruction: agentInstruction,
        },
        dataSources: validSources.map((s) => ({
          bigquery: {
            projectId: s.project,
            datasetId: s.dataset,
            tableId: s.table || undefined,
          },
        })),
      },
    };
  };

  const handlePreview = () => {
    try {
      const payload = collectPayload();
      setPreview(JSON.stringify(payload, null, 2));
      setStatus('Preview ready');
      showToast('Preview updated', 'success');
    } catch (e) {
      setStatus(`Error: ${e.message}`);
      showToast(e.message, 'error');
    }
  };

  const handleCopy = async () => {
    try {
      if (!preview.trim()) {
        handlePreview();
        return;
      }
      await navigator.clipboard.writeText(preview);
      showToast('JSON copied to clipboard', 'success');
    } catch (e) {
      showToast('Copy failed', 'error');
    }
  };

  const handleReset = () => {
    setAgentId('');
    setLabel('');
    setInstruction('');
    setCurrency(getCurrency());
    setGcpProjectId('');
    setGcpDatasets([]);
    setGcpTables([]);
    setGcpSelectedDataset('');
    setGcpSelectedTable('');
    setTableSchema(null);
    setSchemaOpen(false);
    setSources([{ id: Date.now(), project: '', dataset: '', table: '' }]);
    setPreview('');
    setStatus('');
  };

  const handleCreate = async () => {
    try {
      // Validate and collect payload
      const payload = collectPayload();
      
      setStatus('Creating agent...');
      showToast('Creating agent, please wait...', 'info');
      
      // Call the API to create the agent
      const result = await createAgent(payload);
      
      setStatus('Agent created successfully!');
      showToast(result.message || 'Agent created successfully', 'success');
      setCurrencyForAgent(payload.id, currency);

      // Reset form after successful creation
      setTimeout(() => {
        handleReset();
        setStatus('');
      }, 2000);
      
    } catch (e) {
      // Extract error message
      let errorMsg = e.message || 'Failed to create agent';
      
      // Try to extract more detailed error from response
      if (typeof e.message === 'string' && e.message.includes('{')) {
        try {
          const errorMatch = e.message.match(/\{[\s\S]*\}/);
          if (errorMatch) {
            const errorObj = JSON.parse(errorMatch[0]);
            if (errorObj?.error?.message) {
              errorMsg = errorObj.error.message;
            } else if (errorObj?.detail) {
              errorMsg = errorObj.detail;
            }
          }
        } catch {
          // If parsing fails, use original message
        }
      }
      
      setStatus(`Error: ${errorMsg}`);
      showToast(`Failed to create agent: ${errorMsg}`, 'error');
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden page-enter">
      <Header title="Create Data Agent" />
      <main className="flex-1 overflow-hidden flex min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full h-full px-6 py-5 min-w-0" style={{ minHeight: 0 }}>
          {/* Left: Form */}
          <section className="lg:col-span-7 space-y-5 overflow-y-auto overflow-x-hidden scrollbar-thin min-w-0">
            {/* Identity */}
            <div className="card">
              <div className="card-header">
                <h2 className="section-title flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Identity
                </h2>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-label mb-2 flex items-center gap-2">
                      <Hash className="w-4 h-4 text-blue-600" />
                      Agent ID (slug)
                    </label>
                    <input
                      type="text"
                      value={agentId}
                      onChange={(e) => setAgentId(e.target.value)}
                      className="input-field"
                      placeholder="e.g. incidents_agent"
                    />
                    <p className="text-hint mt-2">Lowercase letters, numbers, hyphens or underscores.</p>
                  </div>
                  <div>
                    <label className="text-label mb-2 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-blue-600" />
                      Display Label
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="input-field"
                      placeholder="e.g. Disaster Insights"
                    />
                    <p className="text-hint mt-2">Human-friendly name users see.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Instruction */}
            <div className="card">
              <div className="card-header">
                <h2 className="section-title flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  System Instruction
                </h2>
              </div>
              <div className="card-body">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  className="input-field h-40 resize-y"
                  placeholder="How should this agent behave? Include domain context, tone, constraints, etc."
                />
                <div className="flex items-center justify-between mt-3">
                  <p className="text-hint">Your instructions. Guard rails are automatically appended and cannot be edited.</p>
                  <span className="badge badge-gray">{instruction.length} characters</span>
                </div>
                <details className="mt-3 border border-gray-200 rounded-lg bg-gray-50">
                  <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer select-none">
                    Guard rails (automatically applied — not editable)
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">The following is always appended to your instruction. You cannot change it.</p>
                    <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-white p-4 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto" aria-readonly>
                      {GUARD_RAILS_DISPLAY_TEXT}
                    </pre>
                  </div>
                </details>
              </div>
            </div>

            {/* Currency */}
            <div className="card">
              <div className="card-header">
                <h2 className="section-title flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Currency for responses
                </h2>
              </div>
              <div className="card-body">
                <p className="text-hint mb-3">
                  Numbers in this agent&apos;s chat responses will be formatted with this currency.
                </p>
                <select
                  value={currency.code}
                  onChange={(e) => {
                    const c = CURRENCIES.find((x) => x.code === e.target.value);
                    if (c) setCurrency(c);
                  }}
                  className="input-field w-full max-w-xs"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} - {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Preview: {currency.position === 'after' ? `1,234.56 ${currency.symbol}` : `${currency.symbol}1,234.56`}
                </p>
              </div>
            </div>

            {/* Data Sources */}
            <div className="card">
              <div className="card-header">
                <h2 className="section-title flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Data Sources (BigQuery)
                </h2>
              </div>
              <div className="card-body">
                <div className="mb-4">
                  <label className="text-label mb-2 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    GCP Project ID
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={gcpProjectId}
                      onChange={(e) => setGcpProjectId(e.target.value)}
                      placeholder="e.g. my-client-project"
                      className="input-field flex-1 min-w-0 max-w-md"
                    />
                    <button
                      type="button"
                      onClick={handleLoadGcpProject}
                      disabled={!gcpProjectId.trim() || loadingGcpDatasets}
                      className="btn-secondary h-10 px-4 flex items-center gap-2"
                    >
                      {loadingGcpDatasets ? <Spinner size="sm" /> : null}
                      {loadingGcpDatasets ? 'Loading...' : 'Load'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Client’s GCP project where data lives. Load to pick dataset and table below.</p>
                </div>
                {gcpDatasets.length > 0 && (
                  <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <label className="text-label mb-2 flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        Dataset (from project above)
                      </label>
                      <select
                        value={gcpSelectedDataset}
                        onChange={(e) => handleGcpDatasetChange(e.target.value)}
                        className="input-field w-full min-w-0"
                        disabled={loadingGcpTables}
                      >
                        <option value="">
                          {loadingGcpTables ? 'Loading...' : 'Select dataset'}
                        </option>
                        {gcpDatasets.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="text-label mb-2 flex items-center gap-2">
                        <Table className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        Table (optional)
                      </label>
                      <select
                        value={gcpSelectedTable}
                        onChange={(e) => handleGcpTableChange(e.target.value)}
                        className="input-field w-full min-w-0"
                        disabled={!gcpSelectedDataset || loadingGcpTables}
                      >
                        <option value="">
                          {loadingGcpTables ? 'Loading tables...' : 'All tables'}
                        </option>
                        {gcpTables.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {gcpSelectedTable && (
                  <div className="mb-4 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSchemaOpen((open) => !open)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-gray-100 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <Table className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        Show schema
                        {loadingTableSchema && <Spinner size="sm" className="ml-1" />}
                      </span>
                      {schemaOpen ? (
                        <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      )}
                    </button>
                    {schemaOpen && (
                      <>
                        {loadingTableSchema && (
                          <p className="text-sm text-gray-500 px-4 pb-3">Loading schema…</p>
                        )}
                        {!loadingTableSchema && tableSchema?.fields?.length > 0 && (
                          <>
                            <p className="text-xs text-gray-500 px-4 py-2 border-t border-gray-200">
                              Use these field names in your instructions for more accurate answers.
                            </p>
                            <div className="max-h-48 overflow-y-auto border-t border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100 text-left text-xs font-medium text-gray-600">
                                    <th className="px-3 py-2">Field</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Mode</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tableSchema.fields.map((f) => (
                                    <tr key={f.name} className="border-t border-gray-200">
                                      <td className="px-3 py-1.5 font-mono text-gray-800">{f.name}</td>
                                      <td className="px-3 py-1.5 text-gray-600">{f.type || '—'}</td>
                                      <td className="px-3 py-1.5 text-gray-500 text-xs">{f.mode || 'NULLABLE'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                        {!loadingTableSchema && tableSchema && (!tableSchema.fields || tableSchema.fields.length === 0) && (
                          <p className="text-sm text-gray-500 px-4 pb-3 border-t border-gray-200 pt-2">No schema fields returned.</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  Use GCP Project ID above to set the data source (Load → select dataset and table).
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="card">
              <div className="card-body">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleCreate}
                    className="btn-primary"
                    disabled={!agentId.trim() || status.includes('Creating')}
                  >
                    <Plus className="w-4 h-4" />
                    {status.includes('Creating') ? 'Creating...' : 'Create Agent'}
                  </button>
                  <button
                    onClick={handlePreview}
                    className="btn-secondary"
                    disabled={status.includes('Creating')}
                  >
                    <Eye className="w-4 h-4" />
                    Preview JSON
                  </button>
                  <button
                    onClick={handleCopy}
                    className="btn-secondary"
                    disabled={status.includes('Creating')}
                  >
                    <Copy className="w-4 h-4" />
                    Copy JSON
                  </button>
                  <button
                    onClick={handleReset}
                    className="btn-secondary"
                    disabled={status.includes('Creating')}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset Form
                  </button>
                </div>
                {status && (
                  <div className={`mt-3 text-sm ${status.includes('Error') ? 'text-red-600' : status.includes('successfully') ? 'text-green-600' : 'text-gray-600'}`}>
                    {status}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right: Preview */}
          <section className="lg:col-span-5 h-full flex flex-col min-w-0 overflow-hidden">
            <div className="card h-full flex flex-col min-w-0 overflow-hidden">
              <div className="card-header flex-shrink-0">
                <div className="flex items-center justify-between min-w-0">
                  <h2 className="section-title flex items-center gap-2 truncate">
                    <Code className="w-4 h-4 flex-shrink-0" />
                    Draft Payload
                  </h2>
                  {status && (
                    <span className="text-xs font-medium text-gray-600 truncate ml-2">{status}</span>
                  )}
                </div>
              </div>
              <div className="card-body flex-1 overflow-hidden flex flex-col min-w-0" style={{ minHeight: 0 }}>
                <textarea
                  value={preview}
                  readOnly
                  className="flex-1 text-mono text-xs bg-gray-50 border border-gray-200 rounded p-4 text-gray-700 resize-none min-w-0 overflow-auto"
                  spellCheck="false"
                  placeholder="{…}"
                  style={{ minHeight: 0 }}
                />
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-start gap-2 text-hint">
                    <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p>This JSON is ready for a backend "create agent" endpoint when you wire it up.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />

      <Toast
        message={toast.message}
        show={toast.show}
        type={toast.type}
        onClose={() => setToast({ show: false, message: '', type: 'info' })}
      />
    </div>
  );
};

export default CreateAgent;
