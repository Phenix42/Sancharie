import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import './AboutUs.css';

const team = [
  {
    name: 'Vamshi Krishna Raju',
    role: 'Founder & CEO',
    image: '/about/Vamshi.jpeg',
    initials: 'V',
    bio: "Vamshi drives Sancharie's vision, business strategy, and overall growth. He leads strategic initiatives, business development, and partnerships, with a focus on delivering customer value and building a trusted travel platform. His vision is to make travel booking simpler, more accessible, and rewarding for everyone.",
  },
  {
    name: 'Raja Sekhar',
    role: 'Co-Founder & Managing Director',
    image: '/about/Shekar.jpeg',
    initials: 'RS',
    bio: "Raja Sekhar oversees technology strategy, product development, and business operations at Sancharie. With a strong background in IT management and technology, he focuses on scalable digital solutions and improving the customer experience. He plays an integral role in driving innovation and turning Sancharie's vision into a seamless, rewarding travel platform.",
  },
];

function TeamPortrait({ member }) {
  return (
    <div className="about-team-portrait">
      <span className="about-team-initials" aria-hidden="true">{member.initials}</span>
      <img src={member.image} alt={member.name} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />
      <span className="about-portrait-accent" aria-hidden="true" />
    </div>
  );
}

export default function AboutUs() {
  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-hero-orb about-hero-orb-one" aria-hidden="true" />
        <div className="about-hero-orb about-hero-orb-two" aria-hidden="true" />
        <div className="about-hero-inner">
          <span className="about-eyebrow"><Sparkles size={15} /> Our story</span>
          <h1>Travel made simpler.<br /><span>Journeys made more rewarding.</span></h1>
          <p>We bring travelers and travel providers together with a booking experience built around convenience, value, and care.</p>
          <a className="about-hero-link" href="#our-story">Discover Sancharie <ArrowRight size={17} /></a>
        </div>
        <div className="about-hero-stamp" aria-hidden="true"><Compass size={27} /><span>Every journey<br />starts somewhere</span></div>
      </section>

      <section className="about-story about-section-shell" id="our-story">
        <div className="about-story-heading">
          <span className="about-section-kicker">About Sancharie</span>
          <h2>A better way to plan the way forward.</h2>
        </div>
        <div className="about-story-copy">
          <p>Sancharie is an innovative travel booking platform focused on making travel planning simple, convenient, affordable, and rewarding. Our platform brings travelers and travel service providers together, offering a seamless booking experience, a wide range of travel options, competitive prices, and customer-focused services.</p>
          <p>With a vision to transform the travel booking experience, Sancharie combines technology, convenience, and customer rewards to make every journey more valuable. Through our referral and rewards program, we encourage customers to share their experiences and earn exciting benefits.</p>
          <p>Our commitment is to deliver reliable services, simplify travel planning, and create lasting relationships with our customers and travel partners.</p>
        </div>
      </section>

      <section className="about-team about-section-shell" id="management-team">
        <div className="about-team-heading">
          <span className="about-section-kicker">The people behind the journey</span>
          <h2>Management Team</h2>
          <p>Meet the people building a simpler, more rewarding way to travel.</p>
        </div>
        <div className="about-team-grid">
          {team.map((member) => (
            <article className="about-team-card" key={member.name}>
              <TeamPortrait member={member} />
              <div className="about-team-copy">
                <span className="about-team-role">{member.role}</span>
                <h3>{member.name}</h3>
                <p>{member.bio}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
