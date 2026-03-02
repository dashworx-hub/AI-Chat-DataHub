// Currency formatting utilities

// Common currencies with their symbols and formatting preferences
export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', position: 'before' },
  { code: 'EUR', symbol: '€', name: 'Euro', position: 'before' },
  { code: 'GBP', symbol: '£', name: 'British Pound', position: 'before' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', position: 'before' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', position: 'before' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', position: 'before' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', position: 'before' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', position: 'before' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', position: 'before' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', position: 'before' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', position: 'before' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', position: 'before' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', position: 'before' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', position: 'before' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', position: 'before' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', position: 'before' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', position: 'before' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', position: 'after' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', position: 'after' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', position: 'after' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', position: 'after' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', position: 'before' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', position: 'before' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', position: 'before' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', position: 'before' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', position: 'before' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', position: 'before' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel', position: 'before' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', position: 'before' },
];

// Get currency from localStorage
export const getCurrency = () => {
  const saved = localStorage.getItem('selectedCurrency');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return CURRENCIES[0]; // Default to USD
    }
  }
  return CURRENCIES[0]; // Default to USD
};

// Set currency in localStorage (global fallback; prefer per-agent when agent is known)
export const setCurrency = (currency) => {
  localStorage.setItem('selectedCurrency', JSON.stringify(currency));
};

const AGENT_CURRENCIES_KEY = 'agentCurrencies';

// Get currency for a specific agent (per-agent setting)
export const getCurrencyForAgent = (agentId) => {
  if (!agentId) return null;
  try {
    const stored = localStorage.getItem(AGENT_CURRENCIES_KEY);
    if (!stored) return null;
    const map = JSON.parse(stored);
    const c = map[agentId];
    return c && typeof c === 'object' && c.code ? c : null;
  } catch (e) {
    return null;
  }
};

// Set currency for a specific agent
export const setCurrencyForAgent = (agentId, currency) => {
  if (!agentId || !currency) return;
  try {
    const stored = localStorage.getItem(AGENT_CURRENCIES_KEY);
    const map = stored ? JSON.parse(stored) : {};
    map[agentId] = currency;
    localStorage.setItem(AGENT_CURRENCIES_KEY, JSON.stringify(map));
  } catch (e) {
    // ignore
  }
};

// Resolve currency: per-agent if agentId and stored, else global fallback
export const getCurrencyForContext = (agentId) => {
  const agentCurrency = agentId ? getCurrencyForAgent(agentId) : null;
  return agentCurrency || getCurrency();
};

// Format a number with compact notation (K, M, B, T)
export const formatCompactNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return num;
  
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (absNum >= 1e12) {
    return `${sign}${(absNum / 1e12).toFixed(1)}T`;
  } else if (absNum >= 1e9) {
    return `${sign}${(absNum / 1e9).toFixed(1)}B`;
  } else if (absNum >= 1e6) {
    return `${sign}${(absNum / 1e6).toFixed(1)}M`;
  } else if (absNum >= 1e3) {
    return `${sign}${(absNum / 1e3).toFixed(1)}K`;
  } else if (absNum >= 1) {
    // For numbers >= 1, show up to 2 decimal places if needed
    return `${sign}${absNum.toFixed(absNum % 1 === 0 ? 0 : 2)}`;
  } else {
    // For numbers < 1, show up to 4 decimal places
    return `${sign}${absNum.toFixed(4)}`;
  }
};

// Format a number with currency symbol
export const formatCurrency = (num, currency = null) => {
  if (num === null || num === undefined || isNaN(num)) return String(num);
  
  const curr = currency || getCurrency();
  const formatted = formatCompactNumber(num);
  
  if (curr.position === 'after') {
    return `${formatted} ${curr.symbol}`;
  } else {
    return `${curr.symbol}${formatted}`;
  }
};

// Detect and format numbers in text with currency and bold formatting
// Optional second arg: currency override (e.g. from getCurrencyForContext(agentId))
export const formatNumbersInText = (text, currencyOverride = null) => {
  if (!text || typeof text !== 'string') return text;
  
  const currency = currencyOverride || getCurrency();
  
  // Pattern to match numbers (integers and decimals with optional thousands separators).
  // Use \d+ for the leading digits so 4+ digit numbers (e.g. years like 2018) match as one token;
  // \d{1,3} would split 2018 into "201" and "8" and produce **201****8**.
  const numberPattern = /(\d+(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)/g;
  
  // Check if a number is inside a markdown table (between pipes on the same line)
  const isInTable = (matchIndex, text) => {
    // Find the start of the current line
    const lineStart = text.lastIndexOf('\n', matchIndex) + 1;
    // Find the end of the current line
    const lineEnd = text.indexOf('\n', matchIndex);
    const lineEndActual = lineEnd === -1 ? text.length : lineEnd;
    const line = text.substring(lineStart, lineEndActual);
    
    // Check if this line is a table row (contains pipes)
    if (line.includes('|')) {
      return true;
    }
    return false;
  };
  
  // Check if a number is part of a date pattern - if so, don't format it
  const isPartOfDate = (numStr, text, matchIndex) => {
    // Get wider context around the match (80 chars before and after to catch date ranges and written dates)
    const start = Math.max(0, matchIndex - 80);
    const end = Math.min(text.length, matchIndex + numStr.length + 80);
    const context = text.substring(start, end);
    const relativeIndex = matchIndex - start;
    
    // First check for written date formats: "January 15, 2026", "Jan 15, 2026", "15 January 2026", etc.
    const writtenDatePatterns = [
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}/gi,
      /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/gi,
      /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{4}/gi,
    ];
    
    for (const pattern of writtenDatePatterns) {
      pattern.lastIndex = 0; // Reset regex
      let dateMatch;
      while ((dateMatch = pattern.exec(context)) !== null) {
        const dateStart = dateMatch.index;
        const dateEnd = dateStart + dateMatch[0].length;
        // Check if our number is within this written date match
        if (relativeIndex >= dateStart && relativeIndex + numStr.length <= dateEnd) {
          return true;
        }
      }
    }
    
    // Check for date ranges: "from 2025-11-01 to 2026-01-21" or "2025-11-01 to 2026-01-21"
    const dateRangePattern = /(from\s+)?(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s+to\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2})/gi;
    let rangeMatch;
    while ((rangeMatch = dateRangePattern.exec(context)) !== null) {
      const rangeStart = rangeMatch.index;
      const rangeEnd = rangeStart + rangeMatch[0].length;
      // Check if our number is within this date range
      if (relativeIndex >= rangeStart && relativeIndex + numStr.length <= rangeEnd) {
        return true;
      }
    }
    
    // Then check for individual date patterns: YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, etc.
    const datePatterns = [
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/g,  // YYYY-MM-DD or YYYY/MM/DD
      /\d{1,2}[-/]\d{1,2}[-/]\d{4}/g,  // DD-MM-YYYY or DD/MM/YYYY
      /\d{4}\.\d{1,2}\.\d{1,2}/g,      // YYYY.MM.DD
    ];
    
    for (const pattern of datePatterns) {
      pattern.lastIndex = 0; // Reset regex
      let dateMatch;
      while ((dateMatch = pattern.exec(context)) !== null) {
        const dateStart = dateMatch.index;
        const dateEnd = dateStart + dateMatch[0].length;
        // Check if our number is within this date match
        if (relativeIndex >= dateStart && relativeIndex + numStr.length <= dateEnd) {
          return true;
        }
      }
    }
    
    // Check if it's a standalone year (4 digits, 1900-2100, with date separators or month names nearby)
    if (/^\d{4}$/.test(numStr)) {
      const num = parseInt(numStr, 10);
      if (num >= 1900 && num <= 2100) {
        const before = context.substring(Math.max(0, relativeIndex - 20), relativeIndex);
        const after = context.substring(relativeIndex + numStr.length, Math.min(context.length, relativeIndex + numStr.length + 20));
        // Check for date separators or month names nearby
        const monthNames = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)/i;
        if (/[-/\.]\s*$/.test(before) || /^\s*[-/\.]/.test(after) || monthNames.test(before) || monthNames.test(after)) {
          return true;
        }
      }
    }
    
    // Check for day numbers (1-31) followed by month names
    if (/^\d{1,2}$/.test(numStr)) {
      const dayNum = parseInt(numStr, 10);
      if (dayNum >= 1 && dayNum <= 31) {
        const after = context.substring(relativeIndex + numStr.length, Math.min(context.length, relativeIndex + numStr.length + 20));
        const monthNames = /^\s*(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)/i;
        if (monthNames.test(after)) {
          return true;
        }
      }
    }
    
    return false;
  };
  
  // Check if number is in a statistical context (Average, Min, Max, Standard Deviation, etc.)
  const isInStatisticalContext = (matchIndex, text) => {
    // Get context before the number (up to 50 chars)
    const contextStart = Math.max(0, matchIndex - 50);
    const context = text.substring(contextStart, matchIndex).toLowerCase();
    
    // Check for statistical keywords
    const statisticalKeywords = [
      'average', 'mean', 'min', 'minimum', 'max', 'maximum',
      'standard deviation', 'std dev', 'std deviation', 'variance',
      'median', 'mode', 'range', 'count', 'sum', 'total'
    ];
    
    return statisticalKeywords.some(keyword => context.includes(keyword));
  };
  
  // Check if number is in a quantity/units context (e.g. "1,500 units", "2,000 items") — don't add currency
  const isInQuantityContext = (numStr, text, matchIndex) => {
    const afterStart = matchIndex + numStr.length;
    const afterEnd = Math.min(text.length, afterStart + 50);
    const after = text.substring(afterStart, afterEnd).toLowerCase();
    const beforeStart = Math.max(0, matchIndex - 40);
    const before = text.substring(beforeStart, matchIndex).toLowerCase();
    const quantityWords = /\b(units?|items?|records?|quantity|quantities|number\s+of|rows?|entries)\b/;
    return quantityWords.test(after) || quantityWords.test(before);
  };

  // Check if number is likely a currency amount
  const isLikelyCurrency = (numStr, text, matchIndex) => {
    // Skip if it's part of a date
    if (isPartOfDate(numStr, text, matchIndex)) {
      return false;
    }
    
    // Skip if it's in a statistical context
    if (isInStatisticalContext(matchIndex, text)) {
      return false;
    }
    
    // Skip if it's a quantity/units context (e.g. "total 1,500 units") — avoid adding £/$ to counts
    if (isInQuantityContext(numStr, text, matchIndex)) {
      return false;
    }
    
    const num = parseFloat(numStr.replace(/,/g, ''));
    
    // Skip if it's a percentage (has % after it)
    const afterMatch = text.substring(matchIndex + numStr.length, Math.min(text.length, matchIndex + numStr.length + 5));
    if (/^\s*%/.test(afterMatch)) {
      return false;
    }
    
    // Skip single digits (likely not currency)
    if (numStr.length === 1 && num < 10) {
      return false;
    }
    
    // Only consider it currency if it has commas (thousands separator)
    // This is more conservative - only format numbers that are clearly formatted as currency
    return numStr.includes(',');
  };
  
  let lastIndex = 0;
  const parts = [];
  let match;
  
  // Process all number matches
  while ((match = numberPattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    const numStr = match[0];
    
    // Skip formatting if it's in a table
    if (isInTable(match.index, text)) {
      // Keep table numbers as-is (don't format them)
      parts.push(numStr);
    } else if (isPartOfDate(numStr, text, match.index)) {
      // Keep date numbers as-is (don't format them)
      parts.push(numStr);
    } else if (isInStatisticalContext(match.index, text)) {
      // Keep statistical numbers as-is (don't format them)
      parts.push(numStr);
    } else if (isLikelyCurrency(numStr, text, match.index)) {
      // Format currency amounts (only those with commas)
      // Use original number format, not compact notation, but add currency symbol
      const formatted = currency.position === 'after' 
        ? `${numStr} ${currency.symbol}`
        : `${currency.symbol}${numStr}`;
      parts.push(`**${formatted}**`);
    } else {
      // Make other numbers bold (keep original format)
      parts.push(`**${numStr}**`);
    }
    
    lastIndex = match.index + numStr.length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.join('');
};
