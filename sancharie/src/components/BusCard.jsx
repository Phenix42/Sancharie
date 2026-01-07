import React from 'react'
import './BusCard.css'

function BusCard({ bus }) {
  const {
    id,
    name,
    departure,
    arrival,
    departureTime,
    arrivalTime,
    duration,
    seats,
    price,
    rating
  } = bus

  return (
    <div className="bus-card">
      <div className="bus-header">
        <h3 className="bus-name">{name}</h3>
        <div className="bus-rating">
          <span className="stars">★★★★★</span>
          <span className="rating-value">{rating}</span>
        </div>
      </div>

      <div className="bus-details">
        <div className="route-section">
          <div className="location">
            <p className="time">{departureTime}</p>
            <p className="city">{departure}</p>
          </div>

          <div className="duration-info">
            <p className="duration">{duration}</p>
            <div className="route-line"></div>
          </div>

          <div className="location">
            <p className="time">{arrivalTime}</p>
            <p className="city">{arrival}</p>
          </div>
        </div>

        <div className="bus-info">
          <span className="seats">
            <span className="seat-icon">🪑</span>
            {seats} Seats Available
          </span>
        </div>
      </div>

      <div className="bus-footer">
        <div className="price-section">
          <p className="price-label">Price per seat</p>
          <p className="price">₹{price}</p>
        </div>
        <button className="book-btn">Book Now</button>
      </div>
    </div>
  )
}

export default BusCard
