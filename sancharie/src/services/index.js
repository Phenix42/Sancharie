/**
 * ============================================
 * SERVICES INDEX
 * ============================================
 * 
 * Re-exports all API services for convenient imports.
 * 
 * Usage:
 *   import { auth, bus, flights, payment, user } from '@/services';
 *   import { busApi } from '@/services';
 *   import api from '@/services';
 * 
 * @module services
 */

export { auth, user, bus, flights, payment, default } from './api';
export * as busApi from './busApi';
