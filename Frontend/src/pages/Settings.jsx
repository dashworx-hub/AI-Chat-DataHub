import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RotateCcw } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Toast from '../components/Toast';

const Settings = () => {
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [settings, setSettings] = useState({
    limitsEnabled: false,
    maxHistoryMessages: 10,
    maxQueryLength: 500,
    maxTurns: 6,
  });

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('chatLimits');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(parsed);
      } catch (e) {
        console.error('Failed to parse saved settings:', e);
      }
    }
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 3000);
  };

  const handleSave = () => {
    localStorage.setItem('chatLimits', JSON.stringify(settings));
    // Dispatch custom event to notify other components in same tab
    window.dispatchEvent(new Event('chatLimitsChanged'));
    showToast('Settings saved successfully', 'success');
  };

  const handleReset = () => {
    const defaults = {
      limitsEnabled: false,
      maxHistoryMessages: 10,
      maxQueryLength: 500,
      maxTurns: 6,
    };
    setSettings(defaults);
    localStorage.setItem('chatLimits', JSON.stringify(defaults));
    // Dispatch custom event to notify other components in same tab
    window.dispatchEvent(new Event('chatLimitsChanged'));
    showToast('Settings reset to defaults', 'info');
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      // Auto-save to localStorage on change
      localStorage.setItem('chatLimits', JSON.stringify(updated));
      // Dispatch custom event to notify other components in same tab
      window.dispatchEvent(new Event('chatLimitsChanged'));
      return updated;
    });
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden page-enter">
      <Header title="Settings" />
      <main className="flex-1 overflow-hidden px-6 py-6">
        <div className="w-full space-y-5">
          {/* Page Title */}
          <div className="flex items-center gap-3 mb-6 fade-in">
            <SettingsIcon className="w-6 h-6 text-[#3E0AC2]" />
            <h1 className="text-2xl font-bold text-gray-900 font-display">Query Limits & Testing Settings</h1>
          </div>

          {/* Main Toggle */}
          <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 scale-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">Enable Query Limits</h3>
                      <p className="text-sm text-gray-600">
                        When enabled, all limits below will be applied. When disabled, no limits are enforced.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.limitsEnabled}
                        onChange={(e) => updateSetting('limitsEnabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
            </div>
          </div>

          {/* Limits Section */}
          <div className={`${!settings.limitsEnabled ? 'opacity-50' : ''} fade-in`} style={{ animationDelay: '0.15s' }}>
            <div className="border border-gray-200 rounded-xl p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-5">Limit Configuration</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Max History Messages */}
                <div>
                  <label className="text-label mb-2 block">
                    Maximum History Messages
                  </label>
                  <p className="text-hint mb-3">
                    Limits the number of previous messages sent to the API. Helps control context size and token usage.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={settings.maxHistoryMessages}
                      onChange={(e) => updateSetting('maxHistoryMessages', parseInt(e.target.value) || 1)}
                      disabled={!settings.limitsEnabled}
                      className="input-field w-32"
                    />
                    <span className="text-sm text-gray-600">
                      messages (1-50)
                    </span>
                  </div>
                </div>

                {/* Max Query Length */}
                <div>
                  <label className="text-label mb-2 block">
                    Maximum Query Length
                  </label>
                  <p className="text-hint mb-3">
                    Maximum number of characters allowed in a single user message. Messages exceeding this limit will be rejected.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min="100"
                      max="5000"
                      step="50"
                      value={settings.maxQueryLength}
                      onChange={(e) => updateSetting('maxQueryLength', parseInt(e.target.value) || 100)}
                      disabled={!settings.limitsEnabled}
                      className="input-field w-32"
                    />
                    <span className="text-sm text-gray-600">
                      characters (100-5000)
                    </span>
                  </div>
                </div>

                {/* Max Turns */}
                <div>
                  <label className="text-label mb-2 block">
                    Maximum Turns
                  </label>
                  <p className="text-hint mb-3">
                    Maximum number of conversation turns to include in context. This overrides the backend default.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.maxTurns}
                      onChange={(e) => updateSetting('maxTurns', parseInt(e.target.value) || 1)}
                      disabled={!settings.limitsEnabled}
                      className="input-field w-32"
                    />
                    <span className="text-sm text-gray-600">
                      turns (1-20)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">Note</h4>
            <p className="text-sm text-blue-800 leading-relaxed">
              These limits are currently enforced in the UI only. Backend and GCP-level enforcement will be added later.
              Settings are saved automatically and persist across sessions.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-5 border-t border-gray-200">
            <button
              onClick={handleSave}
              className="btn-primary"
            >
              <Save className="w-4 h-4" />
              Save Settings
            </button>
            <button
              onClick={handleReset}
              className="btn-secondary"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
          </div>
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

export default Settings;
