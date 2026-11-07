import bgImage from '../assets/bgimage2.webp';
import mobileBgImage from '../assets/mobilebg.webp';

const posterParticles = [
  { x: '8%', y: '24%', size: 3, delay: '-2s', duration: '9s' },
  { x: '18%', y: '72%', size: 4, delay: '-5s', duration: '12s' },
  { x: '34%', y: '18%', size: 2, delay: '-7s', duration: '10s' },
  { x: '46%', y: '68%', size: 3, delay: '-1s', duration: '11s' },
  { x: '58%', y: '30%', size: 4, delay: '-4s', duration: '13s' },
  { x: '67%', y: '76%', size: 2, delay: '-8s', duration: '9s' },
  { x: '76%', y: '20%', size: 3, delay: '-3s', duration: '12s' },
  { x: '86%', y: '63%', size: 4, delay: '-6s', duration: '10s' },
  { x: '94%', y: '34%', size: 2, delay: '-9s', duration: '11s' },
];

function AshokaChakra() {
  return (
    <svg className="ashoka-chakra-icon" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11.4" />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index * 15 * Math.PI) / 180;
        const x = Math.cos(angle) * 10.2;
        const y = Math.sin(angle) * 10.2;

        return (
          <line
            key={index}
            x1={14 - x}
            y1={14 - y}
            x2={14 + x}
            y2={14 + y}
          />
        );
      })}
      <circle className="ashoka-chakra-hub" cx="14" cy="14" r="1.7" />
    </svg>
  );
}

function IndianFlag({ className = '' }) {
  return (
    <span className={`indian-flag ${className}`.trim()} aria-hidden="true">
      <i className="flag-saffron" />
      <i className="flag-white"><AshokaChakra /></i>
      <i className="flag-green" />
    </span>
  );
}

function August15Hero({ bannerImage, onBannerLoad }) {
  return (
    <section className="hero august15-hero">
      <div className="hero-background">
        <picture>
          {!bannerImage && <source media="(max-width: 768px)" srcSet={mobileBgImage} type="image/webp" />}
          <img
            src={bannerImage || bgImage}
            alt="Travellers discovering India together"
            className="hero-bg-image"
            fetchPriority="high"
            decoding="async"
            onLoad={onBannerLoad}
          />
        </picture>
        <div className="hero-overlay" />
      </div>

      <div className="august15-colour-wash wash-saffron" aria-hidden="true" />
      <div className="august15-colour-wash wash-green" aria-hidden="true" />

      <div className="august15-ribbon" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="august15-particles" aria-hidden="true">
        {posterParticles.map((particle, index) => (
          <i
            key={index}
            style={{
              '--particle-x': particle.x,
              '--particle-y': particle.y,
              '--particle-size': `${particle.size}px`,
              '--particle-delay': particle.delay,
              '--particle-duration': particle.duration,
            }}
          />
        ))}
      </div>

      <div className="august15-floating-flags" aria-hidden="true">
        {['one', 'two', 'three'].map((flag) => (
          <IndianFlag className={`august15-floating-flag flag-${flag}`} key={flag} />
        ))}
      </div>

      <div className="august15-wave-stack" aria-hidden="true">
        <span className="wave-saffron" />
        <span className="wave-white" />
        <span className="wave-green" />
      </div>
    </section>
  );
}

export default August15Hero;
