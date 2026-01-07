import React from 'react'
import './Hero.css'
import busImage from '../assets/busimage.png'
import bgImage from '../assets/bgimage.png'

function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <img 
          src={bgImage}
          alt="Mountain landscape with rainbow" 
          className="hero-bg-image" 
        />
        <div className="hero-overlay"></div>
      </div>
      
      <div className="hero-content">
        <h1 className="hero-title">SANCHARIE</h1>
        <p className="hero-subtitle">Your Trusted Partner for Every Journey</p>
      </div>

      <div className="bus-image-container">
        <img 
          src={busImage}
          alt="Sancharie Bus" 
          className="hero-bus-image" 
        />
      </div>

      <div className="hero-wave"></div>
    </section>
  )
}

export default Hero
