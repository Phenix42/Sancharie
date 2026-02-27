import React from 'react'
import './OurService.css'
import { ShieldCheck } from 'lucide-react'

// Import service icons
import FastIcon from '../assets/servicesicons/fast.svg'
import SmartDealsIcon from '../assets/servicesicons/smartdeals.svg'
import ProfessionalIcon from '../assets/servicesicons/Professional.svg'
import ScheduleIcon from '../assets/servicesicons/intimeshedule.svg'
import SupportIcon from '../assets/servicesicons/customersupport.svg'

function OurService() {
  // Audit Fix: Shorter card descriptions (1-2 lines only)
  const topRowServices = [
    {
      id: 1,
      title: 'Safety Guarantee',
      description: 'Verified operators and secure payments.',
      icon: 'shield-check',
      featured: false,
      position: 'top'
    },
    {
      id: 2,
      title: 'Faster Booking',
      description: 'Quick decisions with less clicks.',
      icon: FastIcon,
      featured: true,
      position: 'top'
    },
    {
      id: 3,
      title: 'Smart Deals',
      description: 'Exclusive offers and rewards.',
      icon: SmartDealsIcon,
      featured: false,
      position: 'top'
    }
  ]

  const bottomRowServices = [
    {
      id: 4,
      title: 'Professional Staff',
      description: 'Trained staff for your comfort.',
      icon: ProfessionalIcon,
      featured: false,
      position: 'bottom'
    },
    {
      id: 5,
      title: 'On-Time Scheduling',
      description: 'Punctual departures always.',
      icon: ScheduleIcon,
      featured: false,
      position: 'bottom'
    },
    {
      id: 6,
      title: '24/7 Support',
      description: 'Round-the-clock assistance.',
      icon: SupportIcon,
      featured: false,
      position: 'bottom'
    }
  ]

  return (
    <section className="our-service">
      <div className="service-container">
        <div className="service-header">
          <span className="service-label">Our Service</span>
          <h2 className="service-title">
            Everything You Need for a Better Travel Booking
          </h2>
        </div>

        {/* Top Row - First card lower, middle card higher */}
        <div className="service-grid top-row">
          {topRowServices.map((service, index) => (
            <div 
              key={service.id} 
              className={`service-card ${service.featured ? 'featured' : ''} ${index === 0 ? 'offset-down' : ''} ${index === 1 ? 'offset-up' : ''} ${index === 2 ? 'offset-down' : ''}`}
            >
              <div className="service-icon-wrapper">
                {service.icon === 'shield-check' ? (
                  <ShieldCheck className="service-icon-lucide" size={28} />
                ) : (
                  <img src={service.icon} alt={service.title} className="service-icon-img" />
                )}
              </div>
              <h3 className="service-card-title">{service.title}</h3>
              <p className="service-card-description">{service.description}</p>
            </div>
          ))}
        </div>

        {/* Bottom Row - Middle card higher */}
        <div className="service-grid bottom-row">
          {bottomRowServices.map((service, index) => (
            <div 
              key={service.id} 
              className={`service-card ${index === 1 ? 'offset-up-bottom' : ''}`}
            >
              <div className="service-icon-wrapper">
                {service.icon === 'shield-check' ? (
                  <ShieldCheck className="service-icon-lucide" size={28} />
                ) : (
                  <img src={service.icon} alt={service.title} className="service-icon-img" />
                )}
              </div>
              <h3 className="service-card-title">{service.title}</h3>
              <p className="service-card-description">{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default OurService
