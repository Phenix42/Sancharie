import React from 'react'
import './Features.css'

function Features() {
  const stats = [
    {
      id: 1,
      number: '95',
      label: 'Flexible Cancellation & Refunds'
    },
    {
      id: 2,
      number: '3L+',
      label: 'Multiple Route Coverage'
    },
    {
      id: 3,
      number: '100%',
      label: 'Loyalty & Rewards Program'
    },
    {
      id: 4,
      number: '99%',
      label: 'Safe & Hygienic Travel'
    }
  ]

  return (
    <section className="features">
      <div className="features-container">
        {/* Stats Section */}
        <div className="stats-section">
          <div className="stats-grid">
            {stats.map((stat) => (
              <div key={stat.id} className="stat-card">
                <div className="stat-number">{stat.number}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Features
