import React, { useState, useEffect, useRef, useMemo } from "react";
import { bus as busApi } from "../services/api";
import "./MiniSeatPreview.css";

/**
 * Global Seat Layout Prefetch Manager
 * Prefetches all seat layouts immediately when search results come in
 * Uses batch processing with rate limiting to avoid 429 errors
 */
const seatLayoutManager = {
  cache: new Map(),
  pendingCallbacks: new Map(), // Callbacks waiting for specific seat layouts
  prefetchQueue: [],
  isProcessing: false,
  activeRequests: 0,
  maxConcurrent: 1, // Only 1 request at a time to avoid 429 errors
  delayBetweenBatches: 1500, // 1.5s delay between requests
  retryDelay: 5000, // 5s retry delay
  maxRetries: 3,

  // Get cached seat layout instantly (use ResultIndex as key)
  getCached(resultIndex) {
    return this.cache.get(resultIndex) || null;
  },

  // Set cache entry
  setCache(resultIndex, _unused, seatLayout) {
    this.cache.set(resultIndex, seatLayout);
    
    // Notify any waiting callbacks
    const callbacks = this.pendingCallbacks.get(resultIndex);
    if (callbacks) {
      callbacks.forEach(cb => cb(seatLayout, null));
      this.pendingCallbacks.delete(resultIndex);
    }
  },

  // Subscribe to seat layout (returns immediately if cached, otherwise waits)
  subscribe(resultIndex, callback) {
    // Return cached immediately
    if (this.cache.has(resultIndex)) {
      callback(this.cache.get(resultIndex), null);
      return () => {};
    }

    // Add to pending callbacks
    if (!this.pendingCallbacks.has(resultIndex)) {
      this.pendingCallbacks.set(resultIndex, []);
    }
    this.pendingCallbacks.get(resultIndex).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.pendingCallbacks.get(resultIndex);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    };
  },

  // Prefetch all seat layouts for search results (called once after search)
  async prefetchAll(buses) {
    if (!buses?.length) return;

    // Add all buses to prefetch queue (skip already cached)
    buses.forEach(bus => {
      if (!this.cache.has(bus.ResultIndex)) {
        // Check if not already in queue
        const alreadyQueued = this.prefetchQueue.some(
          item => item.bus.ResultIndex === bus.ResultIndex
        );
        if (!alreadyQueued) {
          this.prefetchQueue.push({
            bus,
            cacheKey: bus.ResultIndex,
            retries: 0
          });
        }
      }
    });

    // Start processing
    this.processPrefetchQueue();
  },

  async processPrefetchQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.prefetchQueue.length > 0) {
      // Process batch of concurrent requests
      const batch = [];
      while (batch.length < this.maxConcurrent && this.prefetchQueue.length > 0) {
        batch.push(this.prefetchQueue.shift());
      }

      // Execute batch in parallel
      await Promise.all(batch.map(item => this.fetchSeatLayout(item)));

      // Small delay between batches to avoid rate limiting
      if (this.prefetchQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
      }
    }

    this.isProcessing = false;
  },

  async fetchSeatLayout(item) {
    const { bus, cacheKey, retries } = item;

    // Skip if already cached
    if (this.cache.has(cacheKey)) return;

    try {
      // Use bus object to get seat layout (ETS API requires bus-specific params)
      const seatData = await busApi.getSeatLayoutForBus(bus);
      this.setCache(bus.ResultIndex, null, seatData.seatLayout || seatData.seats);
    } catch (err) {
      const is429 = err.message?.includes('429') || err.status === 429;
      
      if (is429 && retries < this.maxRetries) {
        // Exponential backoff: 5s, 10s, 20s
        const backoffDelay = this.retryDelay * Math.pow(2, retries);
        // Re-add to END of queue with incremented retry (lower priority)
        this.prefetchQueue.push({ ...item, retries: retries + 1 });
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else if (!is429) {
        // Only log non-429 errors
        console.warn(`SeatLayoutManager: Error fetching ${bus.ResultIndex}:`, err.message);
        // Notify callbacks of error
        const callbacks = this.pendingCallbacks.get(cacheKey);
        if (callbacks) {
          callbacks.forEach(cb => cb(null, err));
          this.pendingCallbacks.delete(cacheKey);
        }
      }
      // Silently fail for 429s that exceeded retries
    }
  },

  // Clear cache when search changes
  clearCache() {
    this.cache.clear();
    this.prefetchQueue = [];
    this.pendingCallbacks.clear();
    this.isProcessing = false;
  }
};

/**
 * MiniSeatPreview Component
 * 
 * Displays a visual mini seat layout preview similar to AbhiBus style.
 * Shows:
 * - Upper deck (if exists) with sleeper berths
 * - Lower deck with seater/sleeper seats
 * - Color coded: green=available, pink=ladies, gray=booked, blue=selected male
 * - Seat count summary below
 */
export default function MiniSeatPreview({ bus, searchTokenId }) {
  const [seatLayout, setSeatLayout] = useState(() => 
    seatLayoutManager.getCached(bus?.ResultIndex)
  );
  const [loading, setLoading] = useState(!seatLayout);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  // Subscribe to seat layout updates
  useEffect(() => {
    if (!bus?.ResultIndex) {
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = seatLayoutManager.getCached(bus.ResultIndex);
    if (cached) {
      setSeatLayout(cached);
      setLoading(false);
      return;
    }

    // Subscribe to updates
    setLoading(true);
    const unsubscribe = seatLayoutManager.subscribe(
      bus.ResultIndex,
      (data, err) => {
        if (err) {
          setError("unavailable");
        } else {
          setSeatLayout(data);
          setError(null);
        }
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [searchTokenId, bus?.ResultIndex]);

  // Process seat layout data from ETS API
  const processedSeats = useMemo(() => {
    if (!seatLayout || !Array.isArray(seatLayout)) return [];

    return seatLayout.map((seat) => ({
      id: seat.id,
      seatName: seat.id,
      status: seat.available === true ? "available" : "booked",
      isLadiesSeat: seat.ladiesSeat === true,
      isMalesSeat: seat.malesSeat === true,
      isUpper: seat.zIndex === 1,
      rowNo: seat.row,
      columnNo: seat.column,
      seatType: seat.sleeper ? 2 : 1, // 1 = Seater, 2 = Sleeper
      length: seat.length || 1,
      width: seat.width || 1,
    }));
  }, [seatLayout]);

  // Organize seats into grid for visual display
  const { upperGrid, lowerGrid, stats, upperOccupied, lowerOccupied } = useMemo(() => {
    if (processedSeats.length === 0) {
      return { upperGrid: [], lowerGrid: [], stats: { total: 0, available: 0, singleCount: 0 }, upperOccupied: new Set(), lowerOccupied: new Set() };
    }

    const upperSeats = processedSeats.filter(s => s.isUpper);
    const lowerSeats = processedSeats.filter(s => !s.isUpper);

    const createGrid = (seats) => {
      if (seats.length === 0) return { grid: [], occupied: new Set(), maxCol: 0 };
      
      // Use API row/column values directly for positioning
      const maxRow = Math.max(...seats.map(s => s.rowNo)) + 1;
      const maxCol = Math.max(...seats.map(s => s.columnNo + (s.length > 1 ? s.length - 1 : 0))) + 1;
      
      // Create empty grid
      const grid = Array(maxRow).fill(null).map(() => Array(maxCol).fill(null));
      const occupied = new Set();
      
      // Place seats using their row/column from API
      seats.forEach(seat => {
        const { rowNo, columnNo, length, width } = seat;
        if (rowNo >= 0 && columnNo >= 0 && rowNo < maxRow && columnNo < maxCol) {
          grid[rowNo][columnNo] = seat;
          
          // Mark span cells for sleepers (length > 1 = horizontal span)
          if (length > 1) {
            for (let c = columnNo + 1; c < columnNo + length && c < maxCol; c++) {
              occupied.add(`${rowNo}-${c}`);
            }
          }
          // Mark span cells for vertical sleepers (width > 1)
          if (width > 1) {
            for (let r = rowNo + 1; r < rowNo + width && r < maxRow; r++) {
              occupied.add(`${r}-${columnNo}`);
            }
          }
        }
      });
      
      return { grid, occupied, maxCol };
    };

    const upper = createGrid(upperSeats);
    const lower = createGrid(lowerSeats);

    const availableSeats = processedSeats.filter(s => s.status === "available");
    const singleSeats = availableSeats.filter(s => s.seatType === 1 && s.length === 1 && s.width === 1);

    return {
      upperGrid: upper.grid || [],
      lowerGrid: lower.grid || [],
      upperOccupied: upper.occupied || new Set(),
      lowerOccupied: lower.occupied || new Set(),
      stats: {
        total: processedSeats.length,
        available: availableSeats.length,
        singleCount: singleSeats.length,
      }
    };
  }, [processedSeats]);

  // Render a single mini seat
  const renderMiniSeat = (seat, rowIdx, colIdx, occupied, deckType) => {
    // Skip cells occupied by spanning sleepers
    if (occupied?.has(`${rowIdx}-${colIdx}`)) {
      return null;
    }
    
    if (!seat) {
      // Empty cell - maintains grid alignment
      return <div key={`${deckType}-empty-${rowIdx}-${colIdx}`} className="mini-seat-cell empty" style={{ width: '13px', height: '11px' }} />;
    }

    const isSleeper = seat.seatType === 2 || seat.sleeper || seat.length > 1 || seat.width > 1;
    const isHorizontal = seat.length > 1;
    const isVertical = seat.width > 1;
    
    const seatClass = [
      'mini-seat-cell',
      isSleeper ? 'sleeper' : 'seater',
      isHorizontal ? 'horizontal' : '',
      isVertical ? 'vertical' : '',
      seat.status,
      seat.isLadiesSeat ? 'ladies' : '',
      seat.isMalesSeat ? 'males' : '',
    ].filter(Boolean).join(' ');

    const style = { width: '13px' };
    if (isHorizontal) {
      style.gridColumn = `span ${seat.length}`;
      style.width = `${seat.length * 13 + (seat.length - 1) * 3}px`;
    }
    if (isVertical) {
      style.gridRow = `span ${seat.width}`;
      style.height = `${seat.width * 11 + (seat.width - 1) * 3}px`;
    }

    return (
      <div 
        key={seat.id} 
        className={seatClass}
        style={style}
        title={`${seat.seatName} - ${seat.status}`}
      />
    );
  };

  const availableSeatsCount = stats.available || bus?.AvailableSeats || 0;
  const hasUpperDeck = upperGrid.length > 0;

  return (
    <div ref={containerRef} className="mini-seat-preview-container">
      {/* Loading State */}
      {loading && (
        <div className="mini-preview-loading">
          <div className="loading-shimmer"></div>
        </div>
      )}

      {/* Visual Seat Layout Preview */}
      {!loading && !error && processedSeats.length > 0 && (
        <div className="mini-seat-layout">
          {/* Upper Deck */}
          {hasUpperDeck && (
            <div className="mini-deck upper">
              <span className="deck-label">Upper</span>
              <div className="mini-seat-grid">
                {upperGrid.map((row, rowIdx) => (
                  <div key={`upper-row-${rowIdx}`} className="mini-seat-row">
                    {row.map((seat, colIdx) => renderMiniSeat(seat, rowIdx, colIdx, upperOccupied, 'upper'))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Divider between decks */}
          {hasUpperDeck && <div className="deck-divider" />}

          {/* Lower Deck */}
          <div className="mini-deck lower">
            {hasUpperDeck ? (
              <span className="deck-label">Lower</span>
            ) : (
              <span className="deck-label driver-cell">🚐</span>
            )}
            <div className="mini-seat-grid">
              {lowerGrid.map((row, rowIdx) => (
                <div key={`lower-row-${rowIdx}`} className="mini-seat-row">
                  {row.map((seat, colIdx) => renderMiniSeat(seat, rowIdx, colIdx, lowerOccupied, 'lower'))}
                </div>
              ))}
            </div>
          </div>

          {/* Seat Count Summary */}
          <div className="mini-seat-summary">
            <span className="seat-icon">💺</span>
            <span className="seat-count">{availableSeatsCount} seats</span>
            {stats.singleCount > 0 && stats.singleCount !== availableSeatsCount && (
              <span className="single-count">({stats.singleCount} Single)</span>
            )}
          </div>
        </div>
      )}

      {/* Fallback when no seat layout */}
      {!loading && (error || processedSeats.length === 0) && (
        <div className="mini-seat-fallback">
          <span className="seat-icon">💺</span>
          <span className="seat-count">{bus?.AvailableSeats || 0} seats</span>
        </div>
      )}
    </div>
  );
}

// Export function to clear seat layout cache when search changes
export const clearSeatLayoutCache = () => {
  seatLayoutManager.clearCache();
};

// Export function to get cached seat layout (for SelectSeat component)
export const getCachedSeatLayout = (resultIndex) => {
  return seatLayoutManager.getCached(resultIndex);
};

// Export function to set cache entry
export const setCachedSeatLayout = (resultIndex, seatLayout) => {
  seatLayoutManager.setCache(resultIndex, null, seatLayout);
};

// Export function to prefetch all seat layouts (call after search results come in)
export const prefetchAllSeatLayouts = (buses) => {
  seatLayoutManager.prefetchAll(buses);
};

// Export subscribe function for SelectSeat to use
export const subscribeSeatLayout = (resultIndex, callback) => {
  return seatLayoutManager.subscribe(resultIndex, callback);
};
