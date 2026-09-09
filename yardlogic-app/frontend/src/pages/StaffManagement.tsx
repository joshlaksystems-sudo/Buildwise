// src/pages/StaffManagement.tsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "OWNER" | "ADMIN" | "STAFF" | "SALESMAN" | "ACCOUNTANT";
  permissions: string[];
}

const PERMISSION_LABELS: Record<string, string> = {
  MEMBERS_VIEW: "View members",
  MEMBERS_EDIT: "Edit members",
  PROSPECTS_MANAGE: "Manage prospects",
  PROPOSALS_MANAGE: "Manage proposals",
  POLICIES_BIND: "Bind policies",
  ACTIONS_MANAGE: "Manage actions",
  FINANCE_VIEW: "View finance",
  FINANCE_EDIT: "Edit finance",
  REBATES_MANAGE: "Manage rebates",
  BUDGET_MANAGE: "Manage budget",
  BORDEREAUX_CLOSE: "Close bordereaux",
  REPORTS_EXPORT: "Export reports",
  STAFF_MANAGE: "Manage staff",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: "Full access, can manage staff and business settings",
  ADMIN: "Administrative access, can manage most features",
  STAFF: "Standard staff access, can create and manage operations",
  SALESMAN: "Sales-focused access, can create invoices and customer orders",
  ACCOUNTANT: "Financial access, can manage payments and reconciliation",
};

export function StaffManagement() {
  const { businessId } = useParams<{ businessId: string }>();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [permissionDraft, setPermissionDraft] = useState<Record<string, string[]>>({});
  const [savingPermissions, setSavingPermissions] = useState<string | null>(null);

  useEffect(() => {
    fetchStaff();
  }, [businessId]);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api<any>(`/business/${businessId}/staff`);
      const permissionsResponse = await api<any>(`/business/${businessId}/permissions`);
      const members = response.staff || [];
      setAvailablePermissions(permissionsResponse.permissions || []);
      setStaff(members.map((member: StaffMember) => ({ ...member, permissions: permissionsResponse.staff?.find((item: any) => item.userId === member.id)?.permissions || [] })));
      setPermissionDraft(Object.fromEntries((permissionsResponse.staff || []).map((item: any) => [item.userId, item.permissions || []])));
    } catch (err) {
      setError((err as any).message || "Failed to load staff");
    } finally {
      setLoading(false);
    }
  };

  const savePermissions = async (staffId: string) => {
    try {
      setSavingPermissions(staffId);
      await api(`/business/${businessId}/staff/${staffId}/permissions`, { method: "PUT", body: JSON.stringify({ permissions: permissionDraft[staffId] || [] }) });
      await fetchStaff();
    } catch (err) {
      setError((err as any).message || "Failed to update permissions");
    } finally {
      setSavingPermissions(null);
    }
  };

  const resetPermissions = (staffId: string) => {
    setPermissionDraft((current) => ({ ...current, [staffId]: [] }));
  };

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      await api<any>(`/business/${businessId}/staff/invite`, {
        method: "POST",
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email") || undefined,
          phone: formData.get("phone") || undefined,
          role: formData.get("role"),
        }),
      });
      
      setShowInvite(false);
      e.currentTarget.reset();
      await fetchStaff();
    } catch (err) {
      setError((err as any).message || "Failed to invite staff");
    }
  };

  const handleUpdateRole = async (staffId: string, role: string) => {
    try {
      await api<any>(`/business/${businessId}/staff/${staffId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setEditingStaffId(null);
      setNewRole("");
      await fetchStaff();
    } catch (err) {
      setError((err as any).message || "Failed to update role");
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    if (!confirm("Are you sure you want to remove this staff member?")) return;

    try {
      await api<any>(`/business/${businessId}/staff/${staffId}`, {
        method: "DELETE",
      });
      await fetchStaff();
    } catch (err) {
      setError((err as any).message || "Failed to remove staff");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading staff members...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Staff Management</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + Invite Staff
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Staff List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {staff.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No staff members yet. Invite someone to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <React.Fragment key={member.id}>
                  <tr key={member.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{member.name}</div>
                      {member.phone && <div className="text-sm text-gray-500">{member.phone}</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{member.email || "-"}</td>
                    <td className="px-6 py-4">
                      {editingStaffId === member.id ? (
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="">Select role...</option>
                          <option value="ADMIN">Admin</option>
                          <option value="STAFF">Staff</option>
                          <option value="SALESMAN">Salesman</option>
                          <option value="ACCOUNTANT">Accountant</option>
                        </select>
                      ) : (
                        <div>
                          <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                            {member.role}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">{ROLE_DESCRIPTIONS[member.role]}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingStaffId === member.id ? (
                        <div className="space-x-2">
                          <button
                            onClick={() => handleUpdateRole(member.id, newRole)}
                            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingStaffId(null);
                              setNewRole("");
                            }}
                            className="bg-gray-400 text-white px-3 py-1 rounded text-sm hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="space-x-2">
                          <button
                            onClick={() => {
                              setEditingStaffId(member.id);
                              setNewRole(member.role);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveStaff(member.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr key={`${member.id}-permissions`} className="border-b bg-gray-50">
                    <td colSpan={4} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-700">Additional permissions</span>
                        <div className="space-x-2">
                          <button type="button" onClick={() => resetPermissions(member.id)} className="text-gray-600 hover:text-gray-900 text-sm">Reset to role defaults</button>
                          <button type="button" onClick={() => void savePermissions(member.id)} disabled={savingPermissions === member.id} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{savingPermissions === member.id ? "Saving..." : "Save permissions"}</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {availablePermissions.map((permission) => {
                          const checked = (permissionDraft[member.id] || []).includes(permission);
                          return <label key={permission} className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={checked} onChange={(event) => setPermissionDraft((current) => ({ ...current, [member.id]: event.target.checked ? [...(current[member.id] || []), permission] : (current[member.id] || []).filter((item) => item !== permission) }))} />{PERMISSION_LABELS[permission] || permission}</label>;
                        })}
                      </div>
                    </td>
                  </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Dialog */}
      {showInvite && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Invite Staff Member</h2>
            
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Staff member name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="staff@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  name="role"
                  required
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a role...</option>
                  <option value="ADMIN">Admin - Full management access</option>
                  <option value="STAFF">Staff - Standard operations</option>
                  <option value="SALESMAN">Salesman - Sales focused</option>
                  <option value="ACCOUNTANT">Accountant - Financial access</option>
                </select>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
                >
                  Invite
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 border rounded-lg px-4 py-2 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-4">
                * Email or phone is required. New staff members will receive an invitation and can set up their account.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
