// API utility functions - preserving exact API connections

/** Normalize URL: add https:// if missing scheme */
const normalizeBase = (url) => {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
};

export const getApiBase = () => {
  const raw =
    localStorage.getItem('apiBase') ||
    import.meta.env.VITE_API_BASE_URL ||
    'http://localhost:8080';
  return normalizeBase(raw);
};

export const setApiBase = (base) => {
  localStorage.setItem('apiBase', base);
};

/** Clear stored override; next getApiBase() will use env var or localhost */
export const clearApiBaseOverride = () => {
  localStorage.removeItem('apiBase');
};

export const apiRequest = async (endpoint, options = {}) => {
  const base = getApiBase();
  const url = `${base}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    // Check if response is ok before parsing
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { detail: errorText || `HTTP ${response.status}` };
      }
      
      // Extract the most user-friendly error message
      let errorMessage = errorData.detail || 'Request failed';
      
      // Handle Google API error format
      if (errorData.error) {
        if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (errorData.error.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.error.detail) {
          errorMessage = errorData.error.detail;
        }
      }
      
      throw new Error(errorMessage);
    }
    
    // Parse JSON response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    } else {
      // If not JSON, return as text
      const text = await response.text();
      return text;
    }
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
};

// Agent Management APIs
export const loadAgents = async () => {
  return apiRequest('/api/agents');
};

export const describeAgent = async (id) => {
  return apiRequest(`/api/agents/${id}`);
};

export const saveAgentInstruction = async (id, instruction) => {
  return apiRequest(`/api/agents/${id}/instruction`, {
    method: 'PATCH',
    body: JSON.stringify({ instruction }),
  });
};

export const updateProfileLabel = async (profileKey, label) => {
  return apiRequest(`/api/profiles/${encodeURIComponent(profileKey)}`, {
    method: 'PATCH',
    body: JSON.stringify({ label }),
  });
};

export const updateAgentLabel = async (agentId, label) => {
  return apiRequest(`/api/agents/${encodeURIComponent(agentId)}/label`, {
    method: 'PATCH',
    body: JSON.stringify({ label }),
  });
};

export const generateAgentId = async () => {
  const data = await apiRequest('/api/agents/generate-id');
  return data?.agentId || null;
};

export const createAgent = async (payload) => {
  return apiRequest('/api/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const removeProfile = async (profileKey) => {
  return apiRequest(`/api/profiles/${encodeURIComponent(profileKey)}`, {
    method: 'DELETE',
  });
};

export const deleteAgent = async (agentId, agentPath = null) => {
  // If agent_path is provided, add it as a query parameter to bypass lookup
  // This helps with newly created agents that might not be in cache yet
  let url = `/api/agents/${encodeURIComponent(agentId)}`;
  if (agentPath) {
    url += `?agent_path=${encodeURIComponent(agentPath)}`;
  }
  
  return apiRequest(url, {
    method: 'DELETE',
  });
};

// Chat APIs
export const loadSources = async (forceRefresh = false) => {
  const url = forceRefresh ? '/api/sources?force_refresh=true' : '/api/sources';
  return apiRequest(url);
};

export const sendChatMessage = async (profile, message, history, maxTurns = 6, agentPath = null) => {
  const body = {
    message,
    history: history.slice(-10),
    maxTurns: maxTurns,
  };
  
  // If agentPath is provided (for GCP agents), use agent field
  // Otherwise use profile field (for local agents)
  if (agentPath) {
    body.agent = agentPath;
  } else {
    body.profile = profile;
  }
  
  return apiRequest('/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

/**
 * Streaming chat: calls /api/chat/stream, parses SSE events, and invokes callbacks.
 * @param {Object} params - Same as sendChatMessage
 * @param {Function} onCotStep - Called with { chainOfThought } when a new CoT step arrives
 * @param {Function} onDone - Called with full response (answer, artifacts, chainOfThought, etc.) when complete
 * @param {Function} onError - Called with error message on failure
 */
export const sendChatMessageStream = async (
  profile,
  message,
  history,
  maxTurns = 6,
  agentPath = null,
  { onCotStep, onDone, onError }
) => {
  const base = getApiBase();
  const url = `${base}/api/chat/stream`;
  const body = {
    message,
    history: (history || []).slice(-10),
    maxTurns: maxTurns ?? 6,
  };
  if (agentPath) {
    body.agent = agentPath;
  } else {
    body.profile = profile;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    let msg = errText;
    try {
      const err = JSON.parse(errText);
      msg = err.detail || err.message || err.error?.message || errText;
    } catch (_) {}
    onError?.(msg);
    throw new Error(msg);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:') && currentEvent) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (currentEvent === 'cot_step') {
              onCotStep?.(data);
            } else if (currentEvent === 'done') {
              onDone?.(data);
            } else if (currentEvent === 'error') {
              onError?.(data?.message || 'Stream error');
            }
          } catch (_) {}
          currentEvent = null;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

// BigQuery APIs
export const listBQProjects = async () => {
  return apiRequest('/api/bq/projects');
};

export const listOrgProjects = async (orgId) => {
  return apiRequest(`/api/bq/organizations/${encodeURIComponent(orgId)}/projects`);
};

export const listBQDatasets = async (project) => {
  return apiRequest(`/api/bq/datasets?project=${encodeURIComponent(project)}`);
};

export const listBQTables = async (project, dataset) => {
  return apiRequest(`/api/bq/tables?project=${encodeURIComponent(project)}&dataset=${encodeURIComponent(dataset)}`);
};

export const getBQTableSchema = async (project, dataset, table) => {
  return apiRequest(
    `/api/bq/table-schema?project=${encodeURIComponent(project)}&dataset=${encodeURIComponent(dataset)}&table=${encodeURIComponent(table)}`
  );
};
