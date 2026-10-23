import React, { useEffect, useState, useMemo } from 'react';
import { Role, SafeUser, createUserSchema, resetPasswordSchema } from '@campusbite/shared';
import { apiRequest, ApiError } from '../../services/api.js';
import { Navbar } from '../../components/common/Navbar.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import { Link } from 'react-router-dom';
import {
  Users,
  UserPlus,
  KeyRound,
  UserCheck,
  UserX,
  Search,
  AlertCircle,
  CheckCircle2,
  ChefHat,
  Monitor,
  Utensils,
  Boxes,
  BarChart3
} from 'lucide-react';

export const AdminStaffPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create Staff Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: Role.COUNTER as Role
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset Password Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<SafeUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<{ users: SafeUser[] }>('/users');
      setUsers(data.users);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load staff list.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const counterCount = users.filter((u) => u.role === Role.COUNTER && u.isActive).length;
    const kitchenCount = users.filter((u) => u.role === Role.KITCHEN && u.isActive).length;
    return { total, active, counterCount, kitchenCount };
  }, [users]);

  // Handle Create Staff Member
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const validation = createUserSchema.safeParse(createForm);
    if (!validation.success) {
      setCreateError(validation.error.errors[0]?.message || 'Invalid staff details.');
      return;
    }

    try {
      setCreateSubmitting(true);
      const data = await apiRequest<{ user: SafeUser }>('/users', {
        method: 'POST',
        body: JSON.stringify(validation.data)
      });

      setUsers([data.user, ...users]);
      setIsCreateModalOpen(false);
      setCreateForm({ name: '', email: '', password: '', role: Role.COUNTER });
      setSuccessMessage(`Staff member "${data.user.name}" created successfully.`);
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create staff account.');
      }
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Toggle Active/Deactivated Status
  const handleToggleStatus = async (userToToggle: SafeUser) => {
    clearMessages();
    const newStatus = !userToToggle.isActive;

    if (userToToggle.id === currentUser?.id && !newStatus) {
      setErrorMessage('You cannot deactivate your own administrative account.');
      return;
    }

    try {
      const data = await apiRequest<{ user: SafeUser }>(`/users/${userToToggle.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newStatus })
      });

      setUsers(users.map((u) => (u.id === data.user.id ? data.user : u)));
      setSuccessMessage(
        `Staff account "${data.user.name}" has been ${newStatus ? 'activated' : 'deactivated'}.`
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to update account status.');
      }
    }
  };

  // Handle Reset Password Submit
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForReset) return;
    setResetError(null);

    const validation = resetPasswordSchema.safeParse({ newPassword });
    if (!validation.success) {
      setResetError(validation.error.errors[0]?.message || 'Invalid password.');
      return;
    }

    try {
      setResetSubmitting(true);
      await apiRequest(`/users/${selectedUserForReset.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword })
      });

      setIsResetModalOpen(false);
      setSelectedUserForReset(null);
      setNewPassword('');
      setSuccessMessage(`Password reset successfully for "${selectedUserForReset.name}".`);
    } catch (err) {
      if (err instanceof ApiError) {
        setResetError(err.message);
      } else {
        setResetError('Failed to reset password.');
      }
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Navigation Tabs (Staff vs Menu vs Inventory) */}
        <div className="flex border-b border-slate-200 space-x-6 mb-6">
          <Link
            to="/admin/menu"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2"
          >
            <Utensils className="w-4 h-4" />
            <span>Menu & Categories</span>
          </Link>
          <Link
            to="/admin/inventory"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2"
          >
            <Boxes className="w-4 h-4" />
            <span>Inventory & Stock</span>
          </Link>
          <Link
            to="/admin/staff"
            className="pb-3 text-sm font-semibold text-orange-600 border-b-2 border-orange-600 flex items-center space-x-2 whitespace-nowrap"
          >
            <Users className="w-4 h-4" />
            <span>Staff Management</span>
          </Link>
          <Link
            to="/admin/analytics"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2 whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics & Reports</span>
          </Link>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Staff Account Management
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Create and manage authentication credentials, roles, and status for restaurant personnel.
            </p>
          </div>

          <button
            onClick={() => {
              setCreateError(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-sm transition-colors focus:ring-2 focus:ring-orange-500 focus:outline-none"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Staff Member
          </button>
        </div>

        {/* Global Notifications */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 text-xs font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 text-xs font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-slate-100 rounded-lg text-slate-700">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Total Staff</p>
                <p className="text-xl font-bold text-slate-900">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Active Counter</p>
                <p className="text-xl font-bold text-slate-900">{stats.counterCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
                <ChefHat className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Active Kitchen</p>
                <p className="text-xl font-bold text-slate-900">{stats.kitchenCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Active Accounts</p>
                <p className="text-xl font-bold text-slate-900">{stats.active}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-6 flex items-center">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name or email..."
              className="block w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-colors"
            />
          </div>
        </div>

        {/* Staff Table / Mobile Card View */}
        <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="mt-3 text-sm text-slate-500">Loading staff records...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No staff members found</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery ? 'Try adjusting your search query.' : 'Click "Add Staff Member" to create an account.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop View (Table) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">Staff Member</th>
                      <th scope="col" className="px-6 py-3.5">Role</th>
                      <th scope="col" className="px-6 py-3.5">Status</th>
                      <th scope="col" className="px-6 py-3.5">Created Date</th>
                      <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((staff) => (
                      <tr key={staff.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{staff.name}</div>
                          <div className="text-xs text-slate-500">{staff.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge role={staff.role}>{staff.role}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={staff.isActive ? 'success' : 'neutral'}>
                            {staff.isActive ? 'Active' : 'Deactivated'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(staff.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedUserForReset(staff);
                              setNewPassword('');
                              setResetError(null);
                              setIsResetModalOpen(true);
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                            title="Reset Password"
                          >
                            <KeyRound className="w-3.5 h-3.5 mr-1" />
                            Reset
                          </button>

                          <button
                            onClick={() => handleToggleStatus(staff)}
                            disabled={staff.id === currentUser?.id}
                            className={`inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              staff.isActive
                                ? 'text-rose-700 bg-rose-50 hover:bg-rose-100'
                                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            title={staff.isActive ? 'Deactivate Account' : 'Activate Account'}
                          >
                            {staff.isActive ? (
                              <>
                                <UserX className="w-3.5 h-3.5 mr-1" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5 mr-1" />
                                Activate
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile View (Card List) */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredUsers.map((staff) => (
                  <div key={staff.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-slate-900">{staff.name}</h4>
                        <p className="text-xs text-slate-500">{staff.email}</p>
                      </div>
                      <Badge role={staff.role}>{staff.role}</Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Status:</span>
                      <Badge variant={staff.isActive ? 'success' : 'neutral'}>
                        {staff.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-50">
                      <button
                        onClick={() => {
                          setSelectedUserForReset(staff);
                          setNewPassword('');
                          setResetError(null);
                          setIsResetModalOpen(true);
                        }}
                        className="inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200"
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                        Reset Password
                      </button>

                      <button
                        onClick={() => handleToggleStatus(staff)}
                        disabled={staff.id === currentUser?.id}
                        className={`inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg ${
                          staff.isActive
                            ? 'text-rose-700 bg-rose-50 hover:bg-rose-100'
                            : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        } disabled:opacity-40`}
                      >
                        {staff.isActive ? (
                          <>
                            <UserX className="w-3.5 h-3.5 mr-1.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                            Activate
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Create Staff Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add New Staff Member"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">Full Name</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Chef Anita"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Staff Email</label>
            <input
              type="email"
              required
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="anita@campusbite.internal"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Role</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
            >
              <option value={Role.COUNTER}>COUNTER (POS & Cashier)</option>
              <option value={Role.KITCHEN}>KITCHEN (KDS & Chef)</option>
              <option value={Role.ADMIN}>ADMIN (Manager & Reports)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Initial Password</label>
            <input
              type="password"
              required
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">Must include uppercase, lowercase, and a number.</p>
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {createSubmitting ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => {
          setIsResetModalOpen(false);
          setSelectedUserForReset(null);
        }}
        title={`Reset Password for ${selectedUserForReset?.name || 'Staff'}`}
      >
        <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
          {resetError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{resetError}</span>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Setting a new password will immediately revoke all current active sessions and connections for this staff member.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">Must include uppercase, lowercase, and a number.</p>
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => {
                setIsResetModalOpen(false);
                setSelectedUserForReset(null);
              }}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resetSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {resetSubmitting ? 'Resetting...' : 'Save New Password'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
