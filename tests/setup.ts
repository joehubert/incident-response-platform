import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Add any global test setup here
beforeAll(async () => {
  // Global setup
});

afterAll(async () => {
  // Global teardown
});
