import React from 'react'
import './Hero.css'
import bgImage from '../assets/bgimage2.svg'

function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <img 
          src={bgImage}
          alt="Mountain landscape" 
          className="hero-bg-image" 
        />
      </div>
    </section>
  )
}

export default Hero
