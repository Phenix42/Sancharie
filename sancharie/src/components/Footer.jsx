import React from 'react'
import { Link } from 'react-router-dom'
import './Footer.css'
import { BusFront, MapPin, Phone, Mail, Clock } from 'lucide-react'

function Footer({ className = '' }) {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className={`footer ${className}`.trim()}>
      {/* Main Footer Content */}
      <div className="footer-main">
        <div className="footer-content">
          {/* Company Info Section */}
          <div className="footer-section company-section">
            <div className="footer-brand">
              <span><BusFront size={21} /></span>
              <div>
                <strong>Sancharie</strong>
                <small>Travel made simple</small>
              </div>
            </div>
            <p className="company-tagline">A simpler, clearer way to discover and book bus journeys across India.</p>
            
            {/* Contact Info */}
            <div className="contact-info">
              <div className="contact-item">
                <MapPin size={16} />
                <span>Aliabad Village, Shamirpet Mandal,<br />Medchal District, Hyderabad, Telangana</span>
              </div>
              <div className="contact-item">
                <Phone size={16} />
                <a href="tel:+919876543210">+91 98765 43210</a>
              </div>
              <div className="contact-item">
                <Mail size={16} />
                <a href="mailto:support@sancharie.com">support@sancharie.com</a>
              </div>
              <div className="contact-item">
                <Clock size={16} />
                <span>24/7 Customer Support</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="footer-section links-section">
            <h4 className="footer-title">Quick Links</h4>
            <nav className="footer-nav-vertical">
              <a href="#about">About Us</a>
              <a href="#contact">Contact Us</a>
              <a href="#career">Careers</a>
              <a href="#offers">Offers & Discounts</a>
              <a href="#wallet">Wallet</a>
            </nav>
          </div>

          {/* Legal Links */}
          <div className="footer-section legal-section">
            <h4 className="footer-title">Policies</h4>
            <nav className="footer-nav-vertical">
              <Link to="/privacy-policy" onClick={scrollToTop}>Privacy Policy</Link>
              <Link to="/terms" onClick={scrollToTop}>Terms & Conditions</Link>
              <Link to="/cancellation-policy" onClick={scrollToTop}>Cancellation & Refund Policy</Link>
              <Link to="/faq" onClick={scrollToTop}>FAQs</Link>
            </nav>
          </div>

          {/* Social Links */}
          <div className="footer-section social-section">
            <h4 className="footer-title">Connect With Us</h4>
            <div className="footer-social">
              <a href="https://x.com/SANCHARIE140221" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="X (Twitter)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/sancharie_bharat?igsh=d25jaWR2dnRzNDJ5" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </a>
              <a href="https://www.linkedin.com/in/sancharie-bharat-73b8b93a8/" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="LinkedIn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                  <rect x="2" y="9" width="4" height="12"/>
                  <circle cx="4" cy="4" r="2"/>
                </svg>
              </a>
            </div>
            <button onClick={scrollToTop} className="scroll-top-btn" aria-label="Scroll to top">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
              <span>Back to Top</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Bottom */}
      <div className="footer-bottom">
        <div className="footer-bottom-content">
          <p>© 2026 Sancharie. All rights reserved.</p>
          <p className="footer-bottom-links">
            <Link to="/privacy-policy" onClick={scrollToTop}>Privacy</Link>
            <span>•</span>
            <Link to="/terms" onClick={scrollToTop}>Terms</Link>
            <span>•</span>
            <Link to="/cancellation-policy" onClick={scrollToTop}>Refunds</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
