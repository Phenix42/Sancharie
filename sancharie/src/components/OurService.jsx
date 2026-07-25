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

const services = [...leftServices, ...rightServices]

function ServiceCard({ service }) {
  const { title, description, Icon } = service
  return (
    <div className="svc-card">
      <div className="svc-card-icon">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <h3 className="svc-card-title">{title}</h3>
      <p className="svc-card-desc">{description}</p>
    </div>
  )
}

function OurService() {
  return (
    <section className="our-service">
      <div className="service-container">
        <div className="service-header">
          <div>
            <span className="service-badge-text">Platform Capabilities</span>
            <h2 className="service-title">
              Built for reliable bus ticket operations
            </h2>
          </div>
          <p className="service-summary">
            A cleaner booking workflow with verified supply, secure payments, support coverage, and faster decisions for every route.
          </p>
        </div>

        <div className="svc-metrics">
          <div>
            <strong>2 min</strong>
            <span>Average booking flow</span>
          </div>
          <div>
            <strong>24/7</strong>
            <span>Customer support desk</span>
          </div>
          <div>
            <strong>PCI</strong>
            <span>Secure payment handling</span>
          </div>
        </div>

        <div className="svc-grid">
          {services.map(s => <ServiceCard key={s.id} service={s} />)}
        </div>
      </div>
    </section>
  )
}

export default OurService
