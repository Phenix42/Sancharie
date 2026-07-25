import React from 'react'
import './BookingSteps.css'
import { MapPin, Calendar, Bus, Armchair, CreditCard, Ticket } from 'lucide-react'

function BookingSteps() {
  const steps = [
    {
      id: 1,
      title: 'Enter Route',
      description: 'Choose your origin and destination cities',
      icon: MapPin,
      color: 'gold'
    },
    {
      id: 2,
      title: 'Pick Date',
      description: 'Select your preferred travel date',
      icon: Calendar,
      color: 'teal'
    },
    {
      id: 3,
      title: 'Browse Buses',
      description: 'Compare timings, prices & amenities',
      icon: Bus,
      color: 'gold'
    },
    {
      id: 4,
      title: 'Select Seat',
      description: 'Pick your favorite seat position',
      icon: Armchair,
      color: 'teal'
    },
    {
      id: 5,
      title: 'Make Payment',
      description: 'Complete secure checkout instantly',
      icon: CreditCard,
      color: 'gold'
    },
    {
      id: 6,
      title: 'Get Ticket',
      description: 'Receive your e-ticket via SMS & email',
      icon: Ticket,
      color: 'teal'
    }
  ]

  return (
    <section className="booking-steps">
      <div className="booking-steps-container">
        <div className="booking-steps-header">
          <div>
            <span className="booking-steps-label">Simple Process</span>
            <h2 className="booking-steps-title">
              Book Your Ticket in <span className="highlight">6 Easy Steps</span>
            </h2>
          </div>
          <p className="booking-steps-subtitle">
            From search to ticket, our streamlined process keeps every step simple and clear
          </p>
        </div>

        <div className="steps-grid">
          {steps.map((step) => {
            const IconComponent = step.icon
            return (
              <div key={step.id} className="step-card">
                <div className="step-number">{String(step.id).padStart(2, '0')}</div>
                <div className={`step-icon-wrapper ${step.color}`}>
                  <IconComponent className="step-icon" size={24} strokeWidth={2} />
                </div>
                <div className="step-content">
                  <span className="step-label">Step {step.id}</span>
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-description">{step.description}</p>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}

export default BookingSteps
