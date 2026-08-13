import { BadgeCheck, BusFront, Heart, ShieldCheck, Sparkles } from 'lucide-react';
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

function August15Hero() {
  return (
    <section className="hero august15-hero">
      <div className="hero-background">
        <picture>
          <source media="(max-width: 768px)" srcSet={mobileBgImage} type="image/webp" />
          <img
            src={bgImage}
            alt="Travellers discovering India together"
            className="hero-bg-image"
            fetchPriority="high"
            decoding="async"
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

      <div className="august15-poster-stage" aria-hidden="true">
        <div className="august15-script-word">भारत</div>

        <div className="august15-chakra august15-chakra-large">
          {Array.from({ length: 24 }, (_, index) => (
            <i key={index} style={{ '--spoke': index }} />
          ))}
        </div>

        <div className="august15-orbit orbit-one" />
        <div className="august15-orbit orbit-two" />

        <div className="august15-date-card">
          <div className="august15-date-card-shine" />
          <span className="august15-date-label"><Sparkles size={12} /> India celebrates</span>
          <div className="august15-date-main">
            <strong>15</strong>
            <div>
              <b>August</b>
              <span>Freedom in<br />every mile</span>
            </div>
          </div>
          <div className="august15-date-footer">
            <span>1947</span><i /><span>Forever</span>
          </div>
        </div>

        <div className="august15-floating-flags">
          {['one', 'two', 'three'].map((flag) => (
            <IndianFlag className={`august15-floating-flag flag-${flag}`} key={flag} />
          ))}
        </div>
      </div>

      <div className="hero-content">
        <div className="hero-kicker august15-kicker">
          <IndianFlag className="india-flag-dot" />
          स्वतंत्रता · Celebrating India
        </div>

        <h1 className="hero-title august15-title">
          <span>One nation.</span>
          <span>A million journeys.</span>
        </h1>

        <p className="hero-subtitle">
          This Independence Day, celebrate the freedom to go farther—across every city, every story, and every corner of India.
        </p>

        <div className="hero-proof-row august15-proof-row" aria-label="Independence Day booking highlights">
          <span><BusFront size={17} /> Connecting India</span>
          <span><ShieldCheck size={17} /> Secure journeys</span>
          <span><BadgeCheck size={17} /> Trusted operators</span>
        </div>

        <div className="august15-message">
          <span className="august15-mini-chakra" aria-hidden="true" />
          <span>Happy Independence Day</span>
          <Heart size={13} fill="currentColor" aria-hidden="true" />
        </div>
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
