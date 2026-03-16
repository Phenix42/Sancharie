import React from 'react'
import './OurService.css'
import { Shield, Gift, Users, Zap, Clock, Headphones } from 'lucide-react'

const leftServices = [
  { id: '1A', title: 'Safety Guarantee', description: 'Verified Operators & Secure Payments.', Icon: Shield },
  { id: '2A', title: 'Smart Deals', description: 'Exclusive Offers And Rewards.', Icon: Gift },
  { id: '3A', title: 'Professional Staff', description: 'Trained Staff For Your Comfort.', Icon: Users },
]

const rightServices = [
  { id: '1B', title: 'Faster Booking', description: 'Quick Decisions With Less Clicks.', Icon: Zap },
  { id: '2B', title: 'On-Time Scheduling', description: 'Punctual Departures Always.', Icon: Clock },
  { id: '3B', title: '24/7 Support', description: 'Round-The-Clock Assistance.', Icon: Headphones },
]

function ServiceCard({ service }) {
  const { id, title, description, Icon } = service
  return (
    <div className="svc-card">
      <div className="svc-card-inner">
        <div className="svc-card-accent" />
        <span className="svc-card-id">{id}</span>
        <div className="svc-card-icon">
          <Icon size={16} strokeWidth={1.5} />
        </div>
        <h3 className="svc-card-title">{title}</h3>
        <p className="svc-card-desc">{description}</p>
        <div className="svc-card-bottom-line" />
      </div>
    </div>
  )
}

function OurService() {
  return (
    <section className="our-service">
      <div className="service-container">
        {/* Header */}
        <div className="service-header">
          <div className="service-badge">
            <span className="service-badge-dot" />
            <span className="service-badge-text">Our Services</span>
          </div>
          <h2 className="service-title">
            Everything You Need For A{' '}
            <span className="service-title-accent">Better Travel</span>
          </h2>
        </div>

        {/* Phone Frame */}
        <div className="svc-frame">
          {/* Frame Top Bar */}
          <div className="svc-frame-top">
            <div className="svc-frame-dots left">
              <span className="svc-dot pulse" />
              <span className="svc-dot" />
            </div>
            <span className="svc-frame-label">Premium Travel Services</span>
            <div className="svc-frame-dots right">
              <span className="svc-dot" />
              <span className="svc-dot pulse" />
            </div>
          </div>

          {/* Toolbar Bars */}
          <div className="svc-toolbar">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="svc-toolbar-bar" />
            ))}
          </div>

          {/* Cards Content */}
          <div className="svc-content">
            <div className="svc-column">
              {leftServices.map(s => <ServiceCard key={s.id} service={s} />)}
            </div>

            {/* Center Aisle */}
            <div className="svc-aisle">
              <div className="svc-aisle-line" />
              <div className="svc-aisle-badge">
                <span>EXIT</span>
              </div>
              <div className="svc-aisle-line" />
            </div>

            <div className="svc-column">
              {rightServices.map(s => <ServiceCard key={s.id} service={s} />)}
            </div>
          </div>

          {/* Frame Bottom Bar */}
          <div className="svc-frame-bottom">
            <div className="svc-bottom-line" />
            <div className="svc-bottom-dots">
              <span className="svc-indicator amber" />
              <span className="svc-indicator red" />
              <span className="svc-indicator amber" />
            </div>
            <div className="svc-bottom-line" />
          </div>

          {/* Side Buttons */}
          <div className="svc-side-btn left top" />
          <div className="svc-side-btn left bottom" />
          <div className="svc-side-btn right top" />
          <div className="svc-side-btn right bottom" />
        </div>

        {/* Phone Feet */}
        <div className="svc-feet">
          <div className="svc-feet-group">
            <div className="svc-foot"><div className="svc-foot-line" /></div>
            <div className="svc-foot"><div className="svc-foot-line" /></div>
          </div>
          <div className="svc-feet-group">
            <div className="svc-foot"><div className="svc-foot-line" /></div>
            <div className="svc-foot"><div className="svc-foot-line" /></div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default OurService
