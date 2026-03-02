import { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';

const DeleteConfirmModal = ({ show, onClose, onConfirm, agentName, isGcpAgent }) => {
  const [confirmText, setConfirmText] = useState('');
  const inputRef = useRef(null);
  const requiredText = 'delete';

  useEffect(() => {
    if (show) {
      setConfirmText('');
      // Focus input after modal is shown
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [show]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (confirmText.toLowerCase().trim() === requiredText) {
      onConfirm();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const isConfirmValid = confirmText.toLowerCase().trim() === requiredText;

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
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Confirm Deletion</h3>
          </div>
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
            <p className="text-sm text-gray-700 mb-3">
              {isGcpAgent ? (
                <>
                  You are about to <span className="font-semibold text-red-600">permanently delete</span> the GCP agent{' '}
                  <span className="font-semibold">"{agentName}"</span> from Google Cloud Platform.
                </>
              ) : (
                <>
                  You are about to remove <span className="font-semibold">"{agentName}"</span> from the local profiles list.
                </>
              )}
            </p>
            {isGcpAgent && (
              <p className="text-sm text-red-600 font-medium mb-2">
                This action cannot be undone.
              </p>
            )}
            <p className="text-sm text-gray-500 mb-3">
              {isGcpAgent
                ? 'Please allow a few minutes for the deletion to complete and for the list to update.'
                : 'The list will update shortly.'}
            </p>
            <label htmlFor="delete-confirm" className="block text-sm font-medium text-gray-700 mb-2">
              Type <span className="font-mono font-semibold text-gray-900">delete</span> to confirm:
            </label>
            <input
              ref={inputRef}
              id="delete-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3E0AC2] focus:border-transparent text-gray-900 placeholder-gray-400 font-mono"
              placeholder="Type 'delete' to confirm"
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
              disabled={!isConfirmValid}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGcpAgent ? 'Delete from GCP' : 'Remove from List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
