/**
 * This file includes polyfills needed by the application.
 */

// No longer need to import core-js/stable in Angular 19

// Import regenerator-runtime for async/await support
import 'regenerator-runtime/runtime';

// Explicitly provide regeneratorRuntime global for older dsteem library
// Using a more TypeScript-friendly approach
(window as any).regeneratorRuntime = (window as any).regeneratorRuntime 
  || require('regenerator-runtime');