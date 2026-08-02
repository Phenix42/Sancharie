const STORAGE_KEY = 'sanchariePendingBookingUpdates';
const MAX_QUEUE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const getCurrentUserId = () => {
  try {
    return JSON.parse(localStorage.getItem('authUser') || '{}').id || '';
  } catch {
    return '';
  }
};

export const createBookingReference = (serviceType) => {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${serviceType}-${randomPart}`;
};

const readQueue = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const writeQueue = (items) => {
  const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
  const currentItems = items.filter((item) => Number(item.queuedAt) >= cutoff);
  if (currentItems.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentItems));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
};

const removeQueuedUpdate = (bookingId, userId) => {
  writeQueue(readQueue().filter((item) => (
    item.bookingId !== bookingId || item.userId !== userId
  )));
};

const queueUpdate = (bookingId, updateData, userId) => {
  const queue = readQueue();
  const existingIndex = queue.findIndex((item) => (
    item.bookingId === bookingId && item.userId === userId
  ));
  const existing = existingIndex >= 0 ? queue[existingIndex] : null;
  const item = {
    bookingId,
    userId,
    updateData: { ...(existing?.updateData || {}), ...updateData },
    queuedAt: Date.now(),
  };

  if (existingIndex >= 0) queue[existingIndex] = item;
  else queue.push(item);
  writeQueue(queue);
  return item.updateData;
};

/**
 * Persist a lifecycle update. If the network is unavailable, keep the latest
 * merged state locally and retry it when the dashboard is opened or focused.
 */
export const persistBookingUpdate = async (updateBooking, bookingId, updateData) => {
  if (!bookingId) return { success: false, message: 'Booking record is missing' };

  const userId = getCurrentUserId();
  const queued = readQueue().find((item) => (
    item.bookingId === bookingId && item.userId === userId
  ));
  const mergedUpdate = { ...(queued?.updateData || {}), ...updateData };
  const result = await updateBooking(bookingId, mergedUpdate);

  if (result?.success) removeQueuedUpdate(bookingId, userId);
  else queueUpdate(bookingId, mergedUpdate, userId);

  return result;
};

export const flushPendingBookingUpdates = async (updateBooking) => {
  const userId = getCurrentUserId();
  if (!userId) return;

  const queue = readQueue();
  const currentUserItems = queue.filter((item) => item.userId === userId);

  for (const item of currentUserItems) {
    const result = await updateBooking(item.bookingId, item.updateData);
    if (result?.success) removeQueuedUpdate(item.bookingId, userId);
  }
};
