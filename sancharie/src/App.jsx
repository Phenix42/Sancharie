import "./App.css";
import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Header from "./components/Header";
import Hero from "./components/Hero";
import SearchBus from "./components/SearchBus";
import Features from "./components/Features";
import OurService from "./components/OurService";
import BusResults from "./components/BusResults";
import SearchResult from "./components/SearchResult";
import Footer from "./components/Footer";
import PrivacyPolicies from "./components/privacypolacies";
import Details from "./components/Details";
import Payment from "./components/payment";
import MyBookings from "./components/MyBookings";
import Profile from "./components/Profile";
import Travellers from "./components/Travellers";

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
    <div className="app">
      <Routes>
        <Route path="/privacy-policy" element={
          <>
            <Header onBackToHome={handleBackToHome} />
            <PrivacyPolicies />
            <Footer />
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
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/travellers" element={<Travellers />} />
        <Route path="/*" element={
          <>
            <Header onBackToHome={handleBackToHome} />
            {showSearchResult ? (
              <SearchResult searchParams={searchParams} />
            ) : (
              <>
                <Hero />
                <SearchBus onSearch={handleSearch} />
                <OurService />
              
                <BusResults />
              </>
            )}
            <Footer />
          </>
        } />
      </Routes>
    </div>
  );
}

export default App;
