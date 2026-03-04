import { useState, useEffect, useRef } from 'react';
import { Trash2, Database, AlertCircle, ChevronDown, RefreshCw, ArrowUp } from 'lucide-react';
import Header from '../components/Header';
// Footer removed from chat layout for maximum vertical space
import Toast from '../components/Toast';
import { loadSources, sendChatMessage, sendChatMessageStream } from '../utils/api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import vegaEmbed from 'vega-embed';
import { formatNumbersInText, getCurrencyForContext, stripMarkdownEmphasis } from '../utils/currency';

const TYPING_STATUS_PHRASES = [
  'Processing query...',
  'Retrieving real-time data...',
  'calculating variances...',
  'Aggregating data Streams...',
  'Mapping relationships...',
  'Auditing data quality...',
  'Finalising report...',
  'Identifying key trends...',
  'De-duplicating records...',
  'Synthesising insights...',
  'Evaluating significance...',
  'Validating logic...',
  'Structuring response...',
];

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
  const [messageChainOfThought, setMessageChainOfThought] = useState({});
  const [sqlError, setSqlError] = useState(null);
  const [sourcesError, setSourcesError] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('sidebarOpen') !== 'false'; } catch { return true; }
  });
  const chatEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const streamingAssistantIdxRef = useRef(null);

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

  // When user selects a different data source, clear the chat so the conversation starts fresh
  useEffect(() => {
    setHistory([]);
    setMessageCharts({});
    setMessageChainOfThought({});
    setArtifacts({ sql: 'No SQL.' });
    setSqlError(null);
    setMessageThoughtTimes({});
  }, [selectedProfile]);

  // Rotate typing status phrases while agent is responding
  useEffect(() => {
    if (!isTyping) return;
    let idx = 0;
    setTypingStatus(TYPING_STATUS_PHRASES[idx]);
    const interval = setInterval(() => {
      idx = (idx + 1) % TYPING_STATUS_PHRASES.length;
      setTypingStatus(TYPING_STATUS_PHRASES[idx]);
    }, 6500); // Every 6.5 seconds
    return () => clearInterval(interval);
  }, [isTyping]);

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

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebarOpen', String(next)); } catch {}
      return next;
    });
  };

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
    // Strip model's markdown emphasis so * and ** never appear as literal
    const cleaned = stripMarkdownEmphasis(text);
    // Format numbers with currency and make them bold before rendering (per-agent currency)
    const formattedText = formatNumbersInText(cleaned, chatCurrency);
    
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

  const processFinalResponse = (data, isStreamDone = false) => {
    const hasError = data?.raw && Array.isArray(data.raw) &&
      data.raw.some(item => item && typeof item === 'object' && item.error);
    const isTimestamp = data?.answer && typeof data.answer === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data.answer.trim());
    let answerText = '(no answer)';
    let sqlError = null;
    let isQueryValidationError = false;
    if (data && typeof data === 'object') {
      if (data.answer !== undefined && data.answer !== null) {
        answerText = typeof data.answer === 'string' && data.answer.trim() ? data.answer : String(data.answer);
      } else if (data.message && typeof data.message === 'string') {
        answerText = data.message;
      } else if (data.text && typeof data.text === 'string') {
        answerText = data.text;
      }
    } else if (typeof data === 'string') {
      answerText = data;
    }
    if (hasError || isTimestamp) {
      let errorMessage = 'An error occurred while processing your request.';
      if (data?.raw && Array.isArray(data.raw)) {
        const errorObj = data.raw.find(item => item && typeof item === 'object' && item.error);
        if (errorObj?.error) {
          if (typeof errorObj.error === 'string') {
            errorMessage = errorObj.error;
          } else if (errorObj.error.message) {
            errorMessage = errorObj.error.message;
            if (errorObj.error.message.includes('QUERY_VALIDATION') || errorObj.error.message.includes('Syntax error')) {
              isQueryValidationError = true;
              sqlError = errorMessage;
            }
          } else if (errorObj.error.detail) {
            errorMessage = errorObj.error.detail;
          } else if (Array.isArray(errorObj.error) && errorObj.error.length > 0) {
            const firstError = errorObj.error[0];
            if (firstError?.error?.message) {
              errorMessage = firstError.error.message;
              if (firstError.error.message.includes('QUERY_VALIDATION') || firstError.error.message.includes('Syntax error')) {
                isQueryValidationError = true;
                sqlError = firstError.error.message;
              }
            } else if (typeof firstError === 'string') {
              errorMessage = firstError;
              if (firstError.includes('QUERY_VALIDATION') || firstError.includes('Syntax error')) {
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
      if (isQueryValidationError && (!answerText || answerText === '(no answer)')) {
        let helpfulTip = '';
        if (errorMessage.includes('Aggregations of aggregations')) {
          helpfulTip = '\n\n💡 Tip: BigQuery doesn\'t allow nested aggregations (e.g., SUM(COUNT(...))). Use subqueries or CTEs instead.';
        } else if (errorMessage.includes('Syntax error') || errorMessage.includes('Unexpected identifier')) {
          helpfulTip = '\n\n💡 Tip: The generated SQL query has a syntax error. Common causes:\n- Query starts with invalid text (should start with SELECT, WITH, etc.)\n- Missing or unbalanced parentheses\n- Invalid column or table names\n- Incorrect SQL keyword usage\nPlease rephrase your question or ask the agent to generate a simpler query.';
        } else if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
          helpfulTip = '\n\n💡 Tip: The query references a table or column that doesn\'t exist. Check the available tables and columns in your dataset.';
        } else if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
          helpfulTip = '\n\n💡 Tip: The SQL query contains invalid syntax or structure. Try asking for a simpler query or rephrase your question.';
        }
        answerText = `SQL Validation Error: ${errorMessage}${helpfulTip}\n\nTo prevent these errors, update the agent's system instructions in Agent Manager with comprehensive SQL validation rules.`;
      } else if (!isQueryValidationError && (!answerText || answerText === '(no answer)')) {
        answerText = `Error: ${errorMessage}`;
      }
    }
    const art = data?.artifacts || {};
    const charts = Array.isArray(art.charts) ? art.charts : [];
    const backendSeconds = data?.generationTimeSeconds != null ? Number(data.generationTimeSeconds) : null;
    const clientSeconds = requestStartTime ? Math.round((Date.now() - requestStartTime) / 1000) : 0;
    const thoughtTimeSeconds = backendSeconds != null ? backendSeconds : (clientSeconds > 0 ? clientSeconds : null);
    const chainOfThought = data?.chainOfThought && typeof data.chainOfThought === 'string' ? data.chainOfThought.trim() : null;
    const assistantIdx = streamingAssistantIdxRef.current;
    setHistory((prev) => {
      const updated = [...prev];
      if (assistantIdx != null && assistantIdx >= 0 && assistantIdx < updated.length) {
        updated[assistantIdx] = {
          role: 'assistant',
          content: answerText,
          ...(chainOfThought && { chainOfThought }),
        };
      } else {
        updated.push({ role: 'assistant', content: answerText, ...(chainOfThought && { chainOfThought }) });
      }
      return updated;
    });
    if (assistantIdx != null && charts.length > 0) {
      setMessageCharts((prevCharts) => ({ ...prevCharts, [assistantIdx]: charts }));
    }
    if (assistantIdx != null && thoughtTimeSeconds != null && thoughtTimeSeconds >= 0) {
      setMessageThoughtTimes((prev) => ({ ...prev, [assistantIdx]: thoughtTimeSeconds }));
    }
    if (assistantIdx != null && chainOfThought) {
      setMessageChainOfThought((prev) => ({ ...prev, [assistantIdx]: chainOfThought }));
    }
    setArtifacts({ sql: art.sql && art.sql.length ? art.sql.join('\n\n') : 'No SQL.' });
    setSqlError(isQueryValidationError ? sqlError : null);
    setIsTyping(false);
    setTypingStatus('');
    setRequestStartTime(null);

    // Notify when response indicates an error (cross-org, access, etc.)
    if (data.exactError && typeof data.exactError === 'string') {
      showToast('GCP returned an error. See "Exact error from GCP" in the message below.', 'error');
    } else if (answerText && typeof answerText === 'string') {
      const lower = answerText.toLowerCase();
      const looksLikeError = /\bcross-organization\b|\bcross-org\b|error retrieving the data schema|i cannot fulfill|i encountered an error|permission denied|access denied|resource access\s+error/i.test(lower);
      if (looksLikeError) {
        showToast('The response indicates an error (e.g. access or permissions). Check the message above for details.', 'error');
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
    setHistory((prev) => {
      const withUser = [...prev, { role: 'user', content: userMessage }];
      let newHistory = withUser;
      if (settings.limitsEnabled && settings.maxHistoryMessages) {
        const limit = settings.maxHistoryMessages;
        if (withUser.length > limit) {
          newHistory = withUser.slice(-limit);
        }
      }
      const withPlaceholder = [...newHistory, { role: 'assistant', content: '', chainOfThought: '' }];
      streamingAssistantIdxRef.current = withPlaceholder.length - 1;
      return withPlaceholder;
    });
    setIsTyping(true);
    setRequestStartTime(Date.now());

    try {
      let newHistory = [...history, { role: 'user', content: userMessage }];
      if (settings.limitsEnabled && settings.maxHistoryMessages) {
        const limit = settings.maxHistoryMessages;
        if (newHistory.length > limit) {
          newHistory = newHistory.slice(-limit);
        }
      }
      const maxTurns = settings.limitsEnabled && settings.maxTurns ? settings.maxTurns : 6;
      const selectedSource = sources.find(s => s.key === selectedProfile);
      const agentPath = selectedSource?.agent || null;

      let usedStream = false;
      try {
        await sendChatMessageStream(
          selectedProfile,
          userMessage,
          newHistory,
          maxTurns,
          agentPath,
          {
            onCotStep: (ev) => {
              usedStream = true;
              const cot = ev?.chainOfThought;
              if (cot && typeof cot === 'string') {
                const idx = streamingAssistantIdxRef.current;
                if (idx != null) {
                  setMessageChainOfThought((prev) => ({ ...prev, [idx]: cot }));
                  setHistory((prev) => {
                    const next = [...prev];
                    if (idx >= 0 && idx < next.length) {
                      next[idx] = { ...next[idx], chainOfThought: cot };
                    }
                    return next;
                  });
                }
              }
            },
            onAnswerDelta: (ev) => {
              usedStream = true;
              const delta =
                typeof ev === 'string'
                  ? ev
                  : (typeof ev?.delta === 'string' ? ev.delta : null);
              if (!delta) return;
              const idx = streamingAssistantIdxRef.current;
              if (idx == null) return;
              setHistory((prev) => {
                const next = [...prev];
                if (idx >= 0 && idx < next.length) {
                  const existing = next[idx] || {};
                  const prevContent = typeof existing.content === 'string' ? existing.content : '';
                  next[idx] = { ...existing, role: 'assistant', content: prevContent + delta };
                }
                return next;
              });
            },
            onDone: (data) => {
              usedStream = true;
              processFinalResponse(data, true);
            },
            onError: (msg) => {
              usedStream = true;
              setIsTyping(false);
              setTypingStatus('');
              setRequestStartTime(null);
              setHistory((prev) => {
                const idx = streamingAssistantIdxRef.current;
                const next = [...prev];
                if (idx != null && idx >= 0 && idx < next.length) {
                  next[idx] = { role: 'assistant', content: `Error: ${msg}` };
                } else {
                  next.push({ role: 'assistant', content: `Error: ${msg}` });
                }
                return next;
              });
              showToast(`Error: ${msg}`, 'error');
            },
          }
        );
        if (!usedStream) {
          throw new Error('Stream produced no events');
        }
      } catch (streamErr) {
        const data = await sendChatMessage(selectedProfile, userMessage, newHistory, maxTurns, agentPath);
        processFinalResponse(data);
      }
    } catch (e) {
      setIsTyping(false);
      setTypingStatus('');
      setRequestStartTime(null);
      const idx = streamingAssistantIdxRef.current;
      setHistory((prev) => {
        const next = [...prev];
        if (idx != null && idx >= 0 && idx < next.length) {
          next[idx] = { role: 'assistant', content: `Error: ${e.message}` };
        } else {
          next.push({ role: 'assistant', content: `Error: ${e.message}` });
        }
        return next;
      });
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
    setMessageChainOfThought({});
    setSqlError(null);
    setTypingStatus('');
    setMessageThoughtTimes({});
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isTyping) handleSend();
    }
  };

  const selectedSourceLabel = sources.find(s => s.key === selectedProfile)?.label || selectedProfile;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden page-enter">
      <Header title="AI Chat" onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />

      <main className="flex-1 overflow-hidden flex min-w-0" style={{ minHeight: 0 }}>
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div className="sidebar-backdrop lg:hidden" onClick={toggleSidebar} />
        )}

        {/* Sidebar */}
        <aside
          className={`sidebar h-full flex-shrink-0 bg-white border-r border-gray-200/60 flex flex-col overflow-hidden z-40
            ${sidebarOpen ? 'w-80' : 'w-0 border-r-0'}
            max-lg:fixed max-lg:top-14 max-lg:left-0 max-lg:bottom-0 max-lg:shadow-xl
            ${sidebarOpen ? 'max-lg:w-80' : 'max-lg:w-0'}
          `}
        >
          <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden scrollbar-thin p-4 gap-4 min-w-[320px]">
            {/* Data Sources */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h2 className="section-title">Data Sources</h2>
                  {sourcesMeta.gcp_count > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                      <img src="/g_cloud/icons8-google-cloud-48.svg" alt="" className="w-3 h-3" />
                      {sourcesMeta.gcp_count}
                    </span>
                  )}
                  {sourcesMeta.local_count > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200 flex-shrink-0">
                      {sourcesMeta.local_count} Local
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {sourcesMeta.gcp_status === 'failed' && (
                    <button
                      onClick={() => showToast(`GCP Error: ${sourcesMeta.gcp_error || 'Unknown error'}`, 'error')}
                      className="badge badge-warning text-[10px] cursor-pointer hover:opacity-80"
                      title={`GCP fetch failed: ${sourcesMeta.gcp_error || "Unknown"}`}
                    >
                      GCP Failed
                    </button>
                  )}
                  {sourcesMeta.gcp_status === 'empty' && (
                    <span className="badge badge-warning text-[10px]" title="GCP returned 0 data sources">GCP Empty</span>
                  )}
                  {sourcesMeta.gcp_status === 'disabled' && (
                    <span className="badge badge-gray text-[10px]" title="GCP fetching is disabled">GCP Off</span>
                  )}
                  {sourcesError && <span className="badge badge-error text-[10px]">Failed</span>}
                  <button
                    onClick={() => loadSourcesList(true)}
                    disabled={loadingSources}
                    className="p-1 text-gray-400 hover:text-[#3E0AC2] rounded transition-colors disabled:opacity-50"
                    title="Refresh sources"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSources ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {sources.map((source) => (
                  <label
                    key={source.key}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm ${
                      selectedProfile === source.key
                        ? 'bg-[#3E0AC2]/5 border-l-2 border-l-[#3E0AC2] border border-[#3E0AC2]/20'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <input type="radio" name="source" value={source.key} checked={selectedProfile === source.key} onChange={(e) => setSelectedProfile(e.target.value)} className="sr-only" />
                    <Database className="w-4 h-4 flex-shrink-0" style={{ color: selectedProfile === source.key ? '#3E0AC2' : '#9ca3af' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium truncate ${selectedProfile === source.key ? 'text-[#3E0AC2]' : 'text-gray-800'}`}>{source.label || source.key}</span>
                        {source.source === 'gcp' && (
                          <img src="/g_cloud/icons8-google-cloud-48.svg" alt="" className="w-3.5 h-3.5 flex-shrink-0" title="GCP" />
                        )}
                        {source.source === 'local' && (
                          <span className="text-[9px] font-medium text-gray-400 uppercase flex-shrink-0">Local</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

          </div>
        </aside>

        {/* Chat Area */}
        <section className="flex-1 h-full flex flex-col min-w-0 overflow-hidden">
          {/* Chat messages */}
          <div 
            ref={chatScrollRef}
            className={`flex-1 overflow-x-hidden px-4 md:px-8 lg:px-12 py-6 space-y-5 scrollbar-thin min-w-0 ${
              history.length > 0 || isTyping ? 'overflow-y-auto' : 'overflow-y-hidden'
            }`}
            style={{ minHeight: 0, height: 0 }}
          >
            {history.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 relative" style={{
                  background: 'linear-gradient(135deg, #3E0AC2 0%, #3508A5 100%)',
                  padding: '2px'
                }}>
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                    <img src="/Flash.png" alt="Dashworx" className="w-9 h-9 object-contain" style={{ transform: 'translate(1px, -1px)' }} />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2 font-display">Ask your data anything</h2>
                <p className="text-sm text-gray-500 max-w-md mx-auto mb-10">Select a data source and ask a question to get started with your analysis.</p>
                
                <div className="max-w-5xl mx-auto w-full"> 
                  <p className="section-title mb-4">Suggested Questions</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {[
                      "Give me sales vs budget insights over the last 7 days.",
                      "Which is the best performing last click attribution channel over the last 30 days?",
                      "Show me the best performing product collections over the last 7 days.",
                      "Show me sales vs cost insights over the last 7 days."
                    ].map((question, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessage(question)}
                        disabled={!selectedProfile}
                        className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-[#3E0AC2]/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:shadow-none disabled:hover:translate-y-0 scale-in"
                        style={{ animationDelay: `${idx * 0.06}s` }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {history.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in max-w-3xl ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'}`}
                    style={{ animationDelay: `${Math.min(idx * 0.03, 0.3)}s` }}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-1" style={{
                        background: 'linear-gradient(135deg, #3E0AC2 0%, #3508A5 100%)',
                        padding: '1.5px'
                      }}>
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                          <img src="/Flash.png" alt="Assistant" className="w-3.5 h-3.5 object-contain" />
                        </div>
                      </div>
                    )}
                    <div className={`min-w-0 flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`} style={{ maxWidth: msg.role === 'user' ? '70%' : '85%' }}>
                      {msg.role === 'assistant' && (messageChainOfThought[idx] || msg.chainOfThought) && (
                        <div className="mb-1 w-full">
                          <details className="group">
                            <summary className="flex items-center gap-2 py-1 cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600 list-none transition-colors">
                              <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 flex-shrink-0" />
                              <span className="group-open:inline hidden">Hide reasoning</span>
                              <span className="group-open:hidden inline">Show reasoning</span>
                            </summary>
                            <div className="mt-1 pl-3 border-l-2 border-[#3E0AC2]/20 text-xs text-gray-500 whitespace-pre-wrap leading-relaxed">
                              {(messageChainOfThought[idx] || msg.chainOfThought)}
                            </div>
                          </details>
                        </div>
                      )}
                      {msg.role === 'assistant' && msg.exactError && (
                        <div className="mb-1 w-full">
                          <details className="group border border-amber-200 rounded-lg bg-amber-50/80">
                            <summary className="flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-amber-100/80 text-xs font-medium text-amber-800 list-none">
                              <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 flex-shrink-0" />
                              Exact error from GCP
                            </summary>
                            <pre className="p-3 pt-0 text-xs text-amber-900 whitespace-pre-wrap break-words font-mono border-t border-amber-200 mt-0">
                              {msg.exactError}
                            </pre>
                          </details>
                        </div>
                      )}
                      {msg.role === 'assistant' && messageThoughtTimes[idx] != null && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 px-2 py-0.5 rounded-full bg-gray-100 mb-1">
                          Thought for {messageThoughtTimes[idx] >= 60
                            ? `${Math.floor(messageThoughtTimes[idx] / 60)}m ${Math.round(messageThoughtTimes[idx] % 60)}s`
                            : `${Number(messageThoughtTimes[idx]) === Math.floor(messageThoughtTimes[idx]) ? Math.floor(messageThoughtTimes[idx]) : messageThoughtTimes[idx]}s`}
                        </span>
                      )}
                      {(msg.role === 'user' || (msg.role === 'assistant' && (msg.content?.trim() || (messageCharts[idx] && messageCharts[idx].length > 0)))) && (
                      <div
                        className={`${
                          msg.role === 'user'
                            ? 'text-white rounded-2xl rounded-br-sm px-4 py-3'
                            : 'bg-white text-gray-900 rounded-2xl rounded-bl-sm px-4 py-3 border border-gray-100'
                        }`}
                        style={msg.role === 'user' ? {
                          background: 'linear-gradient(135deg, #3E0AC2 0%, #3508A5 100%)',
                          boxShadow: '0 2px 8px -2px rgba(62, 10, 194, 0.2)'
                        } : {
                          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.04)'
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
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#3E0AC2] flex items-center justify-center mt-1">
                        <span className="text-[10px] font-bold text-white">You</span>
                      </div>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex flex-col gap-1.5 animate-in max-w-3xl">
                    <div className="flex items-start gap-3 justify-start">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-1" style={{
                        background: 'linear-gradient(135deg, #3E0AC2 0%, #3508A5 100%)',
                        padding: '1.5px'
                      }}>
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                          <img src="/Flash.png" alt="Assistant" className="w-3.5 h-3.5 object-contain" />
                        </div>
                      </div>
                      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3E0AC2', animation: 'pulse 1.4s ease-in-out infinite' }}></div>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3508A5', animation: 'pulse 1.4s ease-in-out infinite 0.2s' }}></div>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3E0AC2', animation: 'pulse 1.4s ease-in-out infinite 0.4s' }}></div>
                        </div>
                      </div>
                    </div>
                    {typingStatus && (
                      <p className="text-[11px] text-gray-400 font-medium ml-10">
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
          <div className="composer-elevated px-4 md:px-8 lg:px-12 py-4">
            {selectedProfile && (
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#3E0AC2]/5 text-[#3E0AC2] border border-[#3E0AC2]/10">
                  <Database className="w-3 h-3" />
                  {selectedSourceLabel}
                </span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="input-field w-full min-h-[48px] max-h-32 resize-none pr-12 py-3 rounded-2xl border-gray-200 bg-gray-50/50 focus:bg-white transition-all text-sm"
                  placeholder="Ask about your data..."
                  rows={1}
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || !selectedProfile || isTyping}
                  className="absolute right-2 bottom-2 w-8 h-8 rounded-xl bg-[#3E0AC2] text-white flex items-center justify-center hover:bg-[#2B0799] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Send message (Enter)"
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>
              <button
                onClick={handleClear}
                disabled={history.length === 0}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed h-[48px] flex items-center justify-center"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 ml-1">Press Enter to send, Shift+Enter for new line</p>
          </div>
        </section>
      </main>

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
