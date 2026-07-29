import React, { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BusFront,
  ChevronDown,
  CircleCheck,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import whyChooseImage from '../assets/whychooseimage.png'
import './BusResults.css'

const popularRoutes = [
  { from: 'Hyderabad', to: 'Bengaluru', note: 'Popular overnight journey', region: 'Telangana → Karnataka' },
  { from: 'Hyderabad', to: 'Vijayawada', note: 'Frequent city connection', region: 'Telangana → Andhra Pradesh' },
  { from: 'Hyderabad', to: 'Visakhapatnam', note: 'Coastal travel favourite', region: 'Telangana → Andhra Pradesh' },
  { from: 'Hyderabad', to: 'Chennai', note: 'Comfortable intercity route', region: 'Telangana → Tamil Nadu' }
]

const faqGroups = {
  general: {
    label: 'General',
    items: [
      {
        question: 'How do I book a bus ticket on Sancharie?',
        answer: 'Enter your origin, destination, and date. Compare the available buses, select your preferred seat and boarding point, then complete payment to receive your ticket.'
      },
      {
        question: 'Can I book a ticket for someone else?',
        answer: 'Yes. Use the traveller’s correct details during checkout so the ticket and journey information match the passenger.'
      },
      {
        question: 'Where can I find my confirmed booking?',
        answer: 'Open My Bookings from the header or bottom navigation. Your confirmation also contains the key journey and ticket details.'
      }
    ]
  },
  ticket: {
    label: 'Tickets',
    items: [
      {
        question: 'When will I receive my e-ticket?',
        answer: 'Your e-ticket is generated after a successful payment and booking confirmation. You can also access it later from My Bookings.'
      },
      {
        question: 'Can I change my boarding point?',
        answer: 'Boarding-point changes depend on the operator and the ticket conditions. Check your booking details or contact support for the available options.'
      },
      {
        question: 'Do I need a printed ticket?',
        answer: 'Most operators accept a digital ticket with valid identification, though you should always review the instructions shown on your confirmed booking.'
      }
    ]
  },
  payment: {
    label: 'Payments',
    items: [
      {
        question: 'Which payment methods can I use?',
        answer: 'Available methods are shown securely at checkout and may include UPI, cards, net banking, and supported wallets.'
      },
      {
        question: 'What happens if payment succeeds but booking fails?',
        answer: 'First check My Bookings for a confirmation. If no ticket was created, contact support with your payment reference so the transaction can be reviewed.'
      },
      {
        question: 'Is checkout secure?',
        answer: 'Sancharie uses a secure payment flow and does not ask you to share sensitive payment credentials with an operator.'
      }
    ]
  },
  cancellation: {
    label: 'Cancellations',
    items: [
      {
        question: 'Can I cancel my bus ticket?',
        answer: 'Cancellation availability and charges depend on the bus operator, fare, and time remaining before departure. Review the policy attached to your booking.'
      },
      {
        question: 'How will I receive an eligible refund?',
        answer: 'Eligible refunds are returned through the applicable payment channel. Processing time can vary by the payment provider and operator policy.'
      },
      {
        question: 'Can I reschedule instead of cancelling?',
        answer: 'Rescheduling is available only for supported tickets. Check the options in your booking details or contact support before cancelling.'
      }
    ]
  }
}

function BusResults() {
  const [activeTab, setActiveTab] = useState('general')
  const [expandedFaq, setExpandedFaq] = useState(0)
  const activeItems = faqGroups[activeTab].items

  const selectTab = (key) => {
    setActiveTab(key)
    setExpandedFaq(0)
  }

  return (
    <div className="bus-results">
      <section className="popular-routes-section" id="popular-routes">
        <div className="popular-routes-shell">
          <div className="routes-header">
            <div>
              <span className="section-eyebrow">Popular journeys</span>
              <h2>Routes travellers keep coming back to</h2>
            </div>
            <a className="routes-view-link" href="#book-bus">
              Search any route <ArrowRight size={17} />
            </a>
          </div>

          <div className="popular-routes-grid">
            {popularRoutes.map((route, index) => (
              <a className="route-card" href="#book-bus" key={`${route.from}-${route.to}`}>
                <div className="route-card-top">
                  <span className="route-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="route-arrow"><ArrowUpRight size={18} /></span>
                </div>
                <div className="route-code">{route.region}</div>
                <div className="route-cities">
                  <span>{route.from}</span>
                  <span className="route-line"><BusFront size={15} /></span>
                  <span>{route.to}</span>
                </div>
                <p>{route.note}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="travel-story-section">
        <div className="travel-story-shell">
          <div className="travel-story-visual">
            <div className="travel-image-frame">
              <img src={whyChooseImage} alt="Simple digital bus ticket booking" loading="lazy" />
            </div>
            <div className="travel-visual-card">
              <span><ShieldCheck size={19} /></span>
              <div>
                <strong>Travel with clarity</strong>
                <small>Know what you’re booking before you pay</small>
              </div>
            </div>
          </div>

          <div className="travel-story-copy">
            <span className="section-eyebrow">Built around real journeys</span>
            <h2>Thoughtful booking for the way India travels</h2>
            <p className="travel-story-lead">
              From quick city connections to overnight family trips, Sancharie keeps the information that matters clear and easy to compare.
            </p>
            <div className="travel-benefits">
              <div><CircleCheck size={19} /><span>Transparent fare and amenity details</span></div>
              <div><CircleCheck size={19} /><span>Boarding points shown before checkout</span></div>
              <div><CircleCheck size={19} /><span>Seat selection for supported buses</span></div>
              <div><CircleCheck size={19} /><span>Booking details in one accessible place</span></div>
            </div>
            <div className="travel-story-note">
              <Sparkles size={19} />
              <span>Less time figuring out the booking. More time looking forward to the journey.</span>
            </div>
            <a className="travel-story-cta" href="#book-bus">
              Find your next bus <ArrowRight size={17} />
            </a>
          </div>
        </div>
      </section>

      <section className="faq-section" id="help">
        <div className="faq-shell">
          <div className="faq-heading">
            <span className="section-eyebrow">Need a little help?</span>
            <h2>Frequently asked questions</h2>
            <p>Quick answers for a smoother booking experience.</p>
          </div>

          <div className="faq-content">
            <div className="faq-tabs" role="tablist" aria-label="FAQ categories">
              {Object.entries(faqGroups).map(([key, group]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  className={`faq-tab ${activeTab === key ? 'active' : ''}`}
                  onClick={() => selectTab(key)}
                >
                  {group.label}
                </button>
              ))}
            </div>

            <div className="faq-list">
              {activeItems.map((faq, index) => {
                const isOpen = expandedFaq === index
                return (
                  <article className={`faq-item ${isOpen ? 'open' : ''}`} key={faq.question}>
                    <button
                      className="faq-question"
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedFaq(isOpen ? null : index)}
                    >
                      <span>{faq.question}</span>
                      <ChevronDown className="faq-icon" size={20} />
                    </button>
                    {isOpen && (
                      <div className="faq-answer">
                        <p>{faq.answer}</p>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default BusResults
