import { Link, useLocation } from 'react-router-dom';
import { Settings, ArrowLeft, UserPlus, Server, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getApiBase, setApiBase } from '../utils/api';

const Header = ({ title }) => {
  const location = useLocation();
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [limitsEnabled, setLimitsEnabled] = useState(false);

  useEffect(() => {
    setApiBase(apiBase);
  }, [apiBase]);

  useEffect(() => {
    // Check if query limits are enabled
    const checkLimits = () => {
      const saved = localStorage.getItem('chatLimits');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setLimitsEnabled(parsed.limitsEnabled === true);
        } catch (e) {
          setLimitsEnabled(false);
        }
      } else {
        setLimitsEnabled(false);
      }
    };
    
    checkLimits();
    
    // Listen for storage changes (works for cross-tab updates)
    const handleStorageChange = (e) => {
      if (e.key === 'chatLimits' || !e.key) {
        checkLimits();
      }
    };
    
    // Listen for custom events (for same-tab updates)
    const handleCustomStorage = () => {
      checkLimits();
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('chatLimitsChanged', handleCustomStorage);
    
    // Also check periodically in case settings change (for same-tab updates)
    const interval = setInterval(checkLimits, 300);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('chatLimitsChanged', handleCustomStorage);
    };
  }, []);

  const isAgentManager = location.pathname === '/agents';
  const isChat = location.pathname === '/';
  const isCreateAgent = location.pathname === '/create';
  const isSettings = location.pathname === '/settings';

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 overflow-hidden">
      <div className="w-full px-6 min-w-0">
        <div className="flex items-center justify-between h-16 min-w-0 gap-6">
          <div className="flex items-center gap-4 min-w-0 flex-shrink-0">
            <Link to="/" className="flex flex-col items-start flex-shrink-0 hover:opacity-80 transition-opacity gap-0.5">
              <img 
                src="/Logo.svg" 
                alt="Company Logo" 
                className="h-7 w-auto max-w-[140px] object-contain"
              />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Beta</span>
            </Link>
            <div className="h-7 w-px bg-gray-300 flex-shrink-0"></div>
            <h1 className="text-lg font-bold text-gray-900 truncate tracking-tight">{title}</h1>
            {limitsEnabled && (
              <>
                <div className="h-7 w-px bg-gray-300 flex-shrink-0"></div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-md text-xs font-semibold text-amber-700 flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Query Limits Active
                </div>
              </>
            )}
          </div>

          <div className="hidden md:flex items-center gap-3 flex-shrink-0 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex-shrink-0">API Base</label>
              <div className="relative min-w-0">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  value={apiBase}
                  onChange={(e) => setApiBaseState(e.target.value)}
                  className="input-field pl-9 pr-3 w-64 max-w-full text-xs"
                  placeholder="http://localhost:8080"
                />
              </div>
            </div>

            {isAgentManager && (
              <>
                <Link
                  to="/settings"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/settings'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Settings className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/settings'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  Settings
                </Link>
                <Link
                  to="/agents"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/agents'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <img 
                    src="/ai-agent-48.png" 
                    alt="Manage Agents" 
                    className="w-4 h-4 object-contain transition-all duration-200"
                    style={location.pathname === '/agents' ? { filter: 'brightness(0) invert(1)' } : {}}
                  />
                  Manage Agents
                </Link>
                <Link
                  to="/"
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3.5 py-2 rounded-lg transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Chat
                </Link>
                <Link
                  to="/create"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/create'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <UserPlus className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/create'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  New Agent
                </Link>
              </>
            )}

            {isChat && (
              <>
                <Link
                  to="/settings"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/settings'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Settings className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/settings'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  Settings
                </Link>
                <Link
                  to="/agents"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/agents'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <img 
                    src="/ai-agent-48.png" 
                    alt="Manage Agents" 
                    className="w-4 h-4 object-contain transition-all duration-200"
                    style={location.pathname === '/agents' ? { filter: 'brightness(0) invert(1)' } : {}}
                  />
                  Manage Agents
                </Link>
                <Link
                  to="/create"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/create'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <UserPlus className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/create'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  New Agent
                </Link>
              </>
            )}

            {isCreateAgent && (
              <>
                <Link
                  to="/settings"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/settings'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Settings className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/settings'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  Settings
                </Link>
                <Link
                  to="/agents"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/agents'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <img 
                    src="/ai-agent-48.png" 
                    alt="Manage Agents" 
                    className="w-4 h-4 object-contain transition-all duration-200"
                    style={location.pathname === '/agents' ? { filter: 'brightness(0) invert(1)' } : {}}
                  />
                  Manage Agents
                </Link>
                <Link
                  to="/create"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/create'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <UserPlus className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/create'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  New Agent
                </Link>
                <Link
                  to="/"
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3.5 py-2 rounded-lg transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Chat
                </Link>
              </>
            )}

            {isSettings && (
              <>
                <Link
                  to="/settings"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/settings'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Settings className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/settings'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  Settings
                </Link>
                <Link
                  to="/agents"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/agents'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <img 
                    src="/ai-agent-48.png" 
                    alt="Manage Agents" 
                    className="w-4 h-4 object-contain transition-all duration-200"
                    style={location.pathname === '/agents' ? { filter: 'brightness(0) invert(1)' } : {}}
                  />
                  Manage Agents
                </Link>
                <Link
                  to="/create"
                  className={`flex items-center gap-2 text-sm font-semibold px-3.5 py-2 rounded-lg transition-all duration-200 ${
                    location.pathname === '/create'
                      ? 'bg-[#177091] text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <UserPlus className={`w-4 h-4 transition-colors duration-200 ${
                    location.pathname === '/create'
                      ? 'text-white'
                      : 'text-[#177091]'
                  }`} />
                  New Agent
                </Link>
                <Link
                  to="/"
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-3.5 py-2 rounded-lg transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Chat
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
