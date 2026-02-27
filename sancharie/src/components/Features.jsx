import React from 'react'
import './Features.css'
import { RefreshCw, MapPin, Gift, ShieldCheck } from 'lucide-react'

function Features() {
  const stats = [
    {
      id: 1,
      number: '95%',
      label: 'Flexible Cancellation & Refunds',
      icon: RefreshCw,
      description: 'Easy refunds on eligible bookings'
    },
    {
      id: 2,
      number: '3L+',
      label: 'Multiple Route Coverage',
      icon: MapPin,
      description: 'Connecting cities across India'
    },
    {
      id: 3,
      number: '100%',
      label: 'Loyalty & Rewards Program',
      icon: Gift,
      description: 'Earn points on every trip'
    },
    {
      id: 4,
      number: '99%',
      label: 'Safe & Hygienic Travel',
      icon: ShieldCheck,
      description: 'Verified operators & sanitized buses'
    }
  ]

  return (
    <section className="features">
      <div className="features-container">
        <div className="features-header">
          <span className="features-label">Why Choose Us</span>
          <h2 className="features-title">Key Benefits</h2>
        </div>
        {/* Stats Section */}
        <div className="stats-section">
          <div className="stats-grid">
            {stats.map((stat) => (
              <div key={stat.id} className="stat-card">
                <div className="stat-icon">
                  <stat.icon size={32} strokeWidth={2} />
                </div>
                <div className="stat-number">{stat.number}</div>
                <div className="stat-label">{stat.label}</div>
                <p className="stat-description">{stat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Features
