import React, { useState } from 'react';
import './BusResults.css';

// Import images from assets
import discountOffer1 from '../assets/dis1.png';
import discountOffer2 from '../assets/dis2.png';
import discountOffer3 from '../assets/dis3.png';
import discountOffer4 from '../assets/dis4.png';
import whyChooseImage from '../assets/whychooseimage.png';
import onlineBookingImage from '../assets/onlinebookingimage.png';
import howToBookImage from '../assets/busimage.png';

const BusResults = () => {
  const [activeTab, setActiveTab] = useState('general');

  const discountOffers = [
    { id: 1, image: discountOffer1, alt: 'Grand Winter Bus Sale - 50% OFF' },
    { id: 2, image: discountOffer2, alt: 'Win Scorpio, iPhone 17 Pro, PS5' },
    { id: 3, image: discountOffer3, alt: 'Get Free Memberships on Every Bus Booking' },
    { id: 4, image: discountOffer4, alt: 'RBL Bank - Flat ₹300 off on Bus Booking' },
  ];

  const faqData = {
    general: [
      { question: 'Can I cancel my bus ticket online?', answer: 'Yes, you can cancel your bus ticket online through our platform. Visit your booking history, select the ticket you want to cancel, and follow the cancellation process.' },
      { question: 'How can I cancel my bus ticket?', answer: 'To cancel your bus ticket, log in to your account, go to My Bookings, select the ticket, and click on Cancel. The refund will be processed based on the cancellation policy.' },
      { question: 'I missed my bus. Will I get a refund?', answer: 'Unfortunately, if you miss your bus, a refund is not typically available. We recommend arriving at the boarding point at least 15 minutes before departure.' },
      { question: 'How will I receive my refund after cancellation?', answer: 'Refunds are processed to the original payment method within 5-7 business days after cancellation approval.' },
      { question: 'What if the bus is delayed or canceled by the operator?', answer: 'If the bus is delayed or canceled by the operator, you will receive a full refund or the option to reschedule your journey.' },
      { question: 'Can I reschedule my bus ticket?', answer: 'Yes, rescheduling is available for most tickets. Check the operator\'s policy and reschedule through your booking dashboard.' },
    ],
    ticketRelated: [
      { question: 'How do I book a bus ticket?', answer: 'Enter your origin and destination, select travel date, choose a bus, pick your seat, and complete payment.' },
      { question: 'Can I book tickets for someone else?', answer: 'Yes, you can book tickets for others by entering their details during the booking process.' },
      { question: 'Is there a limit on tickets I can book?', answer: 'You can book up to 6 tickets in a single transaction.' },
    ],
    payment: [
      { question: 'What payment methods are accepted?', answer: 'We accept credit/debit cards, UPI, net banking, and wallet payments.' },
      { question: 'Is my payment information secure?', answer: 'Yes, all transactions are secured with SSL encryption and comply with PCI DSS standards.' },
      { question: 'Can I pay in installments?', answer: 'Currently, we do not offer installment payment options.' },
    ],
    cancellation: [
      { question: 'What is the cancellation policy?', answer: 'Cancellation charges vary by operator and timing. Earlier cancellations typically have lower charges.' },
      { question: 'How long does refund processing take?', answer: 'Refunds are processed within 5-7 business days to your original payment method.' },
      { question: 'Can I get a full refund?', answer: 'Full refunds are available only if you cancel within the free cancellation window or if the operator cancels the trip.' },
    ],
  };

  const [expandedFaq, setExpandedFaq] = useState(null);

  const toggleFaq = (index) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const getCurrentFaqs = () => {
    switch (activeTab) {
      case 'general':
        return faqData.general;
      case 'ticketRelated':
        return faqData.ticketRelated;
      case 'payment':
        return faqData.payment;
      case 'cancellation':
        return faqData.cancellation;
      default:
        return faqData.general;
    }
  };

  return (
    <div className="bus-results">
      {/* Section 1: Bus Booking Discount Offers - HIDDEN */}
      {/* <section className="discount-offers-section">
        <h2 className="section-title">Bus Booking Discount Offers</h2>
        <div className="discount-offers-wrapper">
          <div className="discount-offers-track">
            {discountOffers.map((offer) => (
              <div key={offer.id} className="discount-offer-card">
                <img src={offer.image} alt={offer.alt} className="discount-offer-image" />
              </div>
            ))}
            {discountOffers.map((offer) => (
              <div key={`duplicate-${offer.id}`} className="discount-offer-card">
                <img src={offer.image} alt={offer.alt} className="discount-offer-image" />
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* Section 2: Why Choose Sancharie for Bus Booking? */}
      <section className="why-choose-section">
        <div className="why-choose-content">
          <div className="why-choose-text">
            <h2 className="section-title-underline">Why Choose Sancharie for Bus Booking?</h2>
            <p className="why-choose-intro">
              At Sancharie, we help travellers find the best travel options with complete transparency and value. Our platform brings together thousands of verified bus operators across India so you get:
            </p>
            <h3 className="key-benefits-title">Key Benefits:</h3>
            <ol className="benefits-list">
              <li>Transparent ticket prices with no hidden fees</li>
              <li>Extensive route coverage across cities and towns</li>
              <li>Verified bus services with reliable timings</li>
              <li>Multiple bus types (Budget, Premium, Luxury, AC & Sleeper)</li>
              <li>Easy seat selection and boarding point options</li>
            </ol>
            <p className="why-choose-conclusion">
              Sancharie uses the latest technology to ensure your booking experience is simple, secure, and tailor-made to your needs.
            </p>
          </div>
          <div className="why-choose-image">
            <img src={whyChooseImage} alt="Why Choose Sancharie" className="section-image" />
          </div>
        </div>
      </section>

      {/* Section 3: Online Bus & Travel Booking Services – Sancharie */}
      <section className="online-booking-section">
        <div className="online-booking-content">
          <div className="online-booking-text">
            <h2 className="section-title-underline">Online Bus & Travel Booking Services – Sancharie</h2>
            <p>
              Sancharie is India's next-generation digital travel platform designed to make bus and travel bookings simple, transparent, and rewarding. With Sancharie, travellers can search routes, compare operators, check live availability, and book tickets securely — all in just a few clicks.
            </p>
            <p>
              Sancharie focuses on real customer problems in Indian travel and solves them with smart technology, fair pricing, and instant value. From budget-friendly trips to premium journeys, Sancharie helps you travel better, smarter, and with confidence.
            </p>
            <p>
              Sancharie simplifies the entire bus booking experience by bringing verified operators, real-time pricing, and live journey updates onto one platform. Travellers can instantly compare bus schedules, fares, amenities, and boarding points to choose the option that best fits their travel plan.
            </p>
            <h3 className="subsection-title">Smart & Easy Online Bus Ticket Booking</h3>
            <p>
              Whether you are planning in advance or booking at the last minute, Sancharie ensures a smooth, reliable, and hassle-free booking experience.
            </p>
          </div>
          <div className="online-booking-image">
            <img src={onlineBookingImage} alt="Online Bus Booking" className="section-image" />
          </div>
        </div>
      </section>

      {/* Section 4: How to Book Bus Tickets Online on Sancharie */}
      <section className="how-to-book-section">
        <div className="how-to-book-content">
          <div className="how-to-book-text">
            <h2 className="section-title-underline">How to Book Bus Tickets Online on Sancharie</h2>
            <p className="how-to-book-intro">Booking a bus ticket on Sancharie is simple and secure:</p>
            <ol className="steps-list">
              <li>Enter your origin city and destination city</li>
              <li>Select your travel date</li>
              <li>Browse available buses and compare options</li>
              <li>Choose your seat, boarding, and drop points</li>
              <li>Enter passenger and contact details</li>
              <li>Complete payment using your preferred method</li>
              <li>Receive your e-ticket instantly via SMS, WhatsApp, and email</li>
            </ol>

            <h3 className="subsection-title">Last-Minute & Same-Day Ticket Booking</h3>
            <p>
              A large percentage of Indian travellers book tickets at the last moment. Sancharie is designed to support this reality.
            </p>
            <ul className="feature-list">
              <li>24/7 bus availability</li>
              <li>Real-time route and price updates</li>
              <li>Last-minute deals on select operators</li>
              <li>Multiple pickup and drop locations</li>
              <li>Sancharie helps travellers stay flexible without paying extra.</li>
            </ul>

            <h3 className="subsection-title">Live Bus Tracking for Stress-Free Boarding</h3>
            <p>
              Sancharie offers real-time bus tracking, helping passengers know exactly where their bus is.
            </p>
            <p className="tracking-intro">With live tracking, users can:</p>
            <ul className="feature-list">
              <li>Track bus location on the map</li>
              <li>Check estimated arrival time</li>
              <li>Avoid long waiting at boarding points</li>
              <li>Plan travel more efficiently</li>
            </ul>
            <p>
              This feature reduces uncertainty and improves the overall travel experience.
            </p>
          </div>
          <div className="how-to-book-image">
            <img src={howToBookImage} alt="How to Book Bus Tickets" className="section-image" />
          </div>
        </div>
      </section>

      {/* Section 5: FAQs related to Bus Tickets Booking */}
      <section className="faq-section">
        <h2 className="section-title">FAQs related to Bus Tickets Booking</h2>
        <div className="faq-tabs">
          <button
            className={`faq-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => { setActiveTab('general'); setExpandedFaq(null); }}
          >
            General
          </button>
          <button
            className={`faq-tab ${activeTab === 'ticketRelated' ? 'active' : ''}`}
            onClick={() => { setActiveTab('ticketRelated'); setExpandedFaq(null); }}
          >
            Ticket-related
          </button>
          <button
            className={`faq-tab ${activeTab === 'payment' ? 'active' : ''}`}
            onClick={() => { setActiveTab('payment'); setExpandedFaq(null); }}
          >
            Payment
          </button>
          <button
            className={`faq-tab ${activeTab === 'cancellation' ? 'active' : ''}`}
            onClick={() => { setActiveTab('cancellation'); setExpandedFaq(null); }}
          >
            Cancellation & Refund
          </button>
        </div>
        <div className="faq-list">
          {getCurrentFaqs().map((faq, index) => (
            <div key={index} className="faq-item">
              <button className="faq-question" onClick={() => toggleFaq(index)}>
                <span>{faq.question}</span>
                <span className="faq-icon">{expandedFaq === index ? '−' : '+'}</span>
              </button>
              {expandedFaq === index && (
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default BusResults;
