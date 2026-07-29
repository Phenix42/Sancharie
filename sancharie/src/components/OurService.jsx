import React from 'react'
import './OurService.css'
import {
  Armchair,
  BadgeIndianRupee,
  Headphones,
  ListFilter,
  ShieldCheck,
  TicketCheck
} from 'lucide-react'

const services = [
  {
    id: '01',
    title: 'Compare without the guesswork',
    description: 'See timings, boarding points, amenities, and available seats together before you decide.',
    Icon: ListFilter
  },
  {
    id: '02',
    title: 'Choose comfort your way',
    description: 'Filter for AC, seater, or sleeper buses and pick the seat that works for your journey.',
    Icon: Armchair
  },
  {
    id: '03',
    title: 'Get help when it matters',
    description: 'Access booking details quickly and reach support whenever your travel plans need attention.',
    Icon: Headphones
  }
]

function OurService() {
  return (
    <section className="our-service" id="about">
      <div className="service-container">
        <div className="service-header">
          <div>
            <span className="service-badge-text">The Sancharie promise</span>
            <h2 className="service-title">A better way to book every bus journey</h2>
          </div>
          <p className="service-summary">
            Everything you need to make a confident choice, brought together in one calm, transparent booking experience.
          </p>
        </div>

        <div className="service-trust-bar">
          <div className="service-trust-lead">
            <span className="service-trust-icon"><ShieldCheck size={23} /></span>
            <div>
              <strong>Book with confidence</strong>
              <span>Designed around safer, simpler travel</span>
            </div>
          </div>
          <div className="service-trust-points">
            <span><BadgeIndianRupee size={17} /> Clear fare details</span>
            <span><TicketCheck size={17} /> Instant booking confirmation</span>
            <span><ShieldCheck size={17} /> Secure checkout</span>
          </div>
        </div>

        <div className="svc-grid">
          {services.map(({ id, title, description, Icon }) => (
            <article className="svc-card" key={id}>
              <div className="svc-card-top">
                <div className="svc-card-icon">
                  {React.createElement(Icon, { size: 23, strokeWidth: 1.9 })}
                </div>
                <span className="svc-card-number">{id}</span>
              </div>
              <h3 className="svc-card-title">{title}</h3>
              <p className="svc-card-desc">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default OurService
