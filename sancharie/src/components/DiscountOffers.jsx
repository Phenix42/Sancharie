import { useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, TicketPercent } from 'lucide-react';
import './DiscountOffers.css';

const palettes = ['sunrise', 'sky', 'rose', 'lavender'];
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const safeImage = (value) => {
  const url = String(value || '');
  if (/^https:\/\//.test(url)) return url;
  return url.startsWith('/') && !url.startsWith('//') ? `${API_BASE_URL.replace(/\/$/, '')}${url}` : '';
};

export default function DiscountOffers({ discounts = [], onSelectOffer }) {
  const railRef = useRef(null);
  const [showAll, setShowAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copiedCode, setCopiedCode] = useState('');
  const [flippedOffer, setFlippedOffer] = useState('');
  if (!discounts.length) return null;

  const scrollToCard = (index) => {
    const rail = railRef.current;
    const card = rail?.children[index];
    if (rail && card) rail.scrollTo({ left: card.offsetLeft - rail.offsetLeft, behavior: 'smooth' });
  };

  const onScroll = () => {
    const rail = railRef.current;
    if (!rail || showAll) return;
    const cards = Array.from(rail.children);
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const currentDistance = Math.abs(card.offsetLeft - rail.offsetLeft - rail.scrollLeft);
      if (currentDistance < distance) { nearest = index; distance = currentDistance; }
    });
    setActiveIndex(nearest);
  };

  const copyOfferCode = async (event, code) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(''), 1800);
    } catch {
      setCopiedCode('');
    }
  };

  return (
    <section id="discount-offers" className="discount-offers-section" aria-labelledby="discount-offers-title">
      <div className="discount-offers-heading">
        <div>
          <span className="discount-offers-eyebrow">TRAVEL MORE, SAVE MORE</span>
          <h2 id="discount-offers-title">Bus Booking Discount Offers</h2>
        </div>
        {discounts.length > 1 && <button className="discount-view-all" type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Show carousel' : 'View all'} <ChevronRight size={20} />
        </button>}
      </div>

      <div className={`discount-offers-rail ${showAll ? 'discount-offers-grid' : ''}`} ref={railRef} onScroll={onScroll}>
        {discounts.map((discount, index) => {
          const image = safeImage(discount.bannerImage);
          const imageStyle = image ? { backgroundImage: `url("${image.replace(/["\\]/g, '')}")` } : undefined;
          const offerKey = String(discount._id || `${discount.name}-${index}`);
          const isFlipped = flippedOffer === offerKey;
          return <article className={`discount-offer-card ${palettes[index % palettes.length]} ${image ? 'has-image' : ''} ${isFlipped ? 'is-flipped' : ''}`} key={offerKey} role="button" tabIndex={0} aria-label={`Flip ${discount.name || 'discount offer'} card`} onClick={() => setFlippedOffer((current) => current === offerKey ? '' : offerKey)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setFlippedOffer((current) => current === offerKey ? '' : offerKey); } }}>
            <div className="discount-offer-flipper">
              <div className="discount-offer-face discount-offer-front" style={imageStyle}>
                <button type="button" className="discount-offer-flip-button" onClick={(event) => { event.stopPropagation(); setFlippedOffer(offerKey); }} aria-label="Flip card to see offer details"><ChevronRight size={18} /></button>
              </div>
              <div className="discount-offer-face discount-offer-back">
                <span className="discount-offer-ribbon">{discount.name || 'Limited time offer'}</span>
                <div className="discount-offer-back-content">
                  <p className="discount-offer-kicker">Bus booking offer</p>
                  <h3><span>{discount.percentage}%</span> OFF</h3>
                  <p className="discount-offer-description">{discount.description || 'Save on your next bus journey'}</p>
                  {discount.code ? <>
                    <span className="discount-offer-back-label">Your offer code</span>
                    <button type="button" className="discount-offer-code" onClick={(event) => copyOfferCode(event, discount.code)} aria-label={`Copy promo code ${discount.code}`}>
                      <strong>{discount.code}</strong>{copiedCode === discount.code ? <Check size={17} /> : <Copy size={16} />}
                    </button>
                    <small>{copiedCode === discount.code ? 'Code copied' : 'Tap to copy and apply at checkout'}</small>
                  </> : <><TicketPercent size={24} /><strong>Applied automatically</strong></>}
                </div>
                <div className="discount-offer-terms">
                  {Number(discount.maximumDiscount) > 0 && <span>Up to ₹{Number(discount.maximumDiscount).toLocaleString('en-IN')} off</span>}
                  {Number(discount.minimumBooking) > 0 && <span>Min. booking ₹{Number(discount.minimumBooking).toLocaleString('en-IN')}</span>}
                  <span>Terms apply</span>
                </div>
                <button type="button" className="discount-offer-flip-button discount-offer-back-button" onClick={(event) => { event.stopPropagation(); setFlippedOffer(''); event.currentTarget.blur(); }} aria-label="Return to offer details"><ChevronLeft size={14} /> Offer details</button>
              </div>
            </div>
          </article>;
        })}
      </div>

      {!showAll && discounts.length > 1 && <>
        {activeIndex > 0 && <button className="discount-arrow discount-arrow-left" type="button" aria-label="Previous offers" onClick={() => scrollToCard(Math.max(0, activeIndex - 1))}><ChevronLeft size={22} /></button>}
        {activeIndex < discounts.length - 1 && <button className="discount-arrow discount-arrow-right" type="button" aria-label="Next offers" onClick={() => scrollToCard(activeIndex + 1)}><ChevronRight size={22} /></button>}
        <div className="discount-offers-dots" aria-label="Choose an offer">
          {discounts.map((discount, index) => <button type="button" key={discount._id || index} className={index === activeIndex ? 'active' : ''} aria-label={`Show offer ${index + 1}`} aria-current={index === activeIndex ? 'true' : undefined} onClick={() => scrollToCard(index)} />)}
        </div>
      </>}
    </section>
  );
}
