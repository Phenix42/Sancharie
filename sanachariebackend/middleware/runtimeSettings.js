const { ApplicationSettings } = require('../models/AdminResources');

const requireBookingAvailability = async (req, res, next) => {
  try {
    const settings = await ApplicationSettings.findOne({ key: 'global' }).select('maintenanceMode bookingsEnabled').lean();
    if (settings?.maintenanceMode || settings?.bookingsEnabled === false) {
      return res.status(503).json({ success: false, message: 'Bookings are temporarily unavailable.' });
    }
    next();
  } catch (error) { next(error); }
};

module.exports = { requireBookingAvailability };
