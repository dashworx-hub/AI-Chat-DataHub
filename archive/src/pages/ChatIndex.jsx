import { useState, useEffect, useRef } from 'react';
import { Trash2, Database, AlertCircle, ChevronDown, Cloud, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Toast from '../components/Toast';
import { loadSources, sendChatMessage } from '../utils/api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import vegaEmbed from 'vega-embed';
import { formatNumbersInText, getCurrencyForContext } from '../utils/currency';

const ChartGallery = ({ charts, messageIdx, onRenderChart }) => {
  const containerRefs = useRef({});
  
  useEffect(() => {
    if (!charts || charts.length === 0) return;
    
    // Use requestAnimationFrame to ensure DOM is ready, then render
    const renderCharts = () => {
      charts.forEach((spec, chartIdx) => {
        const chartId = `chart-${messageIdx}-${chartIdx}`;
        const container = containerRefs.current[chartId] || document.getElementById(chartId);
        
        if (container) {
          // Check if chart already exists
          const existingChart = container.querySelector('canvas, svg');
          if (!existingChart) {
            // Validate spec is an object before rendering
            if (spec && typeof spec === 'object') {
              onRenderChart(spec, chartId);
            } else if (process.env.NODE_ENV === 'development') {
              console.warn('Invalid chart spec:', chartId, spec);
            }
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.warn('Container not found:', chartId);
        }
      });
    };
    
    // Wait for next frame to ensure DOM is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(renderCharts, 100);
      });
    });
  }, [charts, messageIdx, onRenderChart]);

  if (!charts || charts.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4">
      {charts.map((spec, chartIdx) => {
        const chartId = `chart-${messageIdx}-${chartIdx}`;
        return (
          <div
            key={`${messageIdx}-${chartIdx}`}
            className="bg-white border border-gray-200 rounded-lg p-4 min-h-[400px] w-full overflow-hidden"
          >
            <div
              ref={(el) => {
                if (el) {
                  containerRefs.current[chartId] = el;
                }
              }}
              id={chartId}
              className="w-full overflow-hidden"
              style={{ minHeight: '400px', width: '100%', maxWidth: '100%' }}
            />
          </div>
        );
      })}
    </div>
  );
};

const ChatIndex = () => {
  const [sources, setSources] = useState([]);
  const [sourcesMeta, setSourcesMeta] = useState({ gcp_count: 0, local_count: 0, gcp_status: 'unknown' });
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState('');
  const [requestStartTime, setRequestStartTime] = useState(null);
  const [messageThoughtTimes, setMessageThoughtTimes] = useState({}); // Store thought time for each message index
  const [artifacts, setArtifacts] = useState({
    sql: 'No SQL.',
  });
  // Store charts for each message by message index
  const [messageCharts, setMessageCharts] = useState({});
  const [sqlError, setSqlError] = useState(null);
  const [sourcesError, setSourcesError] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const chatEndRef = useRef(null);
  const chatScrollRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
  };

  useEffect(() => {
    loadSourcesList();
    
    // Listen for currency changes
    const handleCurrencyChange = () => {
      // Force re-render of messages to apply new currency formatting
      setHistory(prev => [...prev]);
    };
    
    window.addEventListener('currencyChanged', handleCurrencyChange);
    return () => {
      window.removeEventListener('currencyChanged', handleCurrencyChange);
    };
  }, []);

  useEffect(() => {
    // Only scroll within the chat container, not the entire page
    // Use a small delay to ensure DOM is updated (especially for charts)
    const scrollToBottom = () => {
      if (chatScrollRef.current && chatEndRef.current) {
        const scrollContainer = chatScrollRef.current;
        const scrollTarget = chatEndRef.current;
        
        // Calculate the position relative to the scroll container
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = scrollTarget.getBoundingClientRect();
        
        // Scroll to the target within the container
        const scrollTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 20; // 20px padding
        
        scrollContainer.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });
      }
    };
    
    // Small delay to ensure charts and content are rendered
    const timeoutId = setTimeout(scrollToBottom, 100);
    
    return () => clearTimeout(timeoutId);
  }, [history, isTyping, artifacts.charts]);

  const loadSourcesList = async (forceRefresh = false) => {
    try {
      setSourcesError(false);
      setLoadingSources(true);
      const response = await loadSources(forceRefresh);
      
      // Handle both old format (array) and new format (object with sources and meta)
      let data, meta;
      if (Array.isArray(response)) {
        // Old format: just an array
        data = response;
        meta = { 
          gcp_count: data.filter(s => s && s.source === 'gcp').length, 
          local_count: data.filter(s => s && s.source === 'local').length, 
          gcp_status: 'unknown' 
        };
      } else if (response && typeof response === 'object') {
        // New format: object with sources and meta
        data = response.sources;
        meta = response.meta || { 
          gcp_count: 0, 
          local_count: Array.isArray(data) ? data.length : 0, 
          gcp_status: 'unknown' 
        };
      } else {
        throw new Error('Invalid response format from server');
      }
      
      if (!Array.isArray(data)) {
        console.error('Sources data is not an array:', data);
        throw new Error('Invalid data format: sources is not an array');
      }
      
      if (!data.length) {
        throw new Error('No data sources returned.');
      }
      
      setSources(data);
      setSourcesMeta(meta);
      
      if (data[0]?.key) {
        setSelectedProfile(data[0].key);
      }
      
      // Show status message based on GCP fetch result
      if (forceRefresh) {
        if (meta.gcp_status === 'failed') {
          const errorMsg = meta.gcp_error || 'Unknown error';
          showToast(`GCP fetch failed: ${errorMsg}`, 'error');
        } else if (meta.gcp_status === 'empty') {
          showToast('GCP returned 0 data sources. Using local sources as fallback.', 'warning');
        } else if (meta.gcp_status === 'success') {
          showToast(`Loaded ${meta.gcp_count} sources from GCP`, 'success');
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading sources:', e);
      }
      setSourcesError(true);
      showToast('Failed to load data sources', 'error');
    } finally {
      setLoadingSources(false);
    }
  };

  const looksLikeMarkdown = (s) => {
    if (!s) return false;
    const hasHeading = /^#{1,6}\s+\S/m.test(s);
    const hasList = /^\s*[-*+]\s+\S/m.test(s) || /^\s*\d+\.\s+\S/m.test(s);
    const hasBoldItalics = /(\*\*.+\*\*|\*.+\*|_.+_)/.test(s);
    const hasCode = /```[\s\S]*?```/.test(s) || /`[^`]+`/.test(s);
    // Check for markdown tables (pipe syntax with header separator like |---|)
    const hasTable = /\|.+\|/m.test(s) && (/\|[\s-:]+\|/m.test(s) || s.split('\n').some(line => line.trim().match(/^\|.+\|$/) && line.includes('|')));
    return hasHeading || hasList || hasBoldItalics || hasCode || hasTable;
  };

  const selectedAgentId = selectedProfile
    ? (sources.find((s) => s.key === selectedProfile)?.agent?.split('/').pop() || selectedProfile?.split('/').pop() || selectedProfile)
    : null;
  const chatCurrency = getCurrencyForContext(selectedAgentId);

  const renderMarkdown = (text) => {
    if (!text) return null;
    
    // Format numbers with currency and make them bold before rendering (per-agent currency)
    const formattedText = formatNumbersInText(text, chatCurrency);
    
    if (looksLikeMarkdown(formattedText)) {
      // Sanitize markdown HTML with strict DOMPurify configuration
      const rawHtml = marked.parse(formattedText || '');
      const html = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'title', 'class'],
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        KEEP_CONTENT: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_TRUSTED_TYPE: false,
      });
      return (
        <div className="prose max-w-none overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
    // Escape user text to prevent XSS (but keep formatted numbers)
    return <div className="whitespace-pre-wrap">{String(formattedText || '').replace(/[<>]/g, (char) => char === '<' ? '&lt;' : '&gt;')}</div>;
  };

  const renderVegaChart = async (spec, containerId) => {
    try {
      // Security: Ensure VEGA_DEBUG is not enabled in production (XSS vulnerability)
      if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined' && window.VEGA_DEBUG) {
        console.error('Security: VEGA_DEBUG is enabled in production - this is a security risk');
        // Don't render charts if VEGA_DEBUG is enabled in production
        return;
      }
      
      // Validate chart spec structure before rendering
      if (!spec || typeof spec !== 'object') {
        if (process.env.NODE_ENV === 'development') {
          console.error('Invalid chart spec: not an object', spec);
        }
        return;
      }
      
      if (!spec.data) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Invalid chart spec: missing data', spec);
        }
        return;
      }
      
      // Validate that spec only contains expected Vega-Lite properties
      const allowedKeys = ['$schema', 'data', 'mark', 'encoding', 'width', 'height', 'title', 'transform', 'layer', 'hconcat', 'vconcat', 'repeat', 'facet', 'resolve', 'config', 'autosize', 'background', 'padding', 'usermeta'];
      const specKeys = Object.keys(spec);
      const invalidKeys = specKeys.filter(key => !allowedKeys.includes(key) && !key.startsWith('$'));
      if (invalidKeys.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn('Chart spec contains unexpected keys:', invalidKeys);
      }
      
      // Security: Block dangerous transforms that could lead to XSS
      // Block 'setdata' function which was vulnerable to XSS
      const checkTransforms = (transforms) => {
        if (!transforms || !Array.isArray(transforms)) return;
        for (const transform of transforms) {
          if (typeof transform === 'object' && transform !== null) {
            // Block setdata function (XSS vulnerability)
            if (transform.setdata !== undefined) {
              throw new Error('Security: setdata transform is not allowed');
            }
            // Recursively check nested transforms
            if (transform.transform) {
              checkTransforms(Array.isArray(transform.transform) ? transform.transform : [transform.transform]);
            }
          }
        }
      };
      
      // Check transforms at root level and in layers
      if (spec.transform) {
        checkTransforms(Array.isArray(spec.transform) ? spec.transform : [spec.transform]);
      }
      if (spec.layer && Array.isArray(spec.layer)) {
        spec.layer.forEach(layer => {
          if (layer.transform) {
            checkTransforms(Array.isArray(layer.transform) ? layer.transform : [layer.transform]);
          }
        });
      }
      
      // Security: Validate data sources are safe (no javascript: or data: URLs)
      if (spec.data) {
        const validateData = (data) => {
          if (typeof data === 'object' && data !== null) {
            // Check for URL data sources
            if (data.url && typeof data.url === 'string') {
              const url = data.url.toLowerCase().trim();
              if (url.startsWith('javascript:') || url.startsWith('data:') || url.startsWith('vbscript:')) {
                throw new Error('Security: Dangerous data URL detected');
              }
            }
            // Check for values array (should be safe, but validate structure)
            if (data.values && !Array.isArray(data.values)) {
              throw new Error('Security: Invalid data values format');
            }
          }
        };
        
        if (Array.isArray(spec.data)) {
          spec.data.forEach(validateData);
        } else {
          validateData(spec.data);
        }
      }
      
      // Determine appropriate height based on chart type
      const isBarChart = spec.mark === 'bar' || spec.mark?.type === 'bar';
      const hasManyCategories = spec.encoding?.x?.field || spec.encoding?.y?.field;
      const chartHeight = isBarChart && hasManyCategories ? 450 : 350;
      
      // Create a deep copy to avoid mutating the original spec
      const chartSpec = JSON.parse(JSON.stringify(spec));
      chartSpec.encoding = chartSpec.encoding || {};

      const enc = chartSpec.encoding;
      const isCat = (t) => t === 'nominal' || t === 'ordinal';
      if (!enc.color) {
        if (enc.x && isCat(enc.x.type)) {
          enc.color = { field: enc.x.field, type: enc.x.type, legend: null };
        } else if (enc.y && isCat(enc.y.type)) {
          enc.color = { field: enc.y.field, type: enc.y.type, legend: null };
        }
      }
      
      // Add compact number formatting for axes to save space
      // Format large numbers using financial notation (K, M, B, T) instead of SI (G for giga)
      const formatLargeNumbers = (encoding, axis) => {
        if (!encoding || !encoding.type || !axis || axis === false) {
          return;
        }
        
        // Handle temporal (date/time) fields separately - don't use number formatting
        if (encoding.type === 'temporal') {
          // Don't set format for temporal fields - let Vega-Lite use its default date formatting
          // Or use a readable date format if needed
          if (axis.format === undefined) {
            // Let Vega-Lite auto-format dates based on the data range
            // We can optionally set a format like: axis.format = '%Y-%m-%d'
            // But leaving it undefined allows Vega-Lite to choose the best format
          }
          // For dates, allow slight rotation if needed for readability
          if (axis.labelAngle === undefined) {
            axis.labelAngle = -45; // Rotate dates for better readability
          }
          if (axis.labelLimit === undefined) {
            axis.labelLimit = 120; // Allow more space for date labels
          }
          if (axis.labelFontSize === undefined) {
            axis.labelFontSize = 11;
          }
          return; // Don't apply number formatting to dates
        }
        
        // Handle quantitative (numeric) fields only
        if (encoding.type === 'quantitative') {
          if (!axis.format) {
            // Use a format that shows compact numbers
            // Format: use SI notation but we'll replace G with B in post-processing
            axis.format = '.1s'; // This will use G for billions, we'll replace it
          }
          // Reduce label angle and limit label length
          if (axis.labelAngle === undefined) {
            axis.labelAngle = 0;
          }
          if (axis.labelLimit === undefined) {
            axis.labelLimit = 80; // Limit label width in pixels
          }
          if (axis.labelFontSize === undefined) {
            axis.labelFontSize = 11; // Smaller font for compact display
          }
        }
      };
      
      // Apply formatting to both axes
      if (enc.x && enc.x.axis !== false) {
        if (!enc.x.axis) enc.x.axis = {};
        formatLargeNumbers(enc.x, enc.x.axis);
      }
      if (enc.y && enc.y.axis !== false) {
        if (!enc.y.axis) enc.y.axis = {};
        formatLargeNumbers(enc.y, enc.y.axis);
      }

      const container = document.getElementById(containerId);
      if (!container) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Chart container not found:', containerId);
        }
        return;
      }
      
      // Get parent container to calculate available space
      const parentContainer = container.parentElement;
      if (!parentContainer) {
        console.error('Parent container not found for:', containerId);
        return;
      }
      
      // Clear any existing content (safe - we control the container)
      container.textContent = '';
      // Use textContent first, then set innerHTML to empty string for compatibility
      container.innerHTML = '';
      
      // Ensure container has proper dimensions and overflow constraints
      container.style.minHeight = `${chartHeight}px`;
      container.style.width = '100%';
      container.style.maxWidth = '100%';
      container.style.boxSizing = 'border-box';
      container.style.overflow = 'hidden';
      
      // Ensure parent also has overflow constraints
      parentContainer.style.overflow = 'hidden';
      parentContainer.style.maxWidth = '100%';
      
      // Wait for container to be properly sized
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Calculate available width - get the actual available space
      const parentRect = parentContainer.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      // Account for parent padding (p-4 = 16px on each side)
      const parentPadding = 32;
      // Use the smaller of: parent width minus padding, or actual container width
      const availableWidth = Math.min(
        parentRect.width - parentPadding,
        containerRect.width,
        containerRect.width - 8 // Small buffer
      );
      
      // Ensure minimum width but don't exceed container
      const finalWidth = Math.max(Math.min(availableWidth, containerRect.width), 300);
      
      // Set explicit dimensions
      chartSpec.width = finalWidth;
      chartSpec.height = chartHeight;
      
      // Log only in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Rendering chart:', {
          containerId,
          width: availableWidth,
          height: chartHeight,
          containerSize: { width: containerRect.width, height: containerRect.height }
        });
      }

      const opts = {
        actions: false,
        renderer: 'svg', // Use SVG so we can modify text labels (replace G with B)
        config: {
          arc: { cornerRadius: 2 },
          bar: { cornerRadius: 2 },
          area: { line: true },
          background: 'transparent',
          axis: { 
            labelColor: '#6b7280', 
            titleColor: '#111827', 
            gridColor: '#e5e7eb',
            labelLimit: 80, // Limit axis label width
            labelFontSize: 11, // Slightly smaller font
            titleFontSize: 12,
          },
          text: { color: '#6b7280' },
          numberFormat: '.1s', // SI notation for numbers (will be post-processed to replace G with B)
        },
      };
      
      try {
        const result = await vegaEmbed(container, chartSpec, opts);
        
        // After rendering, ensure the chart element respects container boundaries
        setTimeout(() => {
          const chartElement = container.querySelector('canvas, svg');
          if (chartElement) {
            chartElement.style.maxWidth = '100%';
            chartElement.style.width = '100%';
            chartElement.style.height = 'auto';
            chartElement.style.boxSizing = 'border-box';
          }
          
          // Replace "G" (giga) with "B" (billions) in axis labels for financial context
          // With SVG rendering, we can directly modify text elements
          const textElements = container.querySelectorAll('text');
          textElements.forEach(textEl => {
            if (textEl.textContent) {
              // Replace G with B for billions (e.g., "13G" -> "13B")
              const newText = textEl.textContent.replace(/(\d+\.?\d*)G/g, '$1B');
              if (newText !== textEl.textContent) {
                textEl.textContent = newText;
              }
            }
          });
          
          // Also constrain any wrapper divs that vega-embed might create
          const wrappers = container.querySelectorAll('div');
          wrappers.forEach(wrapper => {
            wrapper.style.maxWidth = '100%';
            wrapper.style.overflow = 'hidden';
          });
        }, 50);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('Chart rendered successfully:', containerId);
        }
      } catch (error) {
        // Only log errors in development to avoid leaking information
        if (process.env.NODE_ENV === 'development') {
          console.error('Vega embed error:', error, 'for container:', containerId);
        }
      }
    } catch (e) {
      // Only log errors in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to render chart:', e, 'Container:', containerId);
      }
    }
  };

  const sendMessage = async (messageText) => {
    if (!messageText || !messageText.trim() || !selectedProfile) return;

    // Load settings from localStorage
    const savedSettings = localStorage.getItem('chatLimits');
    const settings = savedSettings ? JSON.parse(savedSettings) : { limitsEnabled: false };
    
    let userMessage = messageText.trim();
    
    // Apply query length limit if enabled
    if (settings.limitsEnabled && settings.maxQueryLength) {
      if (userMessage.length > settings.maxQueryLength) {
        showToast(`Message exceeds maximum length of ${settings.maxQueryLength} characters. Please shorten your message.`, 'error');
        return;
      }
    }

    setMessage('');
    setHistory((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);
    setRequestStartTime(Date.now());
    setTypingStatus('Thinking...');
    
    // Small delay to ensure "Thinking..." is visible
    await new Promise(resolve => setTimeout(resolve, 400));

    try {
      let newHistory = [...history, { role: 'user', content: userMessage }];
      
      // Apply history message limit if enabled
      if (settings.limitsEnabled && settings.maxHistoryMessages) {
        const limit = settings.maxHistoryMessages;
        if (newHistory.length > limit) {
          // Keep the most recent messages (including the current one)
          newHistory = newHistory.slice(-limit);
        }
      }
      
      // Get maxTurns from settings if enabled, otherwise use default
      const maxTurns = settings.limitsEnabled && settings.maxTurns ? settings.maxTurns : 6;
      
      // Find the selected source to get agent path for GCP agents
      const selectedSource = sources.find(s => s.key === selectedProfile);
      const agentPath = selectedSource?.agent || null;
      
      // Show "Calling GCP agent..." status
      setTypingStatus('Calling GCP agent...');
      
      // Small delay to ensure the status is visible
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const data = await sendChatMessage(selectedProfile, userMessage, newHistory, maxTurns, agentPath);
      
      // Show "Processing response..." status
      setTypingStatus('Processing response...');
      
      // Small delay to ensure the status is visible
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const hasError = data?.raw && Array.isArray(data.raw) && 
        data.raw.some(item => item && typeof item === 'object' && item.error);
      
      const isTimestamp = data?.answer && typeof data.answer === 'string' && 
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data.answer.trim());
      
      let answerText = '(no answer)';
      let sqlError = null;
      let isQueryValidationError = false;
      
      // First, try to get the answer text (even if there's an error, the answer might still be present)
      if (data && typeof data === 'object') {
        if (data.answer !== undefined && data.answer !== null) {
          if (typeof data.answer === 'string' && data.answer.trim()) {
            answerText = data.answer;
          } else {
            answerText = String(data.answer);
          }
        } else if (data.message && typeof data.message === 'string') {
          answerText = data.message;
        } else if (data.text && typeof data.text === 'string') {
          answerText = data.text;
        }
      } else if (typeof data === 'string') {
        answerText = data;
      }
      
      // Then, check for errors and extract SQL validation errors
      if (hasError || isTimestamp) {
        let errorMessage = 'An error occurred while processing your request.';
        if (data?.raw && Array.isArray(data.raw)) {
          // Find the first error object in the raw array
          const errorObj = data.raw.find(item => item && typeof item === 'object' && item.error);
          if (errorObj?.error) {
            if (typeof errorObj.error === 'string') {
              errorMessage = errorObj.error;
            } else if (errorObj.error.message) {
              errorMessage = errorObj.error.message;
              // Check if it's a QUERY_VALIDATION error
              if (errorObj.error.message.includes('QUERY_VALIDATION') || 
                  errorObj.error.message.includes('Syntax error')) {
                isQueryValidationError = true;
                sqlError = errorMessage;
              }
            } else if (errorObj.error.detail) {
              errorMessage = errorObj.error.detail;
            } else {
              // If error is an array, extract the first error
              if (Array.isArray(errorObj.error) && errorObj.error.length > 0) {
                const firstError = errorObj.error[0];
                if (firstError?.error?.message) {
                  errorMessage = firstError.error.message;
                  if (firstError.error.message.includes('QUERY_VALIDATION') || 
                      firstError.error.message.includes('Syntax error')) {
                    isQueryValidationError = true;
                    sqlError = firstError.error.message;
                  }
                } else if (typeof firstError === 'string') {
                  errorMessage = firstError;
                  if (firstError.includes('QUERY_VALIDATION') || 
                      firstError.includes('Syntax error')) {
                    isQueryValidationError = true;
                    sqlError = firstError;
                  }
                } else {
                  errorMessage = JSON.stringify(firstError);
                }
              } else {
                errorMessage = JSON.stringify(errorObj.error);
              }
            }
          }
        }
        
        // If there's a SQL validation error but no answer text, show the error in the message
        // Otherwise, the answer text will be shown and the SQL error will be in the artifacts panel
        if (isQueryValidationError && (!answerText || answerText === '(no answer)')) {
          let helpfulTip = '';
          
          if (errorMessage.includes('Aggregations of aggregations')) {
            helpfulTip = '\n\n💡 Tip: BigQuery doesn\'t allow nested aggregations (e.g., SUM(COUNT(...))). Use subqueries or CTEs instead.';
          } else if (errorMessage.includes('Syntax error') || errorMessage.includes('Unexpected identifier')) {
            helpfulTip = '\n\n💡 Tip: The generated SQL query has a syntax error. Common causes:\n' +
              '- Query starts with invalid text (should start with SELECT, WITH, etc.)\n' +
              '- Missing or unbalanced parentheses\n' +
              '- Invalid column or table names\n' +
              '- Incorrect SQL keyword usage\n' +
              'Please rephrase your question or ask the agent to generate a simpler query.';
          } else if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
            helpfulTip = '\n\n💡 Tip: The query references a table or column that doesn\'t exist. Check the available tables and columns in your dataset.';
          } else if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
            helpfulTip = '\n\n💡 Tip: The SQL query contains invalid syntax or structure. Try asking for a simpler query or rephrase your question.';
          }
          
          answerText = `SQL Validation Error: ${errorMessage}${helpfulTip}\n\nTo prevent these errors, update the agent's system instructions in Agent Manager with comprehensive SQL validation rules.`;
        } else if (!isQueryValidationError && (!answerText || answerText === '(no answer)')) {
          // Only show generic error if there's no answer text
          answerText = `Error: ${errorMessage}`;
        }
      }
      
      const art = data.artifacts || {};
      const charts = Array.isArray(art.charts) ? art.charts : [];
      
      // Use backend generation time if present, else client-side round-trip time
      const backendSeconds = data?.generationTimeSeconds != null ? Number(data.generationTimeSeconds) : null;
      const clientSeconds = requestStartTime ? Math.round((Date.now() - requestStartTime) / 1000) : 0;
      const thoughtTimeSeconds = backendSeconds != null ? backendSeconds : (clientSeconds > 0 ? clientSeconds : null);
      
      // Add message to history and get the index
      setHistory((prev) => {
        const newHistory = [...prev, { role: 'assistant', content: answerText }];
        const messageIdx = newHistory.length - 1; // Get the actual index from the new history
        
        // Store charts for this specific message
        if (charts.length > 0) {
          setMessageCharts((prevCharts) => ({
            ...prevCharts,
            [messageIdx]: charts,
          }));
        }
        
        // Store generation time for this message (backend or client fallback)
        if (thoughtTimeSeconds != null && thoughtTimeSeconds >= 0) {
          setMessageThoughtTimes((prev) => ({
            ...prev,
            [messageIdx]: thoughtTimeSeconds,
          }));
        }
        
        return newHistory;
      });

      setArtifacts({
        sql: art.sql && art.sql.length ? art.sql.join('\n\n') : 'No SQL.',
      });
      // Set SQL error if it's a query validation error
      setSqlError(isQueryValidationError ? sqlError : null);
      
      // Hide typing indicator
      setIsTyping(false);
      setTypingStatus('');
      setRequestStartTime(null);
    } catch (e) {
      setIsTyping(false);
      setTypingStatus('');
      setRequestStartTime(null);
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${e.message}` },
      ]);
      showToast(`Error: ${e.message}`, 'error');
    }
  };

  const handleSend = async () => {
    await sendMessage(message);
  };

  const handleClear = () => {
    setHistory([]);
    setArtifacts({
      sql: 'No SQL.',
    });
    setMessageCharts({});
    setSqlError(null);
    setTypingStatus('');
    setMessageThoughtTimes({});
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden page-enter">
      <Header title="AI Chat" />
      <main className="flex-1 overflow-hidden flex min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full h-full px-6 py-5 min-w-0" style={{ minHeight: 0 }}>
          {/* Left: Sources & Artifacts */}
          <section className="lg:col-span-3 h-full flex flex-col min-w-0 overflow-hidden">
            <div className="flex flex-col gap-5 h-full overflow-y-auto overflow-x-hidden scrollbar-thin min-w-0">
              {/* Sources */}
              <div className="card flex-shrink-0">
                <div className="card-header">
                  <div className="flex items-center justify-between">
                    <h2 className="section-title">DATA SOURCES</h2>
                    <div className="flex items-center gap-2">
                      {sourcesMeta.gcp_status === 'failed' && (
                        <button
                          onClick={() => {
                            const errorMsg = sourcesMeta.gcp_error || 'Unknown error occurred';
                            showToast(`GCP Error: ${errorMsg}`, 'error');
                          }}
                          className="badge badge-warning text-xs cursor-pointer hover:opacity-80 transition-opacity" 
                          title={`Click to see error: ${sourcesMeta.gcp_error || "GCP fetch failed"}`}
                        >
                          GCP Failed
                        </button>
                      )}
                      {sourcesMeta.gcp_status === 'empty' && (
                        <span 
                          className="badge badge-warning text-xs cursor-help" 
                          title="GCP returned 0 data sources. Check if agents have BigQuery data sources configured."
                        >
                          GCP Empty
                        </span>
                      )}
                      {sourcesMeta.gcp_status === 'disabled' && (
                        <span className="badge badge-gray text-xs" title="GCP fetching is disabled">
                          GCP Disabled
                        </span>
                      )}
                      {sourcesError && (
                        <span className="badge badge-error">Failed</span>
                      )}
                      <button
                        onClick={() => loadSourcesList(true)}
                        disabled={loadingSources}
                        className="p-1.5 text-gray-500 hover:text-[#177091] hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Refresh sources from GCP"
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingSources ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-600">
                      Choose a source to route questions and SQL generation.
                    </p>
                    {sources.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        {sourcesMeta.gcp_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            <Cloud className="w-3 h-3" />
                            {sourcesMeta.gcp_count} GCP
                          </span>
                        )}
                        {sourcesMeta.local_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200">
                            {sourcesMeta.local_count} Local
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {sources.map((source) => (
                      <label
                        key={source.key}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedProfile === source.key
                            ? 'shadow-sm'
                            : 'border-gray-200 bg-white'
                        }`}
                        style={selectedProfile === source.key ? {
                          borderColor: '#177091',
                          backgroundColor: 'rgba(23, 112, 145, 0.05)'
                        } : undefined}
                      >
                        <input
                          type="radio"
                          name="source"
                          value={source.key}
                          checked={selectedProfile === source.key}
                          onChange={(e) => setSelectedProfile(e.target.value)}
                          className="focus:ring-[#177091]"
                          style={{ accentColor: '#177091' }}
                        />
                        <Database className="w-5 h-5 flex-shrink-0" style={{ color: selectedProfile === source.key ? '#177091' : '#6b7280' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-gray-900 truncate">{source.label || source.key}</div>
                            {source.source === 'gcp' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0" title="Fetched from Google Cloud Platform">
                                <Cloud className="w-3 h-3" />
                                GCP
                              </span>
                            )}
                            {source.source === 'local' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-200 flex-shrink-0" title="From local configuration file">
                                Local
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{source.key}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Artifacts */}
              <div className="card flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="card-header flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-primary">Artifacts</span>
                    <h2 className="section-title">EXECUTION DETAILS</h2>
                  </div>
                </div>
                <div className="card-body flex-1 overflow-y-auto scrollbar-thin space-y-4 min-h-0">
                <details open className={`border rounded-lg ${sqlError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                  <summary className="px-4 py-3 font-semibold text-sm text-gray-900 cursor-pointer hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    SQL
                    {sqlError && (
                      <span className="badge badge-error text-xs ml-2">Validation Error</span>
                    )}
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  </summary>
                  <div className={`px-4 py-3 border-t overflow-x-auto ${sqlError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                    {sqlError && (
                      <div className="mb-3 p-3 bg-red-100 border border-red-300 rounded text-xs text-red-800">
                        <div className="font-semibold mb-1">SQL Validation Error:</div>
                        <div className="whitespace-pre-wrap break-words mb-2">{sqlError}</div>
                        {sqlError.match(/\[(\d+):(\d+)\]/) && (
                          <div className="text-xs text-red-700 mt-2 pt-2 border-t border-red-300">
                            <div className="font-medium">Error Location:</div>
                            <div>Line {sqlError.match(/\[(\d+):(\d+)\]/)[1]}, Column {sqlError.match(/\[(\d+):(\d+)\]/)[2]}</div>
                            <div className="mt-1 text-red-600">Check the SQL query below around this line for syntax issues.</div>
                          </div>
                        )}
                      </div>
                    )}
                    {artifacts.sql && artifacts.sql !== 'No SQL.' ? (
                      <div className="relative">
                        <pre className="text-mono text-xs text-gray-600 whitespace-pre-wrap break-words">
                          {artifacts.sql.split('\n').map((line, idx) => {
                            // Highlight the error line if we can extract it from the error message
                            const errorMatch = sqlError?.match(/\[(\d+):(\d+)\]/);
                            const errorLine = errorMatch ? parseInt(errorMatch[1]) - 1 : -1; // Convert to 0-based index
                            const isErrorLine = errorLine >= 0 && idx === errorLine;
                            return (
                              <div
                                key={idx}
                                className={isErrorLine ? 'bg-red-200 px-1 rounded' : ''}
                              >
                                <span className="text-gray-400 mr-2 select-none">{idx + 1}</span>
                                {line}
                              </div>
                            );
                          })}
                        </pre>
                      </div>
                    ) : (
                      <pre className="text-mono text-xs text-gray-600 whitespace-pre-wrap break-words">
                        {artifacts.sql}
                      </pre>
                    )}
                  </div>
                </details>
                </div>
              </div>
            </div>
          </section>

          {/* Right: Chat */}
          <section className="lg:col-span-9 h-full flex flex-col min-w-0 overflow-hidden">
            <div className="card h-full flex flex-col min-w-0 overflow-hidden">
              <div className="card-header flex-shrink-0 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-gray-900">[Exp.] DataHub Chat</h2>
                  {selectedProfile && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span className="text-sm text-gray-600 font-medium">
                        {sources.find(s => s.key === selectedProfile)?.label || selectedProfile}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div 
                ref={chatScrollRef}
                className={`flex-1 overflow-x-hidden px-4 py-6 space-y-6 scrollbar-thin min-w-0 bg-gradient-to-b from-gray-50/50 to-white ${
                  history.length > 0 || isTyping ? 'overflow-y-auto' : 'overflow-y-hidden'
                }`}
                style={{ 
                  minHeight: 0,
                  height: 0 // Critical: forces flex-1 to work properly with overflow
                }}
              >
                {history.length === 0 && !isTyping ? (
                  <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 relative" style={{
                      background: 'linear-gradient(135deg, #177091 0%, #13718F 100%)',
                      padding: '2px'
                    }}>
                      <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                        <img 
                          src="/chat_icon.jpeg" 
                          alt="Chat" 
                          className="w-12 h-12 object-contain"
                        />
                      </div>
                    </div>
                    <p className="text-base font-semibold text-gray-900 mb-2">Start a conversation</p>
                    <p className="text-sm text-gray-500 max-w-sm mx-auto mb-8">Select a data source and ask a question to get started with your analysis.</p>
                    
                    {/* Default Questions */}
                    <div className="max-w-2xl mx-auto mt-8">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Suggested Questions</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          "Give me an overview of the data",
                          "What are the key trends in this dataset?",
                          "Show me summary statistics",
                          "What are the top categories by count?"
                        ].map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => sendMessage(question)}
                            disabled={!selectedProfile}
                            className="text-left px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-[#177091] hover:bg-[#177091]/5 transition-all duration-200 text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white scale-in"
                            style={{ animationDelay: `${idx * 0.05}s` }}
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-center mt-3">
                        <button
                          onClick={() => sendMessage("Identify any patterns or correlations")}
                          disabled={!selectedProfile}
                          className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-[#177091] hover:bg-[#177091]/5 transition-all text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white w-full md:w-auto md:max-w-[calc(50%-0.375rem)] scale-in"
                          style={{ animationDelay: '0.2s' }}
                        >
                          Identify any patterns or correlations
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {history.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex items-end gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in`}
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        {msg.role === 'assistant' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm relative" style={{
                            background: 'linear-gradient(135deg, #177091 0%, #13718F 100%)',
                            padding: '1.5px'
                          }}>
                            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                              <img 
                                src="/chat_icon.jpeg" 
                                alt="Assistant" 
                                className="w-5 h-5 object-contain"
                              />
                            </div>
                          </div>
                        )}
                        <div className="max-w-[80%] min-w-0 flex flex-col gap-1">
                          {msg.role === 'assistant' && messageThoughtTimes[idx] != null && (
                            <p className="text-xs text-gray-400 font-normal">
                              Thought for {messageThoughtTimes[idx] >= 60
                                ? `${Math.floor(messageThoughtTimes[idx] / 60)} min ${Math.round(messageThoughtTimes[idx] % 60)} s`
                                : `${Number(messageThoughtTimes[idx]) === Math.floor(messageThoughtTimes[idx]) ? Math.floor(messageThoughtTimes[idx]) : messageThoughtTimes[idx]} s`}
                            </p>
                          )}
                          <div
                            className={`${
                              msg.role === 'user'
                                ? 'text-white rounded-xl rounded-br-md px-5 py-3.5'
                                : 'bg-white text-gray-900 border border-gray-200 rounded-xl rounded-bl-md px-5 py-3.5'
                            }`}
                            style={msg.role === 'user' ? {
                              background: 'linear-gradient(135deg, #177091 0%, #13718F 100%)',
                              boxShadow: '0 2px 4px -1px rgba(23, 112, 145, 0.15)'
                            } : {
                              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                            }}
                          >
                            <div className={`text-sm leading-relaxed break-words overflow-wrap-anywhere ${msg.role === 'user' ? 'text-white' : 'text-gray-800'}`}>
                              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                            </div>
                            {msg.role === 'assistant' && messageCharts[idx] && messageCharts[idx].length > 0 && (
                              <div className="mt-3">
                                <ChartGallery 
                                  key={`charts-${idx}-${messageCharts[idx].length}`}
                                  charts={messageCharts[idx]} 
                                  messageIdx={idx} 
                                  onRenderChart={renderVegaChart} 
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border border-gray-200">
                            <span className="text-xs font-semibold text-gray-600">You</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex flex-col gap-2 animate-in">
                        <div className="flex items-end gap-3 justify-start">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm relative" style={{
                            background: 'linear-gradient(135deg, #177091 0%, #13718F 100%)',
                            padding: '1.5px'
                          }}>
                            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                              <img 
                                src="/chat_icon.jpeg" 
                                alt="Assistant" 
                                className="w-5 h-5 object-contain"
                              />
                            </div>
                          </div>
                          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl rounded-bl-md px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ 
                                  backgroundColor: '#177091',
                                  animation: 'pulse 1.4s ease-in-out infinite'
                                }}
                              ></div>
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ 
                                  backgroundColor: '#13718F',
                                  animation: 'pulse 1.4s ease-in-out infinite 0.2s'
                                }}
                              ></div>
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ 
                                  backgroundColor: '#177091',
                                  animation: 'pulse 1.4s ease-in-out infinite 0.4s'
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                        {typingStatus && (
                          <p className="text-xs text-gray-500 font-medium ml-11">
                            {typingStatus}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-gray-200 bg-white p-5 flex-shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="flex items-end gap-3">
                  <div className="flex-1 relative">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="input-field w-full min-h-[56px] max-h-32 resize-none pr-14 py-3.5 rounded-3xl border-gray-300 transition-all"
                      placeholder="Ask about the selected dataset..."
                      rows={1}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!message.trim() || !selectedProfile}
                      className="absolute right-2.5 bottom-2.5 w-9 h-9 rounded-full bg-[#177091] text-white flex items-center justify-center hover:bg-[#155a75] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      title="Send message"
                    >
                      <img 
                        src="/icons8-up-arrow-32.png" 
                        alt="Send" 
                        className="w-5 h-5 object-contain"
                      />
                    </button>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleClear}
                      disabled={history.length === 0}
                      className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed h-[56px] flex items-center justify-center"
                      title="Clear chat"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
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

export default ChatIndex;
