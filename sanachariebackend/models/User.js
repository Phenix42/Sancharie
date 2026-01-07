/**
 * User Model - MongoDB Schema
 * Stores user profile information after OTP verification
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Phone number is the primary identifier (used for OTP login)
  phone: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Profile information (collected after first login)
  name: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  age: {
    type: Number,
    default: null
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', ''],
    default: ''
  },
  
  // Profile completion status
  isProfileComplete: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field and check profile completeness before saving
userSchema.pre('save', function() {
  this.updatedAt = new Date();
  
  // Check if profile is complete
  if (this.name && this.email && this.age && this.gender) {
    this.isProfileComplete = true;
  }
});

// Method to check if profile is complete - returns boolean
userSchema.methods.checkProfileComplete = function() {
  return !!(this.name && this.email && this.age && this.gender);
};

module.exports = mongoose.model('User', userSchema);
