import React from 'react'
import './BookingSteps.css'
import { ArrowRight, ListChecks, Search, TicketCheck } from 'lucide-react'

const steps = [
  {
    id: '01',
    title: 'Search your route',
    description: 'Enter your cities and travel date to see the available buses for your journey.',
    Icon: Search
  },
  {
    id: '02',
    title: 'Choose your bus & seat',
    description: 'Compare timings and amenities, then select the boarding point and seat you prefer.',
    Icon: ListChecks
  },
  {
    id: '03',
    title: 'Pay & get your ticket',
    description: 'Complete secure payment and receive your booking confirmation instantly.',
    Icon: TicketCheck
  }
]

function BookingSteps() {
  return (
    <section className="booking-steps">
      <div className="booking-steps-container">
        <div className="booking-steps-header">
          <div>
            <span className="booking-steps-label">Simple from start to finish</span>
            <h2 className="booking-steps-title">Three steps. One smooth journey.</h2>
          </div>
          <p className="booking-steps-subtitle">
            No confusing screens or hidden steps—just a clear path from search to confirmed ticket.
          </p>
        </div>

        <div className="steps-grid">
          {steps.map(({ id, title, description, Icon }, index) => (
            <article key={id} className="step-card">
              <div className="step-card-heading">
                <span className="step-number">{id}</span>
                <div className="step-icon-wrapper">
                  {React.createElement(Icon, { className: 'step-icon', size: 23, strokeWidth: 2 })}
                </div>
              </div>
              <div className="step-content">
                <h3 className="step-title">{title}</h3>
                <p className="step-description">{description}</p>
              </div>
              {index < steps.length - 1 && (
                <span className="step-connector" aria-hidden="true">
                  <ArrowRight size={18} />
                </span>
              )}
            </article>
          ))}
        </div>

        <div className="steps-footer">
          <span>Ready when you are.</span>
          <a href="#book-bus">Start your search <ArrowRight size={17} /></a>
        </div>
      </div>
    </section>
  )
}

export default BookingSteps
