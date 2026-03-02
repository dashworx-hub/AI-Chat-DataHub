// API utility functions - preserving exact API connections

export const getApiBase = () => {
  return localStorage.getItem('apiBase') || 'http://localhost:8080';
};

export const setApiBase = (base) => {
  localStorage.setItem('apiBase', base);
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

// BigQuery APIs
export const listBQProjects = async () => {
  return apiRequest('/api/bq/projects');
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
