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
  inFlight: new Map(),
  isProcessing: false,
  generation: 0,
  activeRequests: 0,
  maxConcurrent: 1, // Only 1 request at a time to avoid 429 errors
  delayBetweenBatches: 1500, // 1.5s delay between requests
  retryDelay: 5000, // 5s retry delay
  maxRetries: 3,

  getBusFare(bus) {
    const fare = Number(
      bus?.BusPrice?.BasePrice ??
      bus?.BusPrice?.PublishedPrice ??
      bus?.fare
    );
    return Number.isFinite(fare) && fare > 0 ? fare : Number.MAX_SAFE_INTEGER;
  },

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
    const generation = this.generation;

    // The results page initially shows the cheapest buses. Queue layouts in the
    // same order so those cards become interactive first instead of following
    // the provider's arbitrary response order.
    [...buses]
      .sort((a, b) => this.getBusFare(a) - this.getBusFare(b))
      .forEach(bus => {
        if (!this.cache.has(bus.ResultIndex)) {
          // Check if not already in queue
          const alreadyQueued = this.prefetchQueue.some(
            item => item.bus.ResultIndex === bus.ResultIndex
          );
          if (!alreadyQueued && this.inFlight.get(bus.ResultIndex) !== generation) {
            this.prefetchQueue.push({
              bus,
              cacheKey: bus.ResultIndex,
              retries: 0,
              generation,
            });
          }
        }
      });

    // Keep newly added results correctly ordered if prefetchAll is called while
    // another layout request is already running.
    this.prefetchQueue.sort(
      (a, b) => this.getBusFare(a.bus) - this.getBusFare(b.bus)
    );

    // Start processing
    this.processPrefetchQueue();
  },

  // Move a bus to the front when the customer explicitly opens its seats.
  prioritize(bus) {
    if (!bus?.ResultIndex || this.cache.has(bus.ResultIndex)) return;
    const generation = this.generation;

    const queuedIndex = this.prefetchQueue.findIndex(
      item => item.bus.ResultIndex === bus.ResultIndex
    );

    if (queuedIndex > 0) {
      const [queuedItem] = this.prefetchQueue.splice(queuedIndex, 1);
      this.prefetchQueue.unshift(queuedItem);
    } else if (queuedIndex === -1 && this.inFlight.get(bus.ResultIndex) !== generation) {
      this.prefetchQueue.unshift({
        bus,
        cacheKey: bus.ResultIndex,
        retries: 0,
        generation,
      });
    }

    this.processPrefetchQueue();
  },

  async processPrefetchQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    const generation = this.generation;

    while (generation === this.generation && this.prefetchQueue.length > 0) {
      // Process batch of concurrent requests
      const batch = [];
      while (batch.length < this.maxConcurrent && this.prefetchQueue.length > 0) {
        batch.push(this.prefetchQueue.shift());
      }

      // Execute batch in parallel
      await Promise.all(batch.map(item => this.fetchSeatLayout(item)));

      // A new search invalidates the old queue and any responses still arriving.
      if (generation !== this.generation) return;

      // Small delay between batches to avoid rate limiting
      if (this.prefetchQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
      }
    }

    if (generation === this.generation) this.isProcessing = false;
  },

  async fetchSeatLayout(item) {
    const { bus, cacheKey, retries, generation } = item;

    // Skip if already cached
    if (generation !== this.generation || this.cache.has(cacheKey)) return;

    this.inFlight.set(cacheKey, generation);
    try {
      // Use bus object to get seat layout (ETS API requires bus-specific params)
      const seatData = await busApi.getSeatLayoutForBus(bus);
      if (generation !== this.generation) return;
      this.setCache(bus.ResultIndex, null, seatData.seatLayout || seatData.seats);
    } catch (err) {
      if (generation !== this.generation) return;
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
    } finally {
      if (this.inFlight.get(cacheKey) === generation) {
        this.inFlight.delete(cacheKey);
      }
    }
  },

  // Clear cache when search changes
  clearCache() {
    this.generation += 1;
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
      return <div key={`${deckType}-empty-${rowIdx}-${colIdx}`} className="mini-seat-cell empty" />;
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

    const style = {};
    if (isHorizontal) {
      style.gridColumn = `span ${seat.length}`;
    }
    if (isVertical) {
      style.height = `calc(${seat.width} * var(--cell-h) + ${seat.width - 1} * var(--cell-gap))`;
    }

    return (
      <div 
        key={seat.id} 
        className={seatClass}
        style={Object.keys(style).length > 0 ? style : undefined}
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

// Export function to promote a selected bus ahead of background prefetch work.
export const prioritizeSeatLayout = (bus) => {
  seatLayoutManager.prioritize(bus);
};

// Export subscribe function for SelectSeat to use
export const subscribeSeatLayout = (resultIndex, callback) => {
  return seatLayoutManager.subscribe(resultIndex, callback);
};

// Export the minimum available base fare. Tax-inclusive totals are intentionally
// kept for checkout and must not be presented as the search-result base price.
export const getMinBaseFareFromCache = (resultIndex) => {
  const seats = seatLayoutManager.getCached(resultIndex);
  if (!seats || !Array.isArray(seats) || seats.length === 0) return null;
  let min = Infinity;
  for (const seat of seats) {
    if (seat.available !== true) continue;
    const fare = parseFloat(seat.fare) || 0;
    if (fare > 0 && fare < min) min = fare;
  }
  return min === Infinity ? null : Math.round(min);
};
