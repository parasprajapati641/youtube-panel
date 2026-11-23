import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import { CreditCard, Wallet, DollarSign, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

const AddFunds = () => {
  const { user, updateBalance } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [amount, setAmount] = useState(25);
  const [loading, setLoading] = useState(false);

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/users/add-funds-mock', { amount: Number(amount) });
      toast.success(res.data.message || `Successfully added $${amount} to your balance!`);
      if (res.data.newBalance !== undefined) {
        updateBalance(res.data.newBalance);
      }
    } catch (error) {
      toast.error('Failed to add deposit balance');
    } finally {
      setLoading(false);
    }
  };

  const presetAmounts = [10, 25, 50, 100, 250, 500];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="glass-card rounded-3xl p-6 border border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-accent-emerald" />
            Add Funds to Balance
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Top up your account balance instantly to order YouTube views, likes, and subscribers.
          </p>
        </div>

        <div className="bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald text-xs font-bold px-3 py-1.5 rounded-2xl flex items-center gap-1.5">
          <Wallet className="w-4 h-4 text-accent-emerald" />
          <span>Balance: ${(user?.balance || 0).toFixed(2)}</span>
        </div>
      </div>

      <form onSubmit={handleDeposit} className="glass-card rounded-3xl p-6 md:p-8 border border-gray-800 space-y-6">
        {/* Payment Methods */}
        <div>
          <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">
            Select Payment Gateway
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setSelectedMethod('card')}
              className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                selectedMethod === 'card'
                  ? 'bg-yt-red/15 border-yt-red text-white shadow-glow'
                  : 'bg-dark-800/80 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-6 h-6 text-yt-red" />
              <span className="text-xs font-bold">Credit / Debit Card</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMethod('paypal')}
              className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                selectedMethod === 'paypal'
                  ? 'bg-accent-cyan/15 border-accent-cyan text-white shadow-glow-cyan'
                  : 'bg-dark-800/80 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Wallet className="w-6 h-6 text-accent-cyan" />
              <span className="text-xs font-bold">PayPal / Checkout</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMethod('crypto')}
              className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                selectedMethod === 'crypto'
                  ? 'bg-accent-purple/15 border-accent-purple text-white shadow-glow-cyan'
                  : 'bg-dark-800/80 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Zap className="w-6 h-6 text-accent-purple" />
              <span className="text-xs font-bold">Crypto (USDT / BTC)</span>
            </button>
          </div>
        </div>

        {/* Preset Amounts */}
        <div>
          <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
            Quick Preset Amount ($)
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {presetAmounts.map((amt) => (
              <button
                type="button"
                key={amt}
                onClick={() => setAmount(amt)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  amount === amt
                    ? 'bg-accent-emerald/20 border-accent-emerald text-accent-emerald'
                    : 'bg-dark-800 border-gray-800 text-gray-300 hover:bg-dark-700'
                }`}
              >
                +${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount */}
        <div>
          <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
            Enter Deposit Amount ($ USD)
          </label>
          <div className="relative">
            <DollarSign className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
            <input
              type="number"
              min="1"
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="e.g. 50"
              className="w-full pl-11 pr-4 py-3 rounded-xl glass-input text-base font-bold text-accent-emerald"
            />
          </div>
        </div>

        {/* Mock Deposit Info Notice */}
        <div className="p-4 rounded-2xl bg-dark-800/90 border border-gray-800 text-xs text-gray-400 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-accent-emerald shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-gray-200 block mb-0.5">Instant Demo Credit Activated</span>
            Submitting this request will instantly credit <strong className="text-white">${amount}</strong> to your SMM balance for immediate service testing.
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-accent-emerald to-teal-600 hover:from-teal-500 hover:to-accent-emerald text-white font-extrabold text-sm uppercase tracking-wider shadow-glow-cyan transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirm & Deposit ${amount}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default AddFunds;
