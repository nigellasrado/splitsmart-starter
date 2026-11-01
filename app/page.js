'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const splitCacheKey = 'splitsmart.split-details';
const groupSelectionKey = 'splitsmart.selected-group';

function getEmoji(description = '') {
  const text = String(description).toLowerCase();
  if (/grocer|vegetable|supermarket|market/.test(text)) return '🛒';
  if (/movie|cinema|ticket/.test(text)) return '🎬';
  if (/dinner|lunch|breakfast|food|pizza|burger|meal|restaurant/.test(text)) return '🍽️';
  if (/cab|taxi|uber|ola/.test(text)) return '🚕';
  if (/coffee|tea|chai/.test(text)) return '☕';
  if (/electric|power/.test(text)) return '💡';
  if (/internet|wifi|broadband/.test(text)) return '📶';
  if (/rent|house|flat|room/.test(text)) return '🏠';
  if (/shopping|clothes|clothing|shoes/.test(text)) return '🛍️';
  if (/fuel|petrol|diesel/.test(text)) return '⛽';
  if (/medicine|medical|hospital/.test(text)) return '💊';
  if (/flight|airport|train|travel/.test(text)) return '✈️';
  return '🧾';
}

export default function Home() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setExpenses([]); return; }
    let cancelled = false;
    const loadExpenses = async () => {
      let query = supabase.from('expenses').select('*');
      query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null);
      const { data, error } = await query.order('created_at', { ascending: true });
      if (!cancelled && !error) {
        let splitDetails = {};
        try { splitDetails = JSON.parse(localStorage.getItem(splitCacheKey) || '{}'); } catch {}
        setExpenses((data || []).map((expense) => ({
          ...expense,
          ...(splitDetails[expense.id] || {}),
        })));
      }
      if (error) console.error('Could not load expenses:', error.message);
    };
    loadExpenses();
    const refresh = window.setInterval(loadExpenses, 10000);
    window.addEventListener('focus', loadExpenses);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      window.removeEventListener('focus', loadExpenses);
    };
  }, [session, groupId]);

  const loadGroups = async () => {
    const { data } = await supabase.from('groups').select('*').order('created_at');
    const loadedGroups = data || [];
    setGroups(loadedGroups);
    setGroupId((current) => {
      const remembered = localStorage.getItem(groupSelectionKey);
      if (loadedGroups.some((group) => group.id === current)) return current;
      if (loadedGroups.some((group) => group.id === remembered)) return remembered;
      return '';
    });
  };

  useEffect(() => {
    if (!session) {
      setGroups([]);
      setGroupId('');
      return;
    }
    loadGroups();
  }, [session]);

  const signUp = async () => {
    setAuthMsg('');
    const { error } = await supabase.auth.signUp({ email, password });
    setAuthMsg(error ? error.message : 'Account created — you are signed in!');
  };
  const signIn = async () => {
    setAuthMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthMsg(error.message);
  };
  const signOut = () => supabase.auth.signOut();

  const createGroup = async () => {
    const name = window.prompt('Name your group (e.g. Goa Trip):');
    if (!name?.trim()) return;
    const { data, error } = await supabase.rpc('create_group', { name: name.trim() });
    if (error) { alert('Group error: ' + error.message); return; }
    await loadGroups();
    setGroupId(data);
    localStorage.setItem(groupSelectionKey, data);
  };

  const joinGroup = async () => {
    const code = window.prompt('Enter the group code:');
    if (!code?.trim()) return;
    const { data, error } = await supabase.rpc('join_group', { code: code.trim() });
    if (error) { alert('Group error: ' + error.message); return; }
    await loadGroups();
    setGroupId(data);
    localStorage.setItem(groupSelectionKey, data);
  };

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const addExpense = async () => {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/split', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: t }),
      });
      const data = await res.json();
      if (data.error) { alert('AI error: ' + data.error); return; }
      const people = Math.max(1, Number(data.people || 1));
      const each = Number(data.each ?? (people > 0 ? data.amount / people : data.amount || 0));
      const baseExpense = {
        user_id: session.user.id,
        name: data.description || t,
        paid_by: 'You',
        amount: data.amount || 0,
        emoji: getEmoji(data.description),
        ...(groupId ? { group_id: groupId } : {}),
      };
      let { data: rows, error } = await supabase.from('expenses')
        .insert({ ...baseExpense, people, each })
        .select();

      if (error && /(?:people|each).*(?:column|schema cache)|column.*(?:people|each)/i.test(error.message)) {
        const fallback = await supabase.from('expenses')
          .insert(baseExpense)
          .select();
        rows = fallback.data;
        error = fallback.error;
      }
      if (error) { alert('Save error: ' + error.message); return; }
      const savedExpense = { ...rows[0], people, each };
      try {
        const splitDetails = JSON.parse(localStorage.getItem(splitCacheKey) || '{}');
        splitDetails[rows[0].id] = { people, each };
        localStorage.setItem(splitCacheKey, JSON.stringify(splitDetails));
      } catch {}
      setExpenses((list) => [...list, savedExpense]);
      setText('');
    } catch (e) { alert('Could not add: ' + e.message); }
    finally { setLoading(false); }
  };

  const removeExpense = async (id) => {
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses((list) => list.filter((e) => e.id !== id));
  };

  if (checking) return <main style={styles.page}><div style={styles.card}>Loading…</div></main>;

  if (!session) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}><div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>Splitly</div></div></div>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>Sign in to see your expenses on any device.</p>
          <input style={styles.input2} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input style={styles.input2} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ characters)" />
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button style={styles.authBtn} onClick={signUp}>Sign up</button>
            <button style={styles.authBtnAlt} onClick={signIn}>Sign in</button>
          </div>
          {authMsg && <div style={{ marginTop: 12, fontSize: 13, color: '#22c55e' }}>{authMsg}</div>}
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.brand}><div style={styles.logo}>S</div><div style={styles.title}>Splitly</div></div>
          <button style={styles.signout} onClick={signOut}>Sign out</button>
        </div>
        <div style={styles.groupBar}>
          <select
            style={styles.groupSelect}
            value={groupId}
            onChange={(event) => {
              setGroupId(event.target.value);
              if (event.target.value) localStorage.setItem(groupSelectionKey, event.target.value);
              else localStorage.removeItem(groupSelectionKey);
            }}
            aria-label="Expense view"
          >
            <option value="">Personal expenses</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <button style={styles.groupButton} onClick={createGroup}>Create</button>
          <button style={styles.groupButton} onClick={joinGroup}>Join</button>
        </div>
        {groupId && groups.find((group) => group.id === groupId)?.join_code && (
          <div style={styles.inviteCode}>
            Invite code: <strong>{groups.find((group) => group.id === groupId).join_code}</strong>
          </div>
        )}
        <div style={styles.addRow}>
          <input style={styles.input} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addExpense()}
            placeholder={loading ? 'Splitting with AI…' : 'Add an expense…'}
            disabled={loading} />
          <button style={{ ...styles.addBtn, opacity: loading ? 0.7 : 1 }} onClick={addExpense} disabled={loading}>
            {loading ? '…' : '+'}
          </button>
        </div>
        <div style={styles.list}>
          {expenses.length === 0 && <div style={styles.empty}>No expenses yet — add your first one above.</div>}
          {expenses.map((e) => (
            <div key={e.id} style={styles.item}>
              <div style={styles.itemEmoji}>{e.emoji || getEmoji(e.name)}</div>
              <div style={styles.itemMain}>
                <div style={styles.itemName}>{e.name}</div>
                {e.people !== undefined && e.people !== null ? (
                  <div style={styles.itemSplit}>
                    {Number(e.people)} people · {inr(e.each || (Number(e.amount || 0) / Number(e.people || 1)))} each
                  </div>
                ) : <div style={styles.itemPaid}>paid by {e.paid_by}</div>}
              </div>
              <div style={styles.itemAmount}>{inr(e.amount)}</div>
              <button style={styles.remove} onClick={() => removeExpense(e.id)}>×</button>
            </div>
          ))}
        </div>
        <div style={styles.total}>Total {inr(total)}</div>
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 48px' },
  card: { width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 24, boxShadow: '0 24px 60px -24px rgba(13,27,62,.28)', border: '1px solid var(--line)', padding: 20, marginTop: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 18, background: 'linear-gradient(135deg, var(--blue), var(--cyan))' },
  title: { fontSize: 20, fontWeight: 800 },
  signout: { border: '1px solid var(--line)', background: '#fff', borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' },
  groupBar: { display: 'flex', gap: 8, marginBottom: 10 },
  groupSelect: { flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 10, padding: '9px 10px', background: '#f7f9fc', color: '#111827', fontWeight: 700 },
  groupButton: { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 10px', background: '#fff', color: '#15803d', fontWeight: 800 },
  inviteCode: { color: 'var(--muted)', fontSize: 12, textAlign: 'center', marginBottom: 12 },
  addRow: { display: 'flex', gap: 10, marginBottom: 16 },
  input: { flex: 1, border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', fontSize: 15, outline: 'none', background: '#f7f9fc', color: '#111827' },
  input2: { width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontSize: 15, outline: 'none', background: '#f7f9fc', color: '#111827', marginBottom: 10, boxSizing: 'border-box' },
  authBtn: { flex: 1, border: 'none', borderRadius: 12, padding: '12px', color: '#fff', fontSize: 15, fontWeight: 800, background: 'linear-gradient(135deg, var(--blue), var(--cyan))', cursor: 'pointer' },
  authBtnAlt: { flex: 1, border: '1px solid var(--line)', borderRadius: 12, padding: '12px', color: '#15803d', fontSize: 15, fontWeight: 800, background: '#fff', cursor: 'pointer' },
  addBtn: { flex: 'none', width: 48, borderRadius: 14, border: 'none', color: '#fff', fontSize: 24, fontWeight: 700, background: 'linear-gradient(135deg, var(--blue), var(--cyan))', cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  item: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 68, background: '#f7f9fc', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 14px' },
  itemEmoji: { width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid var(--line)', fontSize: 19, flex: 'none' },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { color: '#111827', fontWeight: 700, fontSize: 16, lineHeight: 1.15, textTransform: 'capitalize' },
  itemPaid: { color: 'var(--muted)', fontSize: 12.5, marginTop: 1 },
  itemSplit: { color: '#6b7280', fontSize: 13, fontWeight: 600, marginTop: 4 },
  itemAmount: { color: '#111827', fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' },
  remove: { flex: 'none', width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' },
  total: { textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)', fontWeight: 800, fontSize: 16 },
};
