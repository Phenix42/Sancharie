import React from 'react'
import './Hero.css'
import bgImage from '../assets/bgimage2.svg'
import mobileBgImage from '../assets/mobilebg.svg'

function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <img 
          src={bgImage}
          alt="Mountain landscape" 
          className="hero-bg-image hero-bg-desktop" 
        />
        <img 
          src={mobileBgImage}
          alt="Mountain landscape" 
          className="hero-bg-image hero-bg-mobile" 
        />
        {/* Overlay to reduce image dominance and improve focus on search bar */}
        <div className="hero-overlay"></div>
      </div>
      {/* Clear heading for users to instantly know it's for bus booking */}
      <div className="hero-content">
        <h1 className="hero-title">Book Bus Tickets Easily</h1>
        <p className="hero-subtitle">Find and book the best bus routes across India with just a few clicks</p>
      </div>
    </section>
  )
}

export default Hero
