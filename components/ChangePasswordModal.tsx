import React, { useState } from 'react';
import { Button } from './Button';
import { sheetService } from '../services/sheetService';

interface ChangePasswordModalProps {
  studentId: string;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ studentId, onClose }) => {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPass !== confirmPass) {
      setError("New passwords don't match");
      return;
    }

    if (newPass.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await sheetService.changePassword(studentId, oldPass, newPass);
      if (res.success) {
        setSuccess(true);
        setTimeout(onClose, 2000);
      } else {
        setError(res.message || "Failed to change password");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-24 md:pt-32 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Change Password 🔐</h2>
        
        {success ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-xl font-bold text-emerald-600">Password Changed!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Old Password</label>
              <input 
                type="password" 
                value={oldPass}
                onChange={e => setOldPass(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-slate-800"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">New Password</label>
              <input 
                type="password" 
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-slate-800"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Confirm New Password</label>
              <input 
                type="password" 
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-slate-800"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold">
                ⚠️ {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={loading} className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200">
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
