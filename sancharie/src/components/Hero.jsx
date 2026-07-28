import React from 'react'
import './Hero.css'
import bgImage from '../assets/bgimage2.webp'
import mobileBgImage from '../assets/mobilebg.webp'

function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <picture>
          <source media="(max-width: 768px)" srcSet={mobileBgImage} type="image/webp" />
          <img 
            src={bgImage}
            alt="Mountain landscape" 
            className="hero-bg-image"
            fetchpriority="high"
            decoding="async"
          />
        </picture>
        {/* Overlay to reduce image dominance and improve focus on search bar */}
        <div className="hero-overlay"></div>
      </div>
      <div className="hero-content">
        <div className="hero-kicker">Sancharie Bus Network</div>
        <h1 className="hero-title">
          <span>Business-class bus</span>
          <span>booking for every route</span>
        </h1>
        <p className="hero-subtitle">
          Compare verified operators, live fares, boarding points, and seat options in a calm booking workspace.
        </p>
        <div className="hero-proof-row" aria-label="Sancharie booking highlights">
          <span><strong>5000+</strong> routes covered</span>
          <span><strong>24/7</strong> support</span>
          <span><strong>100%</strong> secure payments</span>
        </div>
      </div>
    </section>
  )
}

export default Hero
