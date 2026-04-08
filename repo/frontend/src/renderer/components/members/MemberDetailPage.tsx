import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { membersAPI } from '../../services/api';
import type { Member, MemberTransaction, SessionPackage, PaginatedResponse } from '../../types';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';
import EmptyState from '../common/EmptyState';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.9rem', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  padding: '0.5rem 1rem', backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem',
};
const btnDisabled: React.CSSProperties = { ...btnPrimary, opacity: 0.6, cursor: 'not-allowed' };
const btnSecondary: React.CSSProperties = {
  padding: '0.5rem 1rem', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem',
};
const btnDanger: React.CSSProperties = {
  padding: '0.5rem 1rem', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem',
};
const btnWarning: React.CSSProperties = {
  padding: '0.5rem 1rem', backgroundColor: '#ffc107', color: '#333', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem',
};
const btnSuccess: React.CSSProperties = {
  padding: '0.5rem 1rem', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem',
};
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as const };
const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '1.5rem', marginBottom: '1rem',
};
const successStyle: React.CSSProperties = {
  padding: '0.75rem 1rem', backgroundColor: '#d4edda', border: '1px solid #c3e6cb', borderRadius: 4, color: '#155724', marginBottom: '1rem',
};
const statusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: '#d4edda', color: '#155724' },
  frozen: { bg: '#cce5ff', color: '#004085' },
  expired: { bg: '#f8d7da', color: '#721c24' },
};

const MemberDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

  const toggleReveal = (field: string) => {
    setRevealedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  // Session packages (loaded with member detail)
  const [packages, setPackages] = useState<SessionPackage[]>([]);

  // Create package form
  const [showCreatePkg, setShowCreatePkg] = useState(false);
  const [createPkgForm, setCreatePkgForm] = useState({ package_name: '', total_sessions: '', expires_at: '' });
  const [createPkgErr, setCreatePkgErr] = useState('');
  const [createPkgSubmitting, setCreatePkgSubmitting] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<MemberTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');

  // Redeem form
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemForm, setRedeemForm] = useState({ type: 'points_redeem', amount: '', package_id: '' });
  const [redeemErr, setRedeemErr] = useState('');

  // Add value form
  const [showAddValue, setShowAddValue] = useState(false);
  const [addValueForm, setAddValueForm] = useState({ type: 'points_earn', amount: '' });
  const [addValueErr, setAddValueErr] = useState('');

  // Refund form
  const [showRefund, setShowRefund] = useState(false);
  const [refundForm, setRefundForm] = useState({ amount: '' });
  const [refundErr, setRefundErr] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const fetchMember = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const r = await membersAPI.get(id);
      const data = r.data;
      setMember(data.member || data);
      setPackages(data.packages || data.session_packages || []);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load member');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTransactions = useCallback(async (page = 1) => {
    if (!id) return;
    setTxLoading(true);
    setTxError('');
    try {
      const r = await membersAPI.transactions(id, { page, page_size: 15 });
      const d = r.data;
      setTransactions(d.data || d);
      setTxTotal(d.total || (d.data || d).length);
      setTxPage(page);
    } catch (e: any) {
      setTxError(e.response?.data?.error || 'Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchMember(); }, [fetchMember]);
  useEffect(() => { fetchTransactions(1); }, [fetchTransactions]);

  // Redeem
  const handleRedeem = async () => {
    if (!member || !id) return;
    if (member.status === 'frozen') { setRedeemErr('Cannot redeem: member is frozen'); return; }
    if (member.status === 'expired') { setRedeemErr('Cannot redeem: membership expired'); return; }
    if (new Date(member.expires_at) < new Date()) { setRedeemErr('Cannot redeem: membership expired'); return; }

    if (redeemForm.type === 'points_redeem' || redeemForm.type === 'stored_value_use') {
      const amt = parseFloat(redeemForm.amount);
      if (isNaN(amt) || amt <= 0) { setRedeemErr('Amount must be a positive number'); return; }
      if (redeemForm.type === 'points_redeem' && amt > member.points_balance) { setRedeemErr(`Insufficient points. Available: ${member.points_balance}`); return; }
      if (redeemForm.type === 'stored_value_use' && amt > member.stored_value) { setRedeemErr(`Insufficient stored value. Available: $${member.stored_value.toFixed(2)}`); return; }
    }
    if (redeemForm.type === 'session_redeem' && !redeemForm.package_id) { setRedeemErr('Select a session package'); return; }
    if (redeemForm.type === 'session_redeem') {
      const pkg = packages.find(p => p.id === redeemForm.package_id);
      if (pkg && pkg.remaining_sessions <= 0) { setRedeemErr('No remaining sessions in this package'); return; }
      if (pkg && new Date(pkg.expires_at) < new Date()) { setRedeemErr('This session package has expired'); return; }
    }

    setActionLoading(true);
    setRedeemErr('');
    try {
      await membersAPI.redeem(id, {
        type: redeemForm.type,
        amount: redeemForm.type !== 'session_redeem' ? parseFloat(redeemForm.amount) : undefined,
        package_id: redeemForm.type === 'session_redeem' ? redeemForm.package_id : undefined,
      });
      showSuccess('Redemption successful');
      setShowRedeem(false);
      setRedeemForm({ type: 'points_redeem', amount: '', package_id: '' });
      fetchMember();
      fetchTransactions(1);
    } catch (e: any) {
      setRedeemErr(e.response?.data?.error || 'Redemption failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Add value
  const handleAddValue = async () => {
    if (!id) return;
    const amt = parseFloat(addValueForm.amount);
    if (isNaN(amt) || amt <= 0) { setAddValueErr('Amount must be a positive number'); return; }
    setActionLoading(true);
    setAddValueErr('');
    try {
      await membersAPI.addValue(id, { type: addValueForm.type, amount: amt });
      showSuccess(addValueForm.type === 'points_earn' ? `Added ${amt} points` : `Added $${amt.toFixed(2)} stored value`);
      setShowAddValue(false);
      setAddValueForm({ type: 'points_earn', amount: '' });
      fetchMember();
      fetchTransactions(1);
    } catch (e: any) {
      setAddValueErr(e.response?.data?.error || 'Failed to add value');
    } finally {
      setActionLoading(false);
    }
  };

  // Refund
  const handleRefund = async () => {
    if (!member || !id) return;
    const amt = parseFloat(refundForm.amount);
    if (isNaN(amt) || amt <= 0) { setRefundErr('Amount must be a positive number'); return; }
    if (amt > member.stored_value) { setRefundErr(`Cannot refund more than available stored value ($${member.stored_value.toFixed(2)})`); return; }
    // Validate within 7 days
    const daysSinceCreation = (Date.now() - new Date(member.created_at).getTime()) / (1000 * 60 * 60 * 24);
    // This is a client-side hint; the server will enforce the actual rule
    if (daysSinceCreation > 7) {
      setRefundErr('Refunds are only available within 7 days of the last stored value addition. The server will verify eligibility.');
    }
    setActionLoading(true);
    setRefundErr('');
    try {
      await membersAPI.refund(id, { amount: amt });
      showSuccess(`Refunded $${amt.toFixed(2)}`);
      setShowRefund(false);
      setRefundForm({ amount: '' });
      fetchMember();
      fetchTransactions(1);
    } catch (e: any) {
      setRefundErr(e.response?.data?.error || 'Refund failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Freeze/Unfreeze
  const handleFreeze = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await membersAPI.freeze(id);
      showSuccess('Member frozen');
      fetchMember();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfreeze = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await membersAPI.unfreeze(id);
      showSuccess('Member unfrozen');
      fetchMember();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Create session package
  const handleCreatePackage = async () => {
    const name = createPkgForm.package_name.trim();
    const sessions = parseInt(createPkgForm.total_sessions, 10);
    const expiresAt = createPkgForm.expires_at;

    if (!name) { setCreatePkgErr('Package name is required'); return; }
    if (isNaN(sessions) || sessions <= 0) { setCreatePkgErr('Total sessions must be a positive integer'); return; }
    if (!expiresAt) { setCreatePkgErr('Expiry date is required'); return; }
    if (new Date(expiresAt) <= new Date()) { setCreatePkgErr('Expiry date must be in the future'); return; }

    setCreatePkgSubmitting(true);
    setCreatePkgErr('');
    try {
      const r = await membersAPI.createPackage(id!, { package_name: name, total_sessions: sessions, expires_at: expiresAt });
      const newPkg: SessionPackage = r.data;
      setPackages(prev => [...prev, newPkg]);
      setCreatePkgForm({ package_name: '', total_sessions: '', expires_at: '' });
      setShowCreatePkg(false);
      showSuccess(`Session package "${name}" created`);
    } catch (e: any) {
      setCreatePkgErr(e.response?.data?.error || 'Failed to create session package');
    } finally {
      setCreatePkgSubmitting(false);
    }
  };

  const txColumns = [
    { key: 'created_at', header: 'Date', sortable: true, render: (t: MemberTransaction) => new Date(t.created_at).toLocaleString() },
    { key: 'type', header: 'Type', sortable: true, render: (t: MemberTransaction) => <span style={{ textTransform: 'capitalize' as const }}>{t.type.replace(/_/g, ' ')}</span> },
    { key: 'amount', header: 'Amount', sortable: true, render: (t: MemberTransaction) => {
      const isNeg = t.type.includes('redeem') || t.type.includes('use') || t.type.includes('refund');
      return <span style={{ color: isNeg ? '#dc3545' : '#28a745', fontWeight: 500 }}>{isNeg ? '-' : '+'}{Math.abs(t.amount)}</span>;
    }},
    { key: 'description', header: 'Description' },
    { key: 'performed_by', header: 'By' },
  ];

  if (loading) return <LoadingSpinner message="Loading member..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchMember} />;
  if (!member) return <ErrorMessage message="Member not found" />;

  const sc = statusColors[member.status] || { bg: '#eee', color: '#333' };
  const isExpired = new Date(member.expires_at) < new Date();

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => navigate('/members')} style={{ ...btnSecondary, marginBottom: '1rem' }}>&larr; Back to Members</button>

      {successMsg && <div style={successStyle}>{successMsg}</div>}

      {/* Member Info Card */}
      <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.5rem' }}>{member.name}</h2>
          <span style={{ padding: '0.2rem 0.8rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>{member.status}</span>
          <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
            <div><span style={{ fontWeight: 500, color: '#666' }}>Phone:</span> {member.phone}</div>
            <div><span style={{ fontWeight: 500, color: '#666' }}>Tier:</span> {member.tier_id}</div>
            <div><span style={{ fontWeight: 500, color: '#666' }}>Member Since:</span> {new Date(member.created_at).toLocaleDateString()}</div>
            <div><span style={{ fontWeight: 500, color: '#666' }}>Expires:</span> <span style={{ color: isExpired ? '#dc3545' : '#333' }}>{new Date(member.expires_at).toLocaleDateString()}{isExpired ? ' (expired)' : ''}</span></div>
            {member.verification_status !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 500, color: '#666' }}>Verification:</span>
                <span>{revealedFields.has('verification_status') ? member.verification_status || '—' : '••••••'}</span>
                <button onClick={() => toggleReveal('verification_status')} title={revealedFields.has('verification_status') ? 'Hide' : 'Reveal'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}>
                  {revealedFields.has('verification_status') ? '🙈' : '👁️'}
                </button>
              </div>
            )}
            {member.deposits !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 500, color: '#666' }}>Deposits:</span>
                <span>{revealedFields.has('deposits') ? member.deposits || '—' : '••••••'}</span>
                <button onClick={() => toggleReveal('deposits')} title={revealedFields.has('deposits') ? 'Hide' : 'Reveal'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}>
                  {revealedFields.has('deposits') ? '🙈' : '👁️'}
                </button>
              </div>
            )}
            {member.violation_notes !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', gridColumn: '1 / -1' }}>
                <span style={{ fontWeight: 500, color: '#666' }}>Violation Notes:</span>
                <span>{revealedFields.has('violation_notes') ? member.violation_notes || '—' : '••••••'}</span>
                <button onClick={() => toggleReveal('violation_notes')} title={revealedFields.has('violation_notes') ? 'Hide' : 'Reveal'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}>
                  {revealedFields.has('violation_notes') ? '🙈' : '👁️'}
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          <div style={{ textAlign: 'center', padding: '0.75rem 1.5rem', backgroundColor: '#e8f5e9', borderRadius: 8 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2e7d32' }}>{member.points_balance.toLocaleString()}</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Points</div>
          </div>
          <div style={{ textAlign: 'center', padding: '0.75rem 1.5rem', backgroundColor: '#e3f2fd', borderRadius: 8 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1565c0' }}>${member.stored_value.toFixed(2)}</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Stored Value</div>
          </div>
        </div>
      </div>

      {/* Session Packages */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Session Packages</h3>
          <button
            onClick={() => { setShowCreatePkg(v => !v); setCreatePkgErr(''); }}
            style={btnSuccess}
          >
            {showCreatePkg ? 'Cancel' : '+ Add Package'}
          </button>
        </div>

        {/* Create package form */}
        {showCreatePkg && (
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: 4, marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem' }}>New Session Package</h4>
            {createPkgErr && (
              <div data-testid="pkg-create-error" style={{ color: '#dc3545', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                {createPkgErr}
              </div>
            )}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Package Name *</label>
              <input
                data-testid="pkg-name-input"
                value={createPkgForm.package_name}
                onChange={e => setCreatePkgForm(f => ({ ...f, package_name: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. 10-Session Physio Pack"
              />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Total Sessions *</label>
              <input
                data-testid="pkg-sessions-input"
                type="number"
                min="1"
                step="1"
                value={createPkgForm.total_sessions}
                onChange={e => setCreatePkgForm(f => ({ ...f, total_sessions: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. 10"
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Expires At *</label>
              <input
                data-testid="pkg-expires-input"
                type="date"
                value={createPkgForm.expires_at}
                onChange={e => setCreatePkgForm(f => ({ ...f, expires_at: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <button
              data-testid="pkg-create-submit"
              onClick={handleCreatePackage}
              disabled={createPkgSubmitting}
              style={createPkgSubmitting ? btnDisabled : btnPrimary}
            >
              {createPkgSubmitting ? 'Creating...' : 'Create Package'}
            </button>
          </div>
        )}

        {packages.length === 0 ? (
          <div style={{ color: '#999', textAlign: 'center', padding: '1rem' }}>No session packages</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {packages.map(pkg => {
              const pkgExpired = new Date(pkg.expires_at) < new Date();
              const pkgDepleted = pkg.remaining_sessions <= 0;
              const pkgState: 'active' | 'expired' | 'depleted' = pkgExpired ? 'expired' : pkgDepleted ? 'depleted' : 'active';
              const pkgStateColors: Record<string, { bg: string; color: string }> = {
                active:   { bg: '#d4edda', color: '#155724' },
                expired:  { bg: '#f8d7da', color: '#721c24' },
                depleted: { bg: '#e2e3e5', color: '#383d41' },
              };
              const sc2 = pkgStateColors[pkgState];
              return (
                <div key={pkg.id} style={{ padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: pkgState !== 'active' ? '#fafafa' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 600 }}>{pkg.package_name}</div>
                    <span style={{ padding: '0.1rem 0.5rem', borderRadius: 10, fontSize: '0.75rem', fontWeight: 600, backgroundColor: sc2.bg, color: sc2.color }}>
                      {pkgState}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginTop: 4 }}>
                    {pkg.remaining_sessions}/{pkg.total_sessions} sessions remaining
                  </div>
                  <div style={{ fontSize: '0.8rem', color: pkgExpired ? '#dc3545' : '#999', marginTop: 2 }}>
                    Expires: {new Date(pkg.expires_at).toLocaleDateString()}{pkgExpired ? ' (expired)' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 1rem' }}>Actions</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button onClick={() => setShowRedeem(true)} style={btnPrimary} disabled={member.status === 'frozen' || isExpired}>Redeem Benefit</button>
          <button onClick={() => setShowAddValue(true)} style={btnSuccess}>Add Value</button>
          <button onClick={() => setShowRefund(true)} style={btnWarning} disabled={member.stored_value <= 0}>Refund Stored Value</button>
          {member.status === 'frozen' ? (
            <button onClick={handleUnfreeze} disabled={actionLoading} style={actionLoading ? btnDisabled : btnSuccess}>
              {actionLoading ? 'Processing...' : 'Unfreeze'}
            </button>
          ) : member.status === 'active' ? (
            <button onClick={handleFreeze} disabled={actionLoading} style={actionLoading ? btnDisabled : btnDanger}>
              {actionLoading ? 'Processing...' : 'Freeze'}
            </button>
          ) : null}
        </div>

        {/* Redeem Form */}
        {showRedeem && (
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: 4, marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem' }}>Redeem Benefit</h4>
            {redeemErr && <div style={{ color: '#dc3545', marginBottom: '0.5rem', fontSize: '0.85rem' }}>{redeemErr}</div>}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Type</label>
              <select value={redeemForm.type} onChange={e => setRedeemForm({ ...redeemForm, type: e.target.value, amount: '', package_id: '' })} style={selectStyle}>
                <option value="points_redeem">Points Redeem</option>
                <option value="stored_value_use">Stored Value Use</option>
                <option value="session_redeem">Session Redeem</option>
              </select>
            </div>
            {(redeemForm.type === 'points_redeem' || redeemForm.type === 'stored_value_use') && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                  Amount {redeemForm.type === 'points_redeem' ? `(available: ${member.points_balance})` : `(available: $${member.stored_value.toFixed(2)})`}
                </label>
                <input type="number" min="0" step={redeemForm.type === 'stored_value_use' ? '0.01' : '1'}
                  value={redeemForm.amount} onChange={e => setRedeemForm({ ...redeemForm, amount: e.target.value })} style={inputStyle} placeholder="0" />
              </div>
            )}
            {redeemForm.type === 'session_redeem' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Session Package</label>
                <select value={redeemForm.package_id} onChange={e => setRedeemForm({ ...redeemForm, package_id: e.target.value })} style={selectStyle}>
                  <option value="">Select package...</option>
                  {packages.filter(p => p.remaining_sessions > 0 && new Date(p.expires_at) >= new Date()).map(p => (
                    <option key={p.id} value={p.id}>{p.package_name} ({p.remaining_sessions} left)</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleRedeem} disabled={actionLoading} style={actionLoading ? btnDisabled : btnPrimary}>
                {actionLoading ? 'Processing...' : 'Redeem'}
              </button>
              <button onClick={() => { setShowRedeem(false); setRedeemErr(''); }} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}

        {/* Add Value Form */}
        {showAddValue && (
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: 4, marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem' }}>Add Value</h4>
            {addValueErr && <div style={{ color: '#dc3545', marginBottom: '0.5rem', fontSize: '0.85rem' }}>{addValueErr}</div>}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Type</label>
              <select value={addValueForm.type} onChange={e => setAddValueForm({ ...addValueForm, type: e.target.value })} style={selectStyle}>
                <option value="points_earn">Points</option>
                <option value="stored_value_add">Stored Value</option>
              </select>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Amount</label>
              <input type="number" min="0" step={addValueForm.type === 'stored_value_add' ? '0.01' : '1'}
                value={addValueForm.amount} onChange={e => setAddValueForm({ ...addValueForm, amount: e.target.value })} style={inputStyle} placeholder="0" />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleAddValue} disabled={actionLoading} style={actionLoading ? btnDisabled : btnSuccess}>
                {actionLoading ? 'Processing...' : 'Add'}
              </button>
              <button onClick={() => { setShowAddValue(false); setAddValueErr(''); }} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}

        {/* Refund Form */}
        {showRefund && (
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: 4, marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem' }}>Refund Stored Value</h4>
            {refundErr && <div style={{ color: '#dc3545', marginBottom: '0.5rem', fontSize: '0.85rem' }}>{refundErr}</div>}
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.75rem' }}>
              Refunds are available within 7 days of the last stored value addition for unused amounts.
              Available: ${member.stored_value.toFixed(2)}
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Amount ($)</label>
              <input type="number" min="0" step="0.01" max={member.stored_value}
                value={refundForm.amount} onChange={e => setRefundForm({ amount: e.target.value })} style={inputStyle} placeholder="0.00" />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleRefund} disabled={actionLoading} style={actionLoading ? btnDisabled : btnWarning}>
                {actionLoading ? 'Processing...' : 'Refund'}
              </button>
              <button onClick={() => { setShowRefund(false); setRefundErr(''); }} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 1rem' }}>Transaction History</h3>
        {txLoading && <LoadingSpinner message="Loading transactions..." />}
        {txError && <ErrorMessage message={txError} onRetry={() => fetchTransactions(txPage)} />}
        {!txLoading && !txError && transactions.length === 0 && <EmptyState message="No transactions yet" />}
        {!txLoading && !txError && transactions.length > 0 && (
          <>
            <DataTable<MemberTransaction> columns={txColumns} data={transactions} />
            <Pagination page={txPage} pageSize={15} total={txTotal} onPageChange={fetchTransactions} />
          </>
        )}
      </div>
    </div>
  );
};

export default MemberDetailPage;
