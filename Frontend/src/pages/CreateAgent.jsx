import { useState, useEffect } from 'react';
import { Eye, Copy, RefreshCw, Plus, X, User, Hash, Tag, FileText, Database, Banknote, Folder, FolderOpen, Table, Code, Info, AlertCircle, ChevronRight, ChevronDown, ShieldCheck } from 'lucide-react';
import Spinner from '../components/Spinner';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Toast from '../components/Toast';
import { listOrgProjects, listBQDatasets, listBQTables, getBQTableSchema, createAgent, generateAgentId } from '../utils/api';
import { GUARD_RAILS_DISPLAY_TEXT } from '../constants/guardRails';
import { SQL_INSTRUCTIONS_DISPLAY_TEXT } from '../constants/sqlInstructions';
import { CURRENCIES, getCurrency, setCurrencyForAgent } from '../utils/currency';

const CreateAgent = () => {
  const [agentId, setAgentId] = useState('');
  const [label, setLabel] = useState('');
  const [instruction, setInstruction] = useState('');
  const [currency, setCurrency] = useState(getCurrency());
  const [orgId, setOrgId] = useState('');
  const [orgProjects, setOrgProjects] = useState([]);
  const [loadingOrgProjects, setLoadingOrgProjects] = useState(false);
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [gcpDatasets, setGcpDatasets] = useState([]);
  const [loadingGcpDatasets, setLoadingGcpDatasets] = useState(false);
  const [tableSchema, setTableSchema] = useState(null);
  const [tableSchemaError, setTableSchemaError] = useState(null);
  const [loadingTableSchema, setLoadingTableSchema] = useState(false);
  const [schemaOpenSourceId, setSchemaOpenSourceId] = useState(null);
  const [sources, setSources] = useState([]);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [maxBytesBilled, setMaxBytesBilled] = useState('0');
  const [loadingAgentId, setLoadingAgentId] = useState(true);

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

  const fetchAgentId = async () => {
    setLoadingAgentId(true);
    try {
      const id = await generateAgentId();
      if (id) setAgentId(id);
      else showToast('Failed to generate agent ID', 'error');
    } catch (e) {
      showToast(e?.message || 'Failed to generate agent ID', 'error');
    } finally {
      setLoadingAgentId(false);
    }
  };

  useEffect(() => {
    fetchAgentId();
  }, []);

  const addSource = () => {
    setSources([
      ...sources,
      {
        id: Date.now(),
        project: gcpProjectId.trim() || '',
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

  const removeSource = (id) => {
    if (sources.length <= 1) return;
    setSources(sources.filter((s) => s.id !== id));
    setTableSchema(null);
    setTableSchemaError(null);
    if (schemaOpenSourceId === id) setSchemaOpenSourceId(null);
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

  const handleLoadOrgProjects = async () => {
    const org = orgId.trim();
    if (!org) {
      showToast('Enter an Organization ID first', 'error');
      return;
    }
    setLoadingOrgProjects(true);
    setOrgProjects([]);
    setGcpProjectId('');
    setGcpDatasets([]);
    try {
      const projects = await listOrgProjects(org);
      setOrgProjects(projects || []);
      setStatus('');
      if (projects && projects.length > 0) {
        showToast(`Found ${projects.length} project(s) in organization`, 'success');
      } else {
        showToast('No projects found in this organization', 'info');
      }
    } catch (e) {
      setOrgProjects([]);
      const errorMsg = e.message || 'Failed to load organization projects';
      showToast(errorMsg, 'error');
    } finally {
      setLoadingOrgProjects(false);
    }
  };

  const handleOrgProjectSelect = async (projectId) => {
    setGcpProjectId(projectId);
    if (projectId) {
      setLoadingGcpDatasets(true);
      try {
        const datasetIds = await loadDatasets(projectId);
        setGcpDatasets(datasetIds);
        if (datasetIds.length > 0) {
          showToast(`Found ${datasetIds.length} dataset(s)`, 'success');
          setSources((prev) => prev.map((s) => ({ ...s, project: projectId })));
        } else {
          showToast('No datasets in this project', 'info');
        }
      } catch (e) {
        setGcpDatasets([]);
        showToast(e.message || 'Failed to load datasets', 'error');
      } finally {
        setLoadingGcpDatasets(false);
      }
    } else {
      setGcpDatasets([]);
    }
  };

  const handleLoadGcpProject = async () => {
    const project = gcpProjectId.trim();
    if (!project) {
      showToast('Enter a GCP Project ID first', 'error');
      return;
    }
    setLoadingGcpDatasets(true);
    try {
      const datasetIds = await loadDatasets(project);
      setGcpDatasets(datasetIds);
      setStatus('');
      if (datasetIds.length > 0) {
        showToast(`Found ${datasetIds.length} dataset(s)`, 'success');
        setSources((prev) => prev.map((s) => ({ ...s, project })));
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

  const handleSourceDatasetChange = (sourceId, dataset) => {
    setSources((prev) =>
      prev.map((s) =>
        s.id === sourceId ? { ...s, dataset, table: '' } : s
      )
    );
    setTableSchema(null);
    setTableSchemaError(null);
    if (schemaOpenSourceId === sourceId) setSchemaOpenSourceId(null);
  };

  const handleSourceTableChange = (sourceId, table) => {
    updateSource(sourceId, 'table', table);
    setTableSchema(null);
    setTableSchemaError(null);
    if (schemaOpenSourceId === sourceId) setSchemaOpenSourceId(null);
  };

  // Preload tables for each source that has project + dataset
  const sourcesKey = sources.map((s) => `${s.project || ''}/${s.dataset || ''}`).join('|');
  useEffect(() => {
    sources.forEach((s) => {
      if (s.project && s.dataset) {
        loadTables(s.project, s.dataset).catch(() => {});
      }
    });
  }, [sourcesKey]);

  // Load schema for the source whose "Show schema" is expanded
  const schemaSource = schemaOpenSourceId ? sources.find((s) => s.id === schemaOpenSourceId) : null;
  const schemaProject = schemaSource?.project;
  const schemaDataset = schemaSource?.dataset;
  const schemaTable = schemaSource?.table;
  useEffect(() => {
    if (!schemaProject || !schemaDataset || !schemaTable) {
      setTableSchema(null);
      setTableSchemaError(null);
      return;
    }
    setLoadingTableSchema(true);
    setTableSchemaError(null);
    getBQTableSchema(schemaProject, schemaDataset, schemaTable)
      .then((data) => {
        setTableSchema(data);
        setTableSchemaError(null);
      })
      .catch((err) => {
        setTableSchema(null);
        setTableSchemaError(err?.message || 'Failed to load schema');
      })
      .finally(() => setLoadingTableSchema(false));
  }, [schemaProject, schemaDataset, schemaTable]);

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
      (s) => s.project && s.dataset && s.table
    );
    if (!validSources.length) {
      throw new Error(
        'Please add at least one BigQuery source (project + dataset + table).'
      );
    }

    const publishedContext = {
      systemInstruction: agentInstruction,
    };
    const bytesVal = parseInt(maxBytesBilled, 10);
    if (!isNaN(bytesVal) && bytesVal > 0) {
      publishedContext.options = {
        datasource: {
          bigQueryMaxBilledBytes: String(bytesVal),
        },
      };
    }
    return {
      id,
      label: agentLabel,
      dataAnalyticsAgent: {
        publishedContext,
        dataSources: validSources.map((s) => ({
          bigquery: {
            projectId: s.project,
            datasetId: s.dataset,
            tableId: s.table || undefined,
          },
        })),
      },
      currency: currency ? { code: currency.code, symbol: currency.symbol, name: currency.name } : undefined,
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

  const handleCopySchema = async () => {
    if (!tableSchema) return;
    try {
      const text = JSON.stringify(tableSchema, null, 2);
      await navigator.clipboard.writeText(text);
      showToast('Table schema copied to clipboard', 'success');
    } catch (e) {
      showToast('Copy failed', 'error');
    }
  };

  /** Format schema as a short, model-friendly block for pasting into instructions. */
  const formatSchemaForInstructions = (schema, project, dataset) => {
    if (!schema?.fields?.length) return '';
    const tableId = schema.tableId || schemaTable || 'table';
    const fullTable = [project, dataset, tableId].filter(Boolean).join('.') || tableId;
    const lines = [
      '--- Table schema (use as-is; do not scan) ---',
      `Table: ${fullTable}`,
      'Fields:',
      ...schema.fields.map((f) => `- ${f.name} (${(f.type || 'STRING').toUpperCase()}, ${(f.mode || 'NULLABLE').toUpperCase()})`),
    ];
    return lines.join('\n');
  };

  const handleCopySchemaForInstructions = async () => {
    if (!tableSchema?.fields?.length) return;
    try {
      const text = formatSchemaForInstructions(tableSchema, schemaProject, schemaDataset);
      await navigator.clipboard.writeText(text);
      showToast('Schema copied for instructions', 'success');
    } catch (e) {
      showToast('Copy failed', 'error');
    }
  };

  const handleReset = () => {
    fetchAgentId();
    setLabel('');
    setInstruction('');
    setCurrency(getCurrency());
    setMaxBytesBilled('0');
    setGcpProjectId('');
    setGcpDatasets([]);
    setTableSchema(null);
    setTableSchemaError(null);
    setSchemaOpenSourceId(null);
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
                      readOnly
                      className="input-field bg-gray-50"
                      placeholder={loadingAgentId ? 'Generating...' : 'e.g. dashworx_a1b2c3d4'}
                    />
                    <p className="text-hint mt-2">ID is auto-generated.</p>
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
                  <p className="text-hint">Your instructions. Guard rails and SQL instructions are automatically appended and cannot be edited.</p>
                  <span className="badge badge-gray">{instruction.length} characters</span>
                </div>
                <details className="mt-3 border border-gray-200 rounded-lg bg-gray-50">
                  <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer select-none flex items-center justify-between gap-2">
                    <span>Guard rails (automatically applied — not editable)</span>
                    <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">The following is always appended to your instruction. You cannot change it.</p>
                    <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-white p-4 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto" aria-readonly>
                      {GUARD_RAILS_DISPLAY_TEXT}
                    </pre>
                  </div>
                </details>
                <details className="mt-3 border border-gray-200 rounded-lg bg-gray-50">
                  <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer select-none flex items-center justify-between gap-2">
                    <span>SQL instructions (automatically applied — not editable)</span>
                    <Code className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">The following SQL rules are always appended to your instruction. You cannot change it.</p>
                    <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-white p-4 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto" aria-readonly>
                      {SQL_INSTRUCTIONS_DISPLAY_TEXT}
                    </pre>
                  </div>
                </details>
              </div>
            </div>

            {/* Currency */}
            <div className="card">
              <div className="card-header">
                <h2 className="section-title flex items-center gap-2">
                  <Banknote className="w-4 h-4" />
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

            {/* Maximum bytes billed */}
            <div className="card">
              <div className="card-header border-b-0 pb-0">
                <label className="text-label text-gray-600 flex items-center gap-2">
                  Maximum bytes billed
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium cursor-help"
                    title="Limits the bytes billed for this query. If this query will have bytes billed beyond this limit, the query will fail (without incurring a charge). If not specified, the bytes billed will be set to the project default."
                  >
                    ?
                  </span>
                </label>
              </div>
              <div className="card-body pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={maxBytesBilled}
                    onChange={(e) => setMaxBytesBilled(e.target.value)}
                    className="input-field w-32"
                    placeholder="0"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Limits the bytes billed for this query. If this query will have bytes billed beyond this limit, the query will fail (without incurring a charge). If not specified (0), the bytes billed will be set to the project default.
                </p>
              </div>
            </div>

            {/* Data Sources */}
            <div className="card">
              <div className="card-header">
                <h2 className="section-title flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Data Sources <span className="normal-case">(BigQuery)</span>
                </h2>
              </div>
              <div className="card-body">
                <div className="mb-4">
                  <label className="text-label mb-2 flex items-center gap-2">
                    <img 
                      src="/org.png" 
                      alt="" 
                      className="w-4 h-4 flex-shrink-0" 
                      style={{ display: 'inline-block', verticalAlign: 'middle' }}
                      onError={(e) => { 
                        console.error('Failed to load org.png'); 
                        e.target.style.display = 'none';
                      }} 
                    />
                    <span>Organization ID (Optional)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      placeholder="e.g. 123456789"
                      className="input-field flex-1 min-w-0 max-w-md"
                    />
                    <button
                      type="button"
                      onClick={handleLoadOrgProjects}
                      disabled={!orgId.trim() || loadingOrgProjects}
                      className="btn-secondary h-10 px-4 flex items-center gap-2"
                    >
                      {loadingOrgProjects ? <Spinner size="sm" /> : null}
                      {loadingOrgProjects ? 'Loading...' : 'Load Projects'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Enter organization ID to load all projects under it. You can still manually enter a project ID below.</p>
                </div>
                {orgProjects.length > 0 && (
                  <div className="mb-4">
                    <label className="text-label mb-2 flex items-center gap-2">
                      <Folder className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      Select Project from Organization
                    </label>
                    <select
                      value={gcpProjectId}
                      onChange={(e) => handleOrgProjectSelect(e.target.value)}
                      className="input-field w-full max-w-md"
                    >
                      <option value="">-- Select a project --</option>
                      {orgProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id} {p.name ? `(${p.name})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Or manually enter a project ID below.</p>
                  </div>
                )}
                <div className="mb-4">
                  <label className="text-label mb-2 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    GCP Project ID {orgProjects.length > 0 ? '(or select from above)' : ''}
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
                  <div className="mb-4 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-label">
                        Tables (add one or more from the project above)
                      </label>
                      <button
                        type="button"
                        onClick={addSource}
                        className="btn-secondary text-sm h-9 px-3 flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        Add another table
                      </button>
                    </div>
                    {sources.map((source) => {
                      const tablesKey = `${source.project || ''}/${source.dataset || ''}`;
                      const tableIds = (source.project && source.dataset && cache.tablesByPD[tablesKey]) || [];
                      const hasTable = !!(source.project && source.dataset && source.table);
                      const isSchemaOpen = schemaOpenSourceId === source.id;
                      const showSchemaContent = isSchemaOpen && hasTable;
                      return (
                        <div
                          key={source.id}
                          className="border border-gray-200 rounded-lg bg-gray-50/50 overflow-hidden"
                        >
                          <div className="flex flex-wrap items-end gap-4 p-4">
                            <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="min-w-0">
                                <label className="text-label mb-1.5 block text-xs font-medium text-gray-600">
                                  Dataset
                                </label>
                                <select
                                  value={source.dataset}
                                  onChange={(e) => handleSourceDatasetChange(source.id, e.target.value)}
                                  className="input-field w-full min-w-0"
                                >
                                  <option value="">Select dataset</option>
                                  {gcpDatasets.map((d) => (
                                    <option key={d} value={d}>
                                      {d}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="min-w-0">
                                <label className="text-label mb-1.5 block text-xs font-medium text-gray-600">
                                  Table
                                </label>
                                <select
                                  value={source.table}
                                  onChange={(e) => handleSourceTableChange(source.id, e.target.value)}
                                  className="input-field w-full min-w-0"
                                  disabled={!source.dataset}
                                >
                                  <option value="">Select table</option>
                                  {tableIds.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {hasTable && (
                                <button
                                  type="button"
                                  onClick={() => setSchemaOpenSourceId((id) => (id === source.id ? null : source.id))}
                                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex items-center gap-1.5 text-sm"
                                  title={isSchemaOpen ? 'Hide schema' : 'Show schema'}
                                >
                                  <Table className="w-4 h-4" />
                                  {isSchemaOpen ? 'Hide schema' : 'Show schema'}
                                  {showSchemaContent && loadingTableSchema && <Spinner size="sm" className="ml-1" />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeSource(source.id)}
                                disabled={sources.length <= 1}
                                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-40 disabled:pointer-events-none transition-colors"
                                title={sources.length <= 1 ? 'At least one table source is required' : 'Remove this table'}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {showSchemaContent && (
                            <div className="border-t border-gray-200 px-4 pb-4 pt-2 bg-white">
                              {loadingTableSchema && (
                                <p className="text-sm text-gray-500">Loading schema…</p>
                              )}
                              {!loadingTableSchema && tableSchemaError && (
                                <p className="text-sm text-red-600">{tableSchemaError}</p>
                              )}
                              {!loadingTableSchema && !tableSchemaError && tableSchema?.fields?.length > 0 && (
                                <>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-xs text-gray-500">
                                      Use these field names in your instructions for more accurate answers.
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={handleCopySchema}
                                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1.5 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                        title="Copy full table schema (JSON)"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy schema
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCopySchemaForInstructions}
                                        className="text-xs text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1.5 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                        title="Copy schema in a format you can paste into instructions"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy for instructions
                                      </button>
                                    </div>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
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
                              {!loadingTableSchema && !tableSchemaError && tableSchema && (!tableSchema.fields || tableSchema.fields.length === 0) && (
                                <p className="text-sm text-gray-500">No schema fields returned.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                    disabled={!agentId.trim() || status.includes('Creating') || loadingAgentId}
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
