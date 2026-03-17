import "./App.css";
import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Header from "./components/Header";
import Hero from "./components/Hero";
import SearchBus from "./components/SearchBus";
import Features from "./components/Features";
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

function App() {
  const [showSearchResult, setShowSearchResult] = useState(false);
  const [searchParams, setSearchParams] = useState(null);
  const navigate = useNavigate();

  const handleSearch = (params) => {
    setSearchParams(params);
    setShowSearchResult(true);
    window.scrollTo(0, 0);
  };

  const handleBackToHome = () => {
    setShowSearchResult(false);
    setSearchParams(null);
    navigate('/');
  };

  return (
    <ToastProvider>
      <div className="app">
        <Routes>
        <Route path="/privacy-policy" element={
          <>
            <Header onBackToHome={handleBackToHome} />
            <PrivacyPolicies />
            <Footer />
            <MobileBottomNav onHomeClick={handleBackToHome} />
          </>
        } />
        <Route path="/booking-details" element={
          <>
            <Header onBackToHome={handleBackToHome} />
            <Details />
            <Footer />
          </>
        } />
        <Route path="/payment" element={
          <>
            <Header onBackToHome={handleBackToHome} />
            <Payment />
            <Footer />
          </>
        } />
        <Route path="/my-bookings" element={<><MyBookings /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/ticket/:ticketNumber" element={<><BookingDetails /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/profile" element={<><Profile /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/travellers" element={<><Travellers /><MobileBottomNav onHomeClick={handleBackToHome} /></>} />
        <Route path="/*" element={
          <>
            <Header onBackToHome={handleBackToHome} />
            {showSearchResult ? (
              <SearchResult searchParams={searchParams} onSearch={handleSearch} />
            ) : (
              <>
                <Hero />
                <SearchBus onSearch={handleSearch} />
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
