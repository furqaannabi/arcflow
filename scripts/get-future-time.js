#!/usr/bin/env node

// Generate UTC timestamp 3 minutes from now
const now = new Date();
const threeMinutesLater = new Date(now.getTime() + (3 * 60 * 1000));

// Format: "February 9, 2026 at 08:00 AM UTC"
const options = { 
  month: 'long', 
  day: 'numeric', 
  year: 'numeric', 
  hour: '2-digit', 
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC'
};
const formattedDate = threeMinutesLater.toLocaleString('en-US', options);
const humanReadable = formattedDate.replace(',', ' at') + ' UTC';

console.log('\n📋 Copy and paste this message to the agent:\n');
console.log(`Create a payroll for ${humanReadable}`);
console.log('\n---');
console.log('Current time (UTC):', now.toISOString());
console.log('Payroll time (UTC):', threeMinutesLater.toISOString());
console.log('Unix timestamp:', Math.floor(threeMinutesLater.getTime() / 1000));
console.log('---\n');

