import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowDownLeft, Plus, WalletCards, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { payment, user as userApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import Footer from './Footer';
import './Wallet.css';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Wallet() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await userApi.getWallet();
      setWallet({ balance: response.balance || 0, transactions: response.transactions || [] });
    } catch (loadError) {
      setError(loadError.message || 'Could not load your wallet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/');
    if (isAuthenticated) loadWallet();
  }, [authLoading, isAuthenticated, navigate, loadWallet]);

  const addMoney = async (event) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 100 || numericAmount > 50000) {
      setError('Enter an amount between ₹100 and ₹50,000.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const orderData = await userApi.createWalletTopUpOrder(numericAmount);
      await payment.loadScript();
      await new Promise((resolve, reject) => {
        payment.openCheckout({
          orderId: orderData.order.id,
          amount: orderData.order.amount,
          currency: orderData.order.currency,
          customerInfo: { name: user?.name || '', email: user?.email || '', phone: user?.phone || '' },
          bookingDetails: { serviceType: 'wallet', description: 'Add money to Sancharie Wallet' },
          onSuccess: async (razorpayResponse) => {
            try {
              const credited = await userApi.creditWallet(razorpayResponse);
              setWallet({ balance: credited.balance || 0, transactions: credited.transactions || [] });
              setNotice(`${money(numericAmount)} added to your wallet.`);
              resolve();
            } catch (creditError) { reject(creditError); }
          },
          onFailure: (failure) => reject(new Error(failure.description || 'Payment failed.')),
          onDismiss: () => reject(new Error('Payment window closed. Your wallet was not changed.')),
        });
      });
    } catch (topUpError) {
      setError(topUpError.message || 'Could not add money.');
      await loadWallet();
    } finally { setBusy(false); }
  };

  if (authLoading || !isAuthenticated) return null;

  return <div className="wallet-page">
    <Header />
    <main className="wallet-shell">
      <button className="wallet-back" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Back</button>
      <div className="wallet-title"><span className="wallet-title-icon"><WalletCards size={25} /></span><div><p>Sancharie account</p><h1>My Wallet</h1></div></div>
      <div className="wallet-grid">
        <section className="wallet-balance-card">
          <div><span>Available balance</span><strong>{loading ? 'Loading…' : money(wallet.balance)}</strong></div>
          <WalletCards size={30} />
          <small>Use your wallet for faster payments on Sancharie.</small>
        </section>
        <section className="wallet-add-card">
          <h2>Add money</h2>
          <p>Top up securely through Razorpay. Minimum ₹100, maximum ₹50,000.</p>
          <form onSubmit={addMoney}>
            <label htmlFor="wallet-amount">Amount (₹)</label>
            <input id="wallet-amount" type="number" min="100" max="50000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <div className="wallet-quick-amounts">{[500, 1000, 2000].map((value) => <button key={value} type="button" onClick={() => setAmount(String(value))}>₹{value}</button>)}</div>
            <button className="wallet-add-button" type="submit" disabled={busy}><Plus size={18} />{busy ? 'Processing…' : 'Add money securely'}</button>
          </form>
          {error && <p className="wallet-message error" role="alert">{error}</p>}
          {notice && <p className="wallet-message success" role="status">{notice}</p>}
        </section>
        <section className="wallet-history-card">
          <div className="wallet-history-heading"><div><h2>Recent activity</h2><p>Your latest wallet transactions</p></div><Clock3 size={20} /></div>
          {loading ? <p className="wallet-empty">Loading transactions…</p> : wallet.transactions.length ? <ul>{wallet.transactions.map((transaction, index) => <li key={`${transaction.orderId || transaction.paymentId}-${index}`}><span className="wallet-transaction-icon"><ArrowDownLeft size={18} /></span><div className="wallet-transaction-info"><strong>{transaction.description || 'Wallet top-up'}</strong><small>{transaction.createdAt ? new Date(transaction.createdAt).toLocaleString('en-IN') : 'Recently'}</small></div><strong className="wallet-credit">+{money(transaction.amount)}</strong></li>)}</ul> : <p className="wallet-empty">No transactions yet. Add money to get started.</p>}
        </section>
      </div>
    </main>
    <Footer />
  </div>;
}
