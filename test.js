const result = require('dotenv').config();

console.log('=== .env TEST ===');
console.log('Error:', result.error);
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'LOADED' : 'NOT FOUND');
console.log('=================');