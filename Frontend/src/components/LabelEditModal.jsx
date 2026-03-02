import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const LabelEditModal = ({ show, onClose, currentLabel, onSave, agentName }) => {
  const [label, setLabel] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (show) {
      setLabel(currentLabel || '');
      // Focus input after modal is shown
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [show, currentLabel]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      return;
    }
    onSave(trimmedLabel);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Edit Agent Label</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="mb-4">
            <label htmlFor="agent-label" className="block text-sm font-medium text-gray-700 mb-2">
              New label for this agent:
            </label>
            {agentName && (
              <p className="text-xs text-gray-500 mb-2 truncate" title={agentName}>
                Agent: {agentName}
              </p>
            )}
            <input
              ref={inputRef}
              id="agent-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3E0AC2] focus:border-transparent text-gray-900 placeholder-gray-400"
              placeholder="Enter agent label"
              autoFocus
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-[#3E0AC2] rounded-lg hover:bg-[#2B0799] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LabelEditModal;
