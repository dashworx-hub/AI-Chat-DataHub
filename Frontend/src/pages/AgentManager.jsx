import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Plus, Eye, Edit, Trash2, Save, X, FileText, Bot, ChevronRight, Clock, ShieldCheck, Code } from 'lucide-react';
import Spinner from '../components/Spinner';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Toast from '../components/Toast';
import LabelEditModal from '../components/LabelEditModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import {
  loadAgents,
  describeAgent,
  saveAgentInstruction,
  updateProfileLabel,
  updateAgentLabel,
  removeProfile,
  deleteAgent,
} from '../utils/api';
import { GUARD_RAILS_DELIMITER, GUARD_RAILS_DISPLAY_TEXT } from '../constants/guardRails';
import { SQL_INSTRUCTIONS_DISPLAY_TEXT } from '../constants/sqlInstructions';
import { CURRENCIES, getCurrency, getCurrencyForAgent, setCurrencyForAgent } from '../utils/currency';

function getUserInstructionFromFull(fullInstruction) {
  if (!fullInstruction || typeof fullInstruction !== 'string') return '';
  // Split on guard rails delimiter (comes first, before SQL instructions)
  const parts = fullInstruction.split(GUARD_RAILS_DELIMITER, 2);
  return parts.length >= 2 ? parts[0].trim() : fullInstruction;
}

const AgentManager = () => {
  const [agents, setAgents] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(null);
  const [currentDescribe, setCurrentDescribe] = useState(null);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [instruction, setInstruction] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const [agentCurrency, setAgentCurrency] = useState(getCurrency());
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [loading, setLoading] = useState(false);
  const [gcpStatus, setGcpStatus] = useState({ status: 'unknown', error: null });
  const [labelModal, setLabelModal] = useState({ show: false, agent: null, profileKey: null });
  const [deleteModal, setDeleteModal] = useState({ show: false, agent: null, profileKey: null });
  
  // Calculate source counts
  const gcpCount = agents.filter(a => a.source === 'gcp').length;
  const localCount = agents.filter(a => a.source === 'local').length;

  const isBusy = loading || /loading|saving|deleting|removing|updating/i.test(status || '');
  const isError = /^error/i.test(status || '');

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
  };

  const loadAgentsList = useCallback(async () => {
    setLoading(true);
    setStatus('Loading...');
    try {
      const response = await loadAgents();
      
      // Handle both old format (array) and new format (object with agents and meta)
      let agentsList, meta;
      if (Array.isArray(response)) {
        // Old format: just an array
        agentsList = response;
        meta = { 
          gcp_status: 'unknown',
          gcp_error: null,
          gcp_count: agentsList.filter(a => a && a.source === 'gcp').length,
          local_count: agentsList.filter(a => a && a.source === 'local').length
        };
      } else if (response && typeof response === 'object' && response.agents) {
        // New format: object with agents and meta
        agentsList = response.agents || [];
        meta = response.meta || { 
          gcp_status: 'unknown',
          gcp_error: null,
          gcp_count: 0,
          local_count: agentsList.length
        };
      } else {
        throw new Error('Invalid response format from server');
      }
      
      if (!Array.isArray(agentsList)) {
        console.error('Agents data is not an array:', agentsList);
        throw new Error('Invalid data format: agents is not an array');
      }
      
      setAgents(agentsList);
      setFiltered(agentsList);
      setSelected(null);
      setCurrentDescribe(null);
      setInstruction('');
      
      // Set GCP status for display
      setGcpStatus({
        status: meta.gcp_status || 'unknown',
        error: meta.gcp_error || null
      });
      
      // Show error toast if GCP fetch failed
      if (meta.gcp_status === 'failed' && meta.gcp_error) {
        showToast(`GCP fetch failed: ${meta.gcp_error}`, 'error');
        setStatus(`Ready (GCP failed: ${meta.gcp_error.substring(0, 50)}...)`);
      } else if (meta.gcp_status === 'empty') {
        showToast('GCP returned 0 agents. Showing local agents only.', 'warning');
        setStatus('Ready (No GCP agents found)');
      } else if (meta.gcp_status === 'success') {
        setStatus('Ready');
      } else {
        setStatus('Ready');
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
      showToast(`Error: ${e.message}`, 'error');
      setGcpStatus({ status: 'failed', error: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgentsList();
  }, [loadAgentsList]);

  useEffect(() => {
    if (!filter.trim()) {
      setFiltered(agents);
      return;
    }
    const q = filter.toLowerCase().trim();
    const filteredList = agents.filter((a) => {
      const id = a.agent.split('/').pop().toLowerCase();
      const label = (a.label || a.key || '').toLowerCase();
      return id.includes(q) || label.includes(q);
    });
    setFiltered(filteredList);
  }, [filter, agents]);

  const handleDescribeAgent = async (id, pathFromList) => {
    setStatus('Loading...');
    try {
      const data = await describeAgent(id);
      setCurrentDescribe(data);
      setSelected({ id, path: pathFromList });
      const fullInstr =
        data.dataAnalyticsAgent?.publishedContext?.systemInstruction || '';
      setInstruction(getUserInstructionFromFull(fullInstr));
      setAgentCurrency(getCurrencyForAgent(id) || getCurrency());

      // Extract "created at" from describe response (GCP typically returns createTime)
      const createTimeRaw =
        data?.dataAnalyticsAgent?.createTime ||
        data?.dataAnalyticsAgent?.metadata?.createTime ||
        data?.createTime ||
        null;
      if (createTimeRaw) {
        const dt = new Date(createTimeRaw);
        setCreatedAt(Number.isNaN(dt.getTime()) ? null : dt);
      } else {
        setCreatedAt(null);
      }
      
      // Load last updated timestamp from localStorage
      const savedTimestamp = localStorage.getItem(`instruction_updated_${id}`);
      if (savedTimestamp) {
        setLastUpdated(new Date(savedTimestamp));
      } else {
        setLastUpdated(null);
      }
      
      setStatus('Ready');
    } catch (e) {
      setStatus(`Error: ${e.message}`);
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setStatus('Saving...');
    try {
      await saveAgentInstruction(selected.id, instruction);
      
      // Save timestamp when instruction is successfully updated
      const now = new Date();
      localStorage.setItem(`instruction_updated_${selected.id}`, now.toISOString());
      setLastUpdated(now);
      
      setStatus('Saved');
      showToast('Instruction saved successfully', 'success');
      await handleDescribeAgent(selected.id, selected.path);
    } catch (e) {
      const errorMessage = e.message || 'Unknown error occurred';
      setStatus(`Error: ${errorMessage}`);
      showToast(`Failed to save instruction: ${errorMessage}`, 'error');
    }
  };

  const handleDiscard = () => {
    if (!currentDescribe) return;
    const fullInstr =
      currentDescribe.dataAnalyticsAgent?.publishedContext?.systemInstruction ||
      '';
    setInstruction(getUserInstructionFromFull(fullInstr));
    setStatus('Reverted');
    showToast('Changes discarded', 'info');
  };

  const handleEditLabel = (profileKey, agent) => {
    setLabelModal({ show: true, agent, profileKey });
  };

  const handleSaveLabel = async (label) => {
    if (!label || !label.trim()) {
      showToast('Label cannot be empty', 'error');
      return;
    }

    const { agent, profileKey } = labelModal;
    setLabelModal({ show: false, agent: null, profileKey: null });
    setStatus('Updating...');

    try {
      // Extract agent ID from agent path (last segment)
      const agentPath = agent.agent || '';
      const agentId = agentPath.split('/').pop() || profileKey;
      
      // If it's a local agent (exists in PROFILES), use the profile endpoint
      // Otherwise, use the agent label endpoint (works for both local and GCP)
      if (agent.source === 'local') {
        await updateProfileLabel(profileKey, label);
      } else {
        // For GCP agents or agents not in PROFILES, use agent label endpoint
        await updateAgentLabel(agentId, label);
      }
      
      showToast('Label updated successfully', 'success');
      loadAgentsList();
    } catch (e) {
      setStatus('Error');
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const handleCloseLabelModal = () => {
    setLabelModal({ show: false, agent: null, profileKey: null });
  };

  const handleRemoveProfile = (profileKey, agent) => {
    // Show delete confirmation modal
    setDeleteModal({ show: true, agent, profileKey });
  };

  const handleDeleteConfirm = async () => {
    const { agent, profileKey } = deleteModal;
    if (!agent) return;

    // Close modal
    setDeleteModal({ show: false, agent: null, profileKey: null });

    // Handle GCP agents - delete from GCP
    if (agent.source === 'gcp') {
      const agentPath = agent.agent || '';
      const agentId = agentPath.split('/').pop() || profileKey;
      
      setStatus('Deleting from GCP...');
      try {
        // Pass agent_path to bypass lookup (helps with newly created agents)
        await deleteAgent(agentId, agentPath);
        showToast('Agent deleted successfully from GCP', 'success');
        loadAgentsList();
      } catch (e) {
        setStatus('Error');
        const errorMsg = e.message || 'Delete failed';
        showToast(errorMsg, 'error');
      }
      return;
    }
    
    // Handle local agents - remove from ca_profiles.json
    setStatus('Removing...');
    try {
      await removeProfile(profileKey);
      showToast('Removed from list', 'success');
      loadAgentsList();
    } catch (e) {
      setStatus('Error');
      const errorMsg = e.message || 'Remove failed';
      // Provide more helpful error message
      if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        showToast('Profile not found in ca_profiles.json. It may have already been removed.', 'error');
      } else {
        showToast(errorMsg, 'error');
      }
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({ show: false, agent: null, profileKey: null });
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden page-enter">
      <Header title="Agent Manager" />
      <main className="flex-1 overflow-hidden px-6 py-6">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-5 min-w-0">
          {/* Left: Agents list */}
          <section className="lg:col-span-5 h-full flex flex-col min-w-0 overflow-hidden">
            <div className="card h-full flex flex-col min-w-0 overflow-hidden">
              <div className="card-header">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="section-title mb-1">Agents</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      {gcpStatus.status === 'failed' && (
                        <button
                          onClick={() => {
                            const errorMsg = gcpStatus.error || 'Unknown error occurred';
                            showToast(`GCP Error: ${errorMsg}`, 'error');
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs cursor-pointer hover:opacity-80 transition-opacity"
                          title={`Click to see error: ${gcpStatus.error || "GCP fetch failed"}`}
                        >
                          GCP Failed
                        </button>
                      )}
                      {gcpStatus.status === 'empty' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs" title="GCP returned 0 agents">
                          GCP Empty
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadAgentsList}
                      disabled={loading}
                      className="btn-secondary h-9 px-3"
                    >
                      {loading ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <Link
                      to="/create"
                      className="btn-primary h-9 px-3"
                    >
                      <Plus className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
              <div className="card-body flex-1 flex flex-col min-h-0 overflow-hidden space-y-4">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="input-field pl-9"
                      placeholder="Filter by label or ID..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {gcpCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                        <img src="/g_cloud/icons8-google-cloud-48.svg" alt="" className="w-4 h-4" />
                        {gcpCount}
                      </span>
                    )}
                    {localCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 text-xs">
                        {localCount} Local
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto scrollbar-thin min-h-0">
                  {filtered.length === 0 ? (
                    <div className="text-center py-12">
                      {loading ? (
                        <>
                          <Spinner size="lg" className="mb-3" />
                          <p className="text-sm text-gray-500">Loading agents...</p>
                        </>
                      ) : (
                        <>
                          <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                          <p className="text-sm text-gray-500">No agents found.</p>
                        </>
                      )}
                    </div>
                  ) : (
                    filtered.map((agent, idx) => {
                      const id = agent.agent.split('/').pop();
                      const key = agent.key || id;
                      const isSelected = selected?.id === id;

                      return (
                        <div
                          key={id}
                          className={`group relative p-4 border rounded-xl cursor-pointer transition-all duration-200 fade-in ${
                            isSelected
                              ? 'border-[#3E0AC2]/30 bg-[#3E0AC2]/5 shadow-sm border-l-2 border-l-[#3E0AC2]'
                              : 'border-gray-200 bg-white'
                          }`}
                          style={{ animationDelay: `${idx * 0.03}s` }}
                          onClick={() => handleDescribeAgent(id, agent.agent)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Bot className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <div className="font-semibold text-sm text-gray-900 truncate">
                                  {agent.label || agent.key}
                                </div>
                                {agent.source === 'gcp' && (
                                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                                    <img src="/g_cloud/icons8-google-cloud-48.svg" alt="" className="w-4 h-4" />
                                  </span>
                                )}
                                {agent.source === 'local' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                                    Local
                                  </span>
                                )}
                                <span className="badge badge-gray text-mono">
                                  {id.slice(0, 8)}...
                                </span>
                              </div>
                              <div className="text-mono text-xs text-gray-500 truncate ml-6">
                                {agent.agent}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDescribeAgent(id, agent.agent);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="View details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditLabel(key, agent);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="Edit label"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              <ChevronRight className="w-5 h-5 text-blue-600" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Right: Details */}
          <section className="lg:col-span-7 h-full flex flex-col min-w-0 overflow-hidden">
            <div className="card h-full flex flex-col min-w-0 overflow-hidden">
              <div className="card-header flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <h2 className="section-title">Agent Details</h2>
                    {createdAt && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                        <Clock className="w-3 h-3" />
                        <span>Created: {createdAt.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <div className="status-indicator">
                    {isBusy ? (
                      <Spinner size="sm" className="text-[#3E0AC2]" />
                    ) : (
                      <div className={`status-dot ${isError ? 'offline' : 'online'}`}></div>
                    )}
                    <span className="text-xs font-medium text-gray-600">
                      {isError ? 'Error' : isBusy ? 'Syncing...' : 'Synced'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="card-body flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                {!selected ? (
                  <div className="text-center py-16">
                    <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <p className="text-sm font-medium text-gray-900 mb-1">No agent selected</p>
                    <p className="text-sm text-gray-500">Select an agent from the list to view and edit its details.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="border-b border-gray-200 pb-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <label className="text-label mb-1 block">System Instruction</label>
                          <p className="text-hint">
                            Edit your instructions only. Guard rails and SQL instructions are appended automatically and cannot be edited.
                          </p>
                          {lastUpdated && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400 italic">
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              <span>Last updated: {lastUpdated.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        <span className="badge badge-gray">{instruction.length} characters</span>
                      </div>
                      <textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        className="input-field resize-y min-h-[192px] max-h-[min(70vh,600px)]"
                        placeholder="Enter the agent's system instruction..."
                      />
                      <details className="mt-4 border border-gray-200 rounded-lg bg-gray-50">
                        <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer select-none flex items-center justify-between gap-2">
                          <span>Guard rails (automatically applied — not editable)</span>
                          <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </summary>
                        <div className="px-4 pb-4 pt-1 border-t border-gray-200">
                          <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-white p-4 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto" aria-readonly>
                            {GUARD_RAILS_DISPLAY_TEXT}
                          </pre>
                        </div>
                      </details>
                      <details className="mt-4 border border-gray-200 rounded-lg bg-gray-50">
                        <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer select-none flex items-center justify-between gap-2">
                          <span>SQL instructions (automatically applied — not editable)</span>
                          <Code className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </summary>
                        <div className="px-4 pb-4 pt-1 border-t border-gray-200">
                          <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-white p-4 rounded border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto" aria-readonly>
                            {SQL_INSTRUCTIONS_DISPLAY_TEXT}
                          </pre>
                        </div>
                      </details>
                    </div>

                    <div>
                      <label className="text-label mb-2 block">Currency for responses</label>
                      <p className="text-hint mb-2">
                        Numbers in this agent&apos;s chat responses will be formatted with this currency.
                      </p>
                      <select
                        value={agentCurrency.code}
                        onChange={(e) => {
                          const c = CURRENCIES.find((x) => x.code === e.target.value);
                          if (c && selected) {
                            setCurrencyForAgent(selected.id, c);
                            setAgentCurrency(c);
                            showToast(`Currency set to ${c.name}`, 'success');
                            window.dispatchEvent(new Event('currencyChanged'));
                          }
                        }}
                        className="input-field w-full max-w-xs"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.symbol} - {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-3 pt-4">
                      <button
                        onClick={handleSave}
                        className="btn-primary"
                      >
                        <Save className="w-4 h-4" />
                        Save Instruction
                      </button>
                      <button
                        onClick={handleDiscard}
                        className="btn-secondary"
                      >
                        <X className="w-4 h-4" />
                        Discard Changes
                      </button>
                    </div>

                    <div className="mt-6 pt-6 border-t border-red-200 rounded-lg bg-red-50/50 border px-4 py-4">
                      <h3 className="text-sm font-semibold text-red-800 mb-2">Danger zone</h3>
                      <p className="text-xs text-red-700/90 mb-3">
                        Deleting this agent cannot be undone.
                        {filtered.find((a) => a.agent.split('/').pop() === selected?.id)?.source === 'gcp'
                          ? ' For GCP agents, the agent will be removed from Google Cloud Platform.'
                          : ' For local agents, it will be removed from ca_profiles.json.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const agent = filtered.find((a) => a.agent.split('/').pop() === selected?.id);
                          const key = agent?.key || agent?.agent?.split('/').pop() || selected?.id;
                          if (agent) handleRemoveProfile(key, agent);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete agent
                      </button>
                    </div>
                  </div>
                )}
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
      <LabelEditModal
        show={labelModal.show}
        onClose={handleCloseLabelModal}
        currentLabel={labelModal.agent?.label || labelModal.agent?.key || ''}
        onSave={handleSaveLabel}
        agentName={labelModal.agent?.agent || labelModal.agent?.key || ''}
      />

      <DeleteConfirmModal
        show={deleteModal.show}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        agentName={deleteModal.agent?.label || deleteModal.agent?.key || 'Unknown'}
        isGcpAgent={deleteModal.agent?.source === 'gcp'}
      />
    </div>
  );
};

export default AgentManager;
