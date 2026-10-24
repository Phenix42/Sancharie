import { useState } from 'react';
import { ChevronDown, ChevronUp, CircleAlert, Clock3, ShieldCheck } from 'lucide-react';
import { parseCancellationPolicy } from '../utils/seatLayoutParser';

const formatRupees = (value, decimals = 2) => `₹${(Number(value) || 0).toLocaleString('en-IN', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
})}`;

const formatPolicyDateTime = (date) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(date);
  const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
  const period = date.getHours() >= 18 ? 'night' : date.getHours() >= 12 ? 'afternoon' : 'morning';
  return `${day}, ${time} · ${weekday} ${period}`;
};

const getWindowLabel = (policy, departureDate) => {
  const cutoff = String(policy?.cutoffTime ?? policy?.CutoffTime ?? '').trim();
  const range = cutoff.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?:\s*(hours?|hrs?|minutes?|mins?))?$/i);
  if (range) {
    const minutes = /min/i.test(range[3] || '');
    const unit = minutes ? 60_000 : 3_600_000;
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (departureDate) {
      return `If cancelled between ${formatPolicyDateTime(new Date(departureDate.getTime() - end * unit))} and ${formatPolicyDateTime(new Date(departureDate.getTime() - start * unit))}`;
    }
    return `If cancelled between ${range[1]}–${range[2]} ${minutes ? 'minutes' : 'hours'} before departure`;
  }

  if (cutoff && Number.isFinite(Number(cutoff))) {
    const hours = Number(cutoff);
    if (departureDate) return `If cancelled before ${formatPolicyDateTime(new Date(departureDate.getTime() - hours * 3_600_000))}`;
    return `If cancelled more than ${hours} hours before departure`;
  }

  const from = Number(policy?.FromMinutes ?? policy?.fromMinutes);
  const to = Number(policy?.ToMinutes ?? policy?.toMinutes);
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
    if (departureDate) {
      return `If cancelled between ${formatPolicyDateTime(new Date(departureDate.getTime() - to * 60_000))} and ${formatPolicyDateTime(new Date(departureDate.getTime() - from * 60_000))}`;
    }
    return `If cancelled ${from}–${to} minutes before departure`;
  }

  return 'Cancellation window set by the bus operator';
};

export default function CancellationPolicySummary({ bus, selectedSeats = [], fareData, originalFare = 0, promotion }) {
  const [expanded, setExpanded] = useState(false);
  const policies = parseCancellationPolicy(bus?.CancellationPolicy || bus?.CancellationPolicies || bus?.cancellationPolicy);
  const departureDate = (() => {
    const date = new Date(bus?.DepartureTime || '');
    return Number.isNaN(date.getTime()) ? null : date;
  })();

  const seatFareData = selectedSeats.reduce((sum, seat) => {
    const raw = seat.fullData || seat;
    const baseFare = Number(raw.fare ?? raw.baseFare ?? seat.baseFare ?? 0) || 0;
    const tax = Number(raw.serviceTaxAmount ?? seat.serviceTaxAmount ?? 0) || 0;
    const total = Number(raw.totalFareWithTaxes ?? seat.price ?? 0) || 0;
    const hasProviderTotal = total > 0 && raw.totalFareWithTaxes !== undefined;
    return {
      baseFare: sum.baseFare + baseFare,
      taxes: sum.taxes + tax,
      providerTotal: sum.providerTotal + (hasProviderTotal ? total : baseFare + tax),
      providerDiscount: sum.providerDiscount + (hasProviderTotal ? Math.max(0, baseFare + tax - total) : 0),
      taxRates: raw.serviceTaxPer ? [...sum.taxRates, Number(raw.serviceTaxPer)] : sum.taxRates,
    };
  }, { baseFare: 0, taxes: 0, providerTotal: 0, providerDiscount: 0, taxRates: [] });

  const baseFare = seatFareData.baseFare || Number(fareData?.baseFare) || 0;
  const taxes = seatFareData.taxes || Number(fareData?.serviceTax || fareData?.gst) || 0;
  const seatDiscount = seatFareData.providerDiscount;
  const promoDiscount = Math.min(Number(promotion?.discountAmount) || 0, Math.max(0, baseFare - seatDiscount));
  const fareAfterDiscounts = Math.max(0, baseFare - seatDiscount - promoDiscount);
  const paidTotal = Math.max(0, Number(originalFare || fareData?.totalFare || 0) - promoDiscount);
  const normalizedTaxRates = seatFareData.taxRates.map((rate) => rate < 1 ? rate * 100 : rate);
  const cancellationGstRate = normalizedTaxRates.length
    ? normalizedTaxRates.reduce((total, rate) => total + rate, 0) / normalizedTaxRates.length
    : 5;

  return (
    <section className="fare-cancellation-summary">
      <button
        className="fare-cancellation-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="fare-cancellation-icon"><ShieldCheck size={17} /></span>
        <span className="fare-cancellation-title">
          <strong>Cancellation policy</strong>
          <small>{expanded ? 'Tap to hide refund rules' : 'Tap to view refund rules'}</small>
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded && (
        <div className="fare-cancellation-rules">
          {policies.length ? policies.map((policy, index) => {
            const rawRefund = policy.refundInPercentage ?? policy.RefundPercent ?? policy.refundPercent;
            const refundPercentage = Math.max(0, Math.min(100, Number.parseFloat(String(rawRefund ?? '').replace('%', '')) || 0));
            const deductionPercentage = 100 - refundPercentage;
            const cancellationFee = fareAfterDiscounts * deductionPercentage / 100;
            const cancellationGst = cancellationFee * cancellationGstRate / 100;
            const totalDeducted = cancellationFee + cancellationGst;
            const refundAmount = Math.max(0, paidTotal - totalDeducted);

            return (
              <article className="fare-cancellation-rule" key={`cancellation-${index}`}>
                <h4><Clock3 size={16} />{getWindowLabel(policy, departureDate)}</h4>
                {refundPercentage === 0 ? (
                  <div className="fare-cancellation-no-refund"><CircleAlert size={15} />No refund available</div>
                ) : (
                  <>
                    <div className="fare-cancellation-charge"><CircleAlert size={15} />{deductionPercentage}% of fare + GST will be deducted</div>
                    <div className="fare-cancellation-line"><span>Base fare</span><strong>{formatRupees(baseFare)}</strong></div>
                    {seatDiscount > 0 && <div className="fare-cancellation-line discount"><span>Seat discount</span><strong>−{formatRupees(seatDiscount)}</strong></div>}
                    {promoDiscount > 0 && <div className="fare-cancellation-line discount"><span>Promo discount</span><strong>−{formatRupees(promoDiscount)}</strong></div>}
                    <div className="fare-cancellation-line"><span>Fare after discounts</span><strong>{formatRupees(fareAfterDiscounts)}</strong></div>
                    <div className="fare-cancellation-line"><span>Taxes</span><strong>{formatRupees(taxes)}</strong></div>
                    <div className="fare-cancellation-line charge"><span>Cancellation fee</span><strong>{formatRupees(cancellationFee)}</strong></div>
                    <div className="fare-cancellation-line charge"><span>GST on cancellation fee</span><strong>{formatRupees(cancellationGst)}</strong></div>
                    <div className="fare-cancellation-line total-deducted"><span>Total deducted</span><strong>{formatRupees(totalDeducted)}</strong></div>
                    <div className="fare-cancellation-refund"><span>You’ll get back</span><strong>{formatRupees(refundAmount)}</strong></div>
                  </>
                )}
              </article>
            );
          }) : (
            <p className="fare-cancellation-unavailable">Cancellation rules are not available for this service.</p>
          )}
        </div>
      )}
    </section>
  );
}
