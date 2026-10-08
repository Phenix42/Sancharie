import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, TicketPercent } from 'lucide-react';
import './DiscountOffers.css';

const palettes = ['sunrise', 'sky', 'rose', 'lavender'];
const safeImage = (value) => /^(https:\/\/|\/(?!\/))/.test(String(value || '')) ? value : '';

export default function DiscountOffers({ discounts = [] }) {
  const railRef = useRef(null);
  const [showAll, setShowAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
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
          const style = image ? { backgroundImage: `linear-gradient(90deg, rgba(7, 34, 47, .82), rgba(7, 34, 47, .14)), url("${image.replace(/["\\]/g, '')}")` } : undefined;
          return <article className={`discount-offer-card ${palettes[index % palettes.length]} ${image ? 'has-image' : ''}`} style={style} key={discount._id || `${discount.name}-${index}`}>
            <span className="discount-offer-ribbon">{discount.name || 'Limited time offer'}</span>
            <div className="discount-offer-copy">
              <p className="discount-offer-kicker">Bus booking offer</p>
              <h3><span>{discount.percentage}%</span> OFF</h3>
              <p className="discount-offer-description">{discount.description || 'Save on your next bus journey'}</p>
              {discount.code ? <div className="discount-offer-code"><small>USE CODE</small><strong>{discount.code}</strong></div> : <div className="discount-offer-auto"><TicketPercent size={17} /> Applied on eligible bookings</div>}
            </div>
            <div className="discount-offer-terms">
              {Number(discount.maximumDiscount) > 0 && <span>Up to ₹{Number(discount.maximumDiscount).toLocaleString('en-IN')} off</span>}
              {Number(discount.minimumBooking) > 0 && <span>Min. booking ₹{Number(discount.minimumBooking).toLocaleString('en-IN')}</span>}
              <span>Terms apply</span>
            </div>
            {!image && <span className="discount-offer-decoration" aria-hidden="true"><TicketPercent size={94} strokeWidth={1.2} /></span>}
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
