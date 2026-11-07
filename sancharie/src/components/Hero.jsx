import React from 'react'
import './Hero.css'
import bgImage from '../assets/bgimage2.webp'
import mobileBgImage from '../assets/mobilebg.webp'
import August15Hero from '../themes/August15Hero'
import { THEME_FLAGS } from '../themes/themeConfig'

function Hero({ runtimeTheme }) {
  const themeBanner = /^(https?:\/\/|\/(?!\/))/i.test(String(runtimeTheme?.bannerImage || ''))
    ? runtimeTheme.bannerImage
    : null
  const fitUploadedBanner = (event) => {
    if (!themeBanner) return
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) {
      const hero = event.currentTarget.closest('.hero')
      if (hero) {
        hero.style.aspectRatio = `${naturalWidth} / ${naturalHeight}`
        hero.classList.add('has-custom-banner')
      }
    }
  }

  if (THEME_FLAGS.AUGUST_15) {
    return <August15Hero bannerImage={themeBanner} onBannerLoad={fitUploadedBanner} />
  }

  return (
    <section className="hero">
      <div className="hero-background">
        <picture>
          {!themeBanner && <source media="(max-width: 768px)" srcSet={mobileBgImage} type="image/webp" />}
          <img 
            src={themeBanner || bgImage}
            alt="Travellers beginning a bus journey across India"
            className="hero-bg-image"
            fetchPriority="high"
            decoding="async"
            onLoad={fitUploadedBanner}
          />
        </picture>
        <div className="hero-overlay"></div>
      </div>
    </section>
  )
}

export default Hero
