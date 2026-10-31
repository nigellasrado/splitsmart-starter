'use client';

import { useEffect, useState } from 'react';

// The starter data — the same "My Group" you see in the course slide. You'll replace
// this with a real database in Hour 5. For now it lives in the browser (localStorage).
const SEED = [
  { id: 'seed-1', emoji: '🍽️', name: 'Dinner', paidBy: 'Aisha', amount: 1800 },
  { id: 'seed-2', emoji: '🚕', name: 'Cab', paidBy: 'Raj', amount: 400 },
];

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

function getEmoji(description = '') {
  const d = String(description).toLowerCase();
  if (d.includes('dinner') || d.includes('lunch') || d.includes('food') || d.includes('pizza') || d.includes('burger') || d.includes('meal')) return '🍽️';
  if (d.includes('cab') || d.includes('taxi') || d.includes('uber') || d.includes('auto') || d.includes('ride')) return '🚕';
  if (d.includes('coffee') || d.includes('tea') || d.includes('drink') || d.includes('chai') || d.includes('cafe')) return '☕';
  if (d.includes('grocer') || d.includes('market') || d.includes('supermarket') || d.includes('snack')) return '🛒';
  if (d.includes('movie') || d.includes('cinema') || d.includes('film') || d.includes('ticket')) return '🎬';
  if (d.includes('hotel') || d.includes('stay') || d.includes('room') || d.includes('airbnb')) return '🏨';
  if (d.includes('flight') || d.includes('plane') || d.includes('travel') || d.includes('trip')) return '✈️';
  return '🧾';
}

// Fallback naive parser in case of network disconnect
function parseExpenseFallback(text) {
  const amountMatch = text.match(/\d[\d,]*(\.\d+)?/);
  const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
  const name = text.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() || 'Expense';
  return { id: 'e-' + Date.now(), emoji: '🧾', name: name.charAt(0).toUpperCase() + name.slice(1), paidBy: 'You', amount };
}

export default function Home() {
  const [expenses, setExpenses] = useState(SEED);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load any saved expenses from the browser on first render.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('splitsmart.expenses');
      if (saved) setExpenses(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, []);

  // Save whenever the list changes.
  useEffect(() => {
    if (ready) {
      try { localStorage.setItem('splitsmart.expenses', JSON.stringify(expenses)); } catch {}
    }
  }, [expenses, ready]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const addExpense = async () => {
    const t = text.trim();
    if (!t || loading) return;

    setLoading(true);
    try {
      // Call the serverless Gemini brain at /api/split
      const res = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: t }),
      });

      if (!res.ok) throw new Error('API split error');
      const data = await res.json();

      const amount = Number(data.amount || 0);
      const people = Number(data.people || 1);
      const each = Number(data.each !== undefined ? data.each : (people > 0 ? amount / people : amount));
      const desc = data.description
        ? data.description.charAt(0).toUpperCase() + data.description.slice(1)
        : 'Expense';

      const newExpense = {
        id: 'e-' + Date.now(),
        emoji: getEmoji(data.description),
        name: desc,
        paidBy: people > 1 ? `You (₹${Number(each).toLocaleString('en-IN')} each for ${people})` : 'You',
        amount: amount,
        each: each,
        people: people,
      };

      setExpenses((list) => [...list, newExpense]);
      setText('');
    } catch (err) {
      console.error('Error calling /api/split, using fallback:', err);
      setExpenses((list) => [...list, parseExpenseFallback(t)]);
      setText('');
    } finally {
      setLoading(false);
    }
  };

  const removeExpense = (id) => setExpenses((list) => list.filter((e) => e.id !== id));

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <div style={styles.title}>Splitly</div>
          </div>
          <div style={styles.groupPill}>My Group</div>
        </div>

        {/* Add an expense */}
        <div style={styles.addRow}>
          <input
            style={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addExpense()}
            placeholder={loading ? 'Splitting with AI…' : 'Add an expense…'}
            aria-label="Add an expense"
            disabled={loading}
          />
          <button
            style={{
              ...styles.addBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
            onClick={addExpense}
            disabled={loading}
            aria-label="Add"
          >
            {loading ? '…' : '+'}
          </button>
        </div>

        {/* Expense list */}
        <div style={styles.list}>
          {expenses.length === 0 && (
            <div style={styles.empty}>No expenses yet — add your first one above.</div>
          )}
          {expenses.map((e) => (
            <div key={e.id} style={styles.item}>
              <div style={styles.itemEmoji}>{e.emoji}</div>
              <div style={styles.itemMain}>
                <div style={styles.itemName}>{e.name}</div>
                <div style={styles.itemPaid}>
                  {e.people !== undefined
                    ? `${e.people} ${e.people === 1 ? 'person' : 'people'} · ${inr(e.each)} each`
                    : `paid by ${e.paidBy}`}
                </div>
              </div>
              <div style={styles.itemAmount}>{inr(e.amount)}</div>
              <button style={styles.remove} onClick={() => removeExpense(e.id)} aria-label={`Remove ${e.name}`}>×</button>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={styles.total}>Total {inr(total)}</div>
      </div>

      <p style={styles.footnote}>
        Splitly · deepEntra Academy — Build &amp; Ship It.<br />
        This is the basic app — powered by Gemini AI and serverless routes.
      </p>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '36px 16px 56px',
    background: 'var(--bg)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    background: 'var(--card)',
    borderRadius: 20,
    boxShadow: '0 24px 60px -20px rgba(0, 0, 0, 0.6)',
    border: '1px solid var(--line)',
    padding: 22,
    marginTop: 12,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    display: 'grid',
    placeItems: 'center',
    color: '#fff',
    fontWeight: 800,
    fontSize: 18,
    background: 'linear-gradient(135deg, #5865F2, #26C6FF)',
    boxShadow: '0 8px 18px -6px rgba(88, 101, 242, 0.45)',
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: 'var(--ink)',
  },
  groupPill: {
    fontSize: 12,
    fontWeight: 700,
    color: '#8ea1e1',
    background: 'rgba(88, 101, 242, 0.16)',
    padding: '6px 12px',
    borderRadius: 999,
    letterSpacing: '0.01em',
  },
  addRow: { display: 'flex', gap: 10, marginBottom: 18 },
  input: {
    flex: 1,
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '13px 15px',
    fontSize: 15,
    outline: 'none',
    background: 'var(--surface)',
    color: 'var(--ink)',
    transition: 'border-color 0.2s',
  },
  addBtn: {
    flex: 'none',
    width: 48,
    borderRadius: 12,
    border: 'none',
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #10b981, #059669)',
    boxShadow: '0 10px 22px -8px rgba(16, 185, 129, 0.5)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 },
  empty: { color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    padding: '13px 14px',
  },
  itemEmoji: {
    width: 40,
    height: 40,
    borderRadius: 11,
    display: 'grid',
    placeItems: 'center',
    background: 'var(--card)',
    border: '1px solid var(--line)',
    fontSize: 19,
    flex: 'none',
  },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontWeight: 700, fontSize: 15, color: 'var(--ink)', letterSpacing: '-0.01em' },
  itemPaid: { color: 'var(--muted)', fontSize: 13, marginTop: 2, fontWeight: 500 },
  itemAmount: { fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' },
  remove: {
    flex: 'none',
    width: 26,
    height: 26,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: 18,
    lineHeight: 1,
    display: 'grid',
    placeItems: 'center',
    transition: 'color 0.2s',
  },
  total: {
    textAlign: 'center',
    marginTop: 22,
    paddingTop: 16,
    borderTop: '1px solid var(--line)',
    fontWeight: 800,
    fontSize: 17,
    letterSpacing: '-0.01em',
    color: 'var(--ink)',
  },
  footnote: {
    color: 'var(--muted)',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 1.6,
    marginTop: 22,
    maxWidth: 420,
  },
};
