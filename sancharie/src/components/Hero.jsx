import React from 'react'
import './Hero.css'
import bgImage from '../assets/bgimage2.webp'
import mobileBgImage from '../assets/mobilebg.webp'
import { BadgeCheck, IndianRupee, TicketCheck } from 'lucide-react'
import August15Hero from '../themes/August15Hero'
import { THEME_FLAGS } from '../themes/themeConfig'

function Hero() {
  if (THEME_FLAGS.AUGUST_15) {
    return <August15Hero />
  }

  return (
    <section className="hero">
      <div className="hero-background">
        <picture>
          <source media="(max-width: 768px)" srcSet={mobileBgImage} type="image/webp" />
          <img 
            src={bgImage}
            alt="Travellers beginning a bus journey across India"
            className="hero-bg-image"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="hero-overlay"></div>
      </div>
      <div className="hero-content">
        <div className="hero-kicker">
          <span className="hero-kicker-dot" />
          Bus journeys across India
        </div>
        <h1 className="hero-title">
          <span>Wherever you’re going,</span>
          <span>go with confidence.</span>
        </h1>
        <p className="hero-subtitle">
          Compare buses, choose your seat, and book in minutes—with clear fares and support whenever you need it.
        </p>
        <div className="hero-proof-row" aria-label="Sancharie booking highlights">
          <span><BadgeCheck size={17} /> Verified operators</span>
          <span><IndianRupee size={17} /> Transparent fares</span>
          <span><TicketCheck size={17} /> Instant e-tickets</span>
        </div>
      </div>
    </section>
  )
}

export default Hero
