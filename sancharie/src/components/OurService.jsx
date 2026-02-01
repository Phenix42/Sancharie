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
  const topRowServices = [
    {
      id: 1,
      title: 'Safety Guarantee',
      description: 'Travel with confidence through verified operators, secure payments, and safety-first standards.',
      icon: 'shield-check',
      featured: false,
      position: 'top'
    },
    {
      id: 2,
      title: 'Faster Booking Experience',
      description: 'Less clicks, less confusion, and quicker decisions—designed to save your time.',
      icon: FastIcon,
      featured: true,
      position: 'top'
    },
    {
      id: 3,
      title: 'Smart Deals & Rewards',
      description: 'Get real value on every booking with exclusive offers and meaningful rewards.',
      icon: SmartDealsIcon,
      featured: false,
      position: 'top'
    }
  ]

  const bottomRowServices = [
    {
      id: 4,
      title: 'Professional Staff',
      description: 'Experienced drivers and trained staff ensure comfort, care, and professionalism',
      icon: ProfessionalIcon,
      featured: false,
      position: 'bottom'
    },
    {
      id: 5,
      title: 'On-Time Scheduling',
      description: 'Punctual departures and accurate schedules—because your time matters.',
      icon: ScheduleIcon,
      featured: false,
      position: 'bottom'
    },
    {
      id: 6,
      title: '24/7 Customer Support',
      description: 'Round-the-clock assistance to support you before, during, and after your journey',
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
              className={`service-card ${service.featured ? 'featured' : ''} ${index === 0 ? 'offset-down' : ''} ${index === 1 ? 'offset-up' : ''}`}
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
