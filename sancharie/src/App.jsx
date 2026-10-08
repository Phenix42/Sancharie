import "./App.css";
import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Header from "./components/Header";
import Hero from "./components/Hero";
import SearchBus from "./components/SearchBus";
import DiscountOffers from "./components/DiscountOffers";
import OurService from "./components/OurService";
import BookingSteps from "./components/BookingSteps";
import BusResults from "./components/BusResults";
import SearchResult from "./components/SearchResult";
import Footer from "./components/Footer";
import PrivacyPolicies from "./components/privacypolacies";
import Details from "./components/Details";
import Payment from "./components/payment";
import MyBookings from "./components/MyBookings";
import BookingDetails from "./components/BookingDetails";
import Profile from "./components/Profile";
import Travellers from "./components/Travellers";
import { ToastProvider } from "./components/Toast";
import MobileBottomNav from "./components/MobileBottomNav";
import FlightBooking from "./components/FlightBooking";
import FlightHome from "./components/FlightHome";
import HotelHome from "./components/HotelHome";
import { THEME_FLAGS } from "./themes/themeConfig";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getInitialTravelMode = () => {
  const mode = new URLSearchParams(window.location.search).get('mode');
  return ['bus', 'flight', 'hotel'].includes(mode) ? mode : 'bus';
};

const getModePath = (mode) => {
  if (mode === 'flight') return '/?mode=flight';
  if (mode === 'hotel') return '/?mode=hotel';
  return '/';
};

function App() {
  const [showSearchResult, setShowSearchResult] = useState(false);
  const [searchParams, setSearchParams] = useState(null);
  const [travelMode, setTravelMode] = useState(getInitialTravelMode);
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const referralCode = new URLSearchParams(window.location.search).get('ref');
    if (/^SAN[A-F0-9]{10}$/i.test(referralCode || '')) localStorage.setItem('pendingReferralCode', referralCode.toUpperCase());
    const loadConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/config`);
        if (!response.ok) return;
        const payload = await response.json();
        if (!active || !payload.success) return;
        const config = payload.data;
        setRuntimeConfig(config);
        if (config.appIconUrl) {
          const iconHref = `${API_BASE_URL.replace(/\/$/, '')}${config.appIconUrl}`;
          document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => link.setAttribute('href', iconHref));
        }
        const theme = config.settings?.festivalThemeEnabled ? config.theme : null;
        const root = document.documentElement;
        root.style.setProperty('--primary-color', theme?.primaryColor || '#002C3F');
        root.style.setProperty('--gold-color', theme?.secondaryColor || '#CEB45F');
        root.style.setProperty('--runtime-background-color', theme?.backgroundColor || '#ffffff');
      } catch {
        // The customer app keeps its built-in configuration when the API is unavailable.
      }
    };
    loadConfig();
    const timer = window.setInterval(loadConfig, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const handleSearch = (params) => {
    setSearchParams(params);
    setShowSearchResult(true);
    window.scrollTo(0, 0);
  };

  const handleBackToHome = () => {
    setShowSearchResult(false);
    setSearchParams(null);
    navigate(getModePath(travelMode));
  };

  const handleModeChange = (mode) => {
    if (mode === travelMode) return;
    setTravelMode(mode);
    setShowSearchResult(false);
    setSearchParams(null);
    navigate(getModePath(mode));
  };
  const customerBanner = runtimeConfig?.banners?.[0];
  const runtimeBrandTheme = runtimeConfig?.appIconUrl
    ? { ...runtimeConfig.theme, logoImage: `${API_BASE_URL.replace(/\/$/, '')}${runtimeConfig.appIconUrl}` }
    : runtimeConfig?.theme;
  const safeCustomerUrl = (url) => /^(https:\/\/|\/(?!\/))/.test(String(url || '')) ? url : '#';

  return (
    <ToastProvider>
      <div className={`app ${THEME_FLAGS.AUGUST_15 ? 'theme-august-15' : ''}`}>
        {(runtimeConfig?.settings?.announcement || customerBanner || runtimeConfig?.theme?.promotionalText) && <a className="runtime-announcement" href={safeCustomerUrl(customerBanner?.ctaUrl)}>
          {customerBanner?.image && /^(https:\/\/|\/(?!\/))/.test(customerBanner.image) && <img src={customerBanner.image} alt="" />}
          <strong>{customerBanner?.title || runtimeConfig?.theme?.name || 'Announcement'}</strong>
          <span>{runtimeConfig?.settings?.announcement || customerBanner?.description || runtimeConfig?.theme?.promotionalText}</span>
          {(customerBanner?.ctaText || runtimeConfig?.theme?.ctaText) && <b>{customerBanner?.ctaText || runtimeConfig?.theme?.ctaText}</b>}
        </a>}
        <Routes>
        <Route path="/privacy-policy" element={
          <>
            <Header
              runtimeTheme={runtimeBrandTheme}
              travelMode={travelMode}
              onTravelModeChange={handleModeChange}
              onBackToHome={handleBackToHome}
            />
            <PrivacyPolicies />
            <Footer />
            <MobileBottomNav onHomeClick={handleBackToHome} />
          </>
        } />
        <Route path="/booking-details" element={
          <>
            <Header
              runtimeTheme={runtimeBrandTheme}
              travelMode={travelMode}
              onTravelModeChange={handleModeChange}
              onBackToHome={handleBackToHome}
            />
            <Details />
            <Footer />
          </>
        } />
        <Route path="/payment" element={
          <>
            <Header
              runtimeTheme={runtimeBrandTheme}
              travelMode={travelMode}
              onTravelModeChange={handleModeChange}
              onBackToHome={handleBackToHome}
            />
            <Payment />
            <Footer />
          </>
        } />
        <Route path="/my-bookings" element={<><MyBookings /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/ticket/:ticketNumber" element={<><BookingDetails /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/profile" element={<><Profile /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/travellers" element={<><Travellers /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/flight-booking" element={
          <>
            <Header
              runtimeTheme={runtimeBrandTheme}
              travelMode="flight"
              onTravelModeChange={handleModeChange}
              onBackToHome={handleBackToHome}
            />
            <FlightBooking />
            <Footer />
          </>
        } />
        <Route path="/*" element={
          <>
            <Header
              runtimeTheme={runtimeBrandTheme}
              travelMode={travelMode}
              onTravelModeChange={handleModeChange}
              onBackToHome={handleBackToHome}
            />
            {showSearchResult ? (
              <SearchResult
                searchParams={searchParams}
                onSearch={handleSearch}
                onBackToHome={handleBackToHome}
                mode={travelMode}
              />
            ) : travelMode === 'flight' ? (
              <FlightHome onSearch={handleSearch} />
            ) : travelMode === 'hotel' ? (
              <HotelHome />
            ) : (
              <>
                <Hero />
                <SearchBus onSearch={handleSearch} mode="bus" />
                <DiscountOffers discounts={runtimeConfig?.settings?.discountsEnabled === false ? [] : runtimeConfig?.discounts || []} />
                <OurService />
                <BookingSteps />
                <BusResults />
              </>
            )}
            <Footer className={!showSearchResult ? 'footer-home' : ''} />
            <MobileBottomNav 
              onHomeClick={handleBackToHome}
              onSearchClick={showSearchResult ? undefined : null}
            />
          </>
        } />
      </Routes>
    </div>
    </ToastProvider>
  );
}

export default App;
