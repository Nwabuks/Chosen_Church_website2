// ===== ENVIRONMENT SETUP =====
const path = require('path');
const fs = require('fs');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    console.log('✅ .env file found, loading environment variables...');
    require('dotenv').config();
} else {
    console.log('❌ .env file not found, creating template...');
    const envTemplate = `PORT=3000
MONGO_URI=mongodb+srv://username:password@cluster0.xxx.mongodb.net/churchWebsite?retryWrites=true&w=majority
SESSION_SECRET=your-secret-key-here
ADMIN_PASSWORD=admin123`;
    fs.writeFileSync(envPath, envTemplate);
    console.log('📁 Created .env template file. Please edit it with your MongoDB Atlas credentials.');
}

// ===== IMPORTS =====
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const session = require('express-session');
const app = express();

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

console.log('🔧 Configuration:');
console.log('   PORT:', PORT);
console.log('   MONGODB_URI:', MONGODB_URI ? '*** loaded ***' : 'NOT SET - using temporary storage');

// ===== MIDDLEWARE =====
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'church-website-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// ===== MONGODB CONNECTION =====
if (MONGODB_URI && MONGODB_URI.includes('mongodb+srv://')) {
    mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas successfully');
    })
    .catch(err => {
        console.log('❌ MongoDB Atlas connection failed:', err.message);
        console.log('💡 Please check your MONGO_URI in the .env file');
    });
} else {
    console.log('⚠️  No valid MONGODB_URI found, using temporary storage');
}

// ===== MESSAGE SCHEMA =====
const messageSchema = new mongoose.Schema({
    title: { type: String, required: true },
    code: { type: String, required: true },
    date: { type: Date, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    filePath: { type: String, default: '' },
    // Add these new fields for MongoDB file storage
    pdfFile: {
        data: Buffer,
        contentType: String,
        filename: String,
        size: Number
    },
    featured: { type: Boolean, default: false }
}, {
    timestamps: true
});

const Message = mongoose.model('Message', messageSchema);
// ===== EVENT SCHEMA =====
const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    venue: { type: String, required: true },
    description: { type: String, required: true },
    imagePath: { type: String, default: '' },
    imageFile: {
        data: Buffer,
        contentType: String,
        filename: String,
        size: Number
    },
    link: { type: String, default: '' },
    featured: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
}, {
    timestamps: true
});

const Event = mongoose.model('Event', eventSchema);

// ===== EVENT FILE UPLOAD CONFIG =====
const eventStorage = multer.memoryStorage();
const eventUpload = multer({
    storage: eventStorage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// Temporary storage for events (fallback)
let tempEvents = [];

// ===== FILE UPLOAD CONFIGURATION =====
const storage = multer.memoryStorage(); // Store files in memory as Buffer

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (!file || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// ===== HELPER FUNCTIONS =====
function highlightText(text, query) {
    if (!query || !text) return text;
    
    const searchTerms = query.split(' ').filter(term => term.length > 2);
    let highlightedText = text;
    
    searchTerms.forEach(term => {
        const regex = new RegExp(term, 'gi');
        highlightedText = highlightedText.replace(regex, match => 
            `<span class="search-highlight">${match}</span>`
        );
    });
    
    return highlightedText;
}

// ===== TEMPORARY STORAGE (FALLBACK) =====
let tempMessages = [
    {
        _id: '1',
        title: 'The Power of Faith',
        code: 'PF',
        date: new Date('2023-10-15'),
        author: 'Pastor John',
        description: 'Exploring how faith can move mountains in our daily lives and strengthen our relationship with God.',
        filePath: '/pdf/1',
        featured: true
    },
    {
        _id: '2', 
        title: 'Divine Mercy',
        code: 'MD',
        date: new Date('2023-10-08'),
        author: 'Pastor Mark',
        description: 'Understanding God\'s infinite mercy and how it transforms our lives when we accept it.',
        filePath: '/pdf/2',
        featured: false
    },
    {
        _id: '3',
        title: 'Joy in Giving',
        code: 'JPEG',
        date: new Date('2023-10-01'),
        author: 'Pastor Sarah',
        description: 'Discovering the joy and blessings that come from a generous heart and giving spirit.',
        filePath: '/pdf/3',
        featured: false
    },
    {
        _id: '4',
        title: 'Hope in Trials',
        code: 'HT',
        date: new Date('2023-09-24'),
        author: 'Pastor James',
        description: 'Finding hope and strength in God during difficult times and trials.',
        filePath: '',
        featured: false
    }
];

// ===== MIDDLEWARE =====

// Check if user is authenticated as admin
const requireAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/admin-login');
    }
};

// ===== ROUTES =====

// ===== PDF DOWNLOAD ROUTE =====
app.get('/pdf/:id', async (req, res) => {
    try {
        const messageId = req.params.id;
        let message;
        
        try {
            if (mongoose.connection.readyState === 1) {
                message = await Message.findById(messageId);
            } else {
                message = tempMessages.find(msg => msg._id === messageId);
            }
        } catch (dbError) {
            message = tempMessages.find(msg => msg._id === messageId);
        }

        if (!message) {
            return res.status(404).send('Message not found');
        }

        // Check if PDF is stored in MongoDB
        if (message.pdfFile && message.pdfFile.data) {
            res.setHeader('Content-Type', message.pdfFile.contentType);
            res.setHeader('Content-Disposition', `inline; filename="${message.pdfFile.filename}"`);
            res.setHeader('Content-Length', message.pdfFile.size);
            res.send(message.pdfFile.data);
        } else if (message.filePath && fs.existsSync(path.join(__dirname, 'public', message.filePath))) {
            // Fallback to file system for existing files
            const filePath = path.join(__dirname, 'public', message.filePath);
            res.sendFile(filePath);
        } else {
            res.status(404).send('No PDF available for this message');
        }
    } catch (err) {
        console.log('PDF download error:', err);
        res.status(500).send('Error retrieving PDF');
    }
});

// ===== PDF PREVIEW ROUTE =====
app.get('/preview/:id', async (req, res) => {
    try {
        const messageId = req.params.id;
        let message;
        
        try {
            if (mongoose.connection.readyState === 1) {
                message = await Message.findById(messageId);
            } else {
                message = tempMessages.find(msg => msg._id === messageId);
            }
        } catch (dbError) {
            message = tempMessages.find(msg => msg._id === messageId);
        }

        if (!message) {
            return res.status(404).send('Message not found');
        }

        res.render('pdf-preview', { 
            filename: message.pdfFile?.filename || 'document.pdf',
            filePath: `/pdf/${messageId}`
        });
    } catch (err) {
        console.log('PDF preview error:', err);
        res.status(500).send('Error loading PDF preview');
    }
});

// Homepage - Show only 3 recent messages
// Homepage - Show 3 recent messages and upcoming events
app.get('/', async (req, res) => {
    try {
        let messages, featuredEvents;
        let usingMongoDB = false;
        let totalMessages = 0;
        
        try {
            if (mongoose.connection.readyState === 1) {
                // Get only 3 most recent messages for homepage
                messages = await Message.find().sort({ date: -1 }).limit(3);
                totalMessages = await Message.countDocuments();
                
                // Get upcoming events (not past events)
                featuredEvents = await Event.find({ 
                    date: { $gte: new Date() },
                    active: true 
                }).sort({ date: 1 }).limit(3); // Get 3 upcoming events
                
                usingMongoDB = true;
                console.log('📥 Loaded', messages.length, 'recent messages and', featuredEvents.length, 'upcoming events for homepage');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            // Get first 3 messages from temporary storage
            messages = tempMessages.slice(0, 3);
            totalMessages = tempMessages.length;
            
            // Get upcoming events from temporary storage
            const now = new Date();
            featuredEvents = tempEvents.filter(event => new Date(event.date) >= now).slice(0, 3);
            
            console.log('📥 Loaded', messages.length, 'recent messages and', featuredEvents.length, 'upcoming events from temporary storage');
        }
        
        res.render('index', { 
            messages: messages, 
            featuredEvents: featuredEvents,
            isAdmin: false,
            usingMongoDB: usingMongoDB,
            totalMessages: totalMessages
        });
    } catch (err) {
        console.log('Error loading homepage data:', err);
        res.render('index', { 
            messages: tempMessages.slice(0, 3), 
            featuredEvents: [],
            isAdmin: false,
            usingMongoDB: false,
            totalMessages: tempMessages.length
        });
    }
});

// Messages Page - Show ALL messages with featured first
app.get('/messages', async (req, res) => {
    try {
        let messages;
        let usingMongoDB = false;
        
        try {
            if (mongoose.connection.readyState === 1) {
                // Get messages with featured first, then by date
                messages = await Message.find().sort({ featured: -1, date: -1 });
                usingMongoDB = true;
                console.log('📥 Loaded', messages.length, 'messages for messages page');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            // Sort temp messages: featured first, then by date
            messages = [...tempMessages].sort((a, b) => {
                if (a.featured && !b.featured) return -1;
                if (!a.featured && b.featured) return 1;
                return new Date(b.date) - new Date(a.date);
            });
            console.log('📥 Loaded', messages.length, 'messages from temporary storage');
        }
        
        res.render('messages', { 
            messages: messages, 
            isAdmin: false,
            usingMongoDB: usingMongoDB
        });
    } catch (err) {
        console.log('Error loading messages:', err);
        res.render('messages', { 
            messages: tempMessages, 
            isAdmin: false,
            usingMongoDB: false
        });
    }
});

// Search Messages
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        let messages = [];
        let usingMongoDB = false;
        
        if (!query || query.trim() === '') {
            return res.redirect('/messages');
        }

        const searchTerm = query.trim();
        
        try {
            if (mongoose.connection.readyState === 1) {
                // Search in MongoDB (case-insensitive)
                messages = await Message.find({
                    $or: [
                        { title: { $regex: searchTerm, $options: 'i' } },
                        { description: { $regex: searchTerm, $options: 'i' } },
                        { author: { $regex: searchTerm, $options: 'i' } },
                        { code: { $regex: searchTerm, $options: 'i' } }
                    ]
                }).sort({ date: -1 });
                usingMongoDB = true;
                console.log('🔍 Search results from MongoDB:', messages.length, 'messages found');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            // Search in temporary storage
            messages = tempMessages.filter(message => 
                message.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                message.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                message.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
                message.code.toLowerCase().includes(searchTerm.toLowerCase())
            );
            console.log('🔍 Search results from temporary storage:', messages.length, 'messages found');
        }
        
        res.render('search', { 
            messages: messages, 
            isAdmin: false,
            usingMongoDB: usingMongoDB,
            searchQuery: searchTerm,
            resultsCount: messages.length,
            highlightText: highlightText
        });
    } catch (err) {
        console.log('Search error:', err);
        res.render('search', { 
            messages: [], 
            isAdmin: false,
            usingMongoDB: false,
            searchQuery: req.query.q || '',
            resultsCount: 0,
            highlightText: highlightText
        });
    }
});

// Admin Search Messages (Protected)
app.get('/admin-search', requireAuth, async (req, res) => {
    try {
        const query = req.query.q;
        let messages = [];
        
        if (!query || query.trim() === '') {
            return res.redirect('/admin');
        }

        const searchTerm = query.trim();
        
        try {
            if (mongoose.connection.readyState === 1) {
                // Search in MongoDB (case-insensitive)
                messages = await Message.find({
                    $or: [
                        { title: { $regex: searchTerm, $options: 'i' } },
                        { description: { $regex: searchTerm, $options: 'i' } },
                        { author: { $regex: searchTerm, $options: 'i' } },
                        { code: { $regex: searchTerm, $options: 'i' } }
                    ]
                }).sort({ date: -1 });
                console.log('🔍 Admin search results from MongoDB:', messages.length, 'messages found');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            // Search in temporary storage
            messages = tempMessages.filter(message => 
                message.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                message.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                message.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
                message.code.toLowerCase().includes(searchTerm.toLowerCase())
            );
            console.log('🔍 Admin search results from temporary storage:', messages.length, 'messages found');
        }
        
        res.render('admin', { 
            messages: messages, 
            isAuthenticated: true,
            usingMongoDB: mongoose.connection.readyState === 1,
            searchQuery: searchTerm,
            isSearchResults: true,
            resultsCount: messages.length,
            success: null
        });
    } catch (err) {
        console.log('Admin search error:', err);
        res.redirect('/admin');
    }
});
// Events Admin Page
app.get('/admin-events', requireAuth, (req, res) => {
    const usingMongoDB = mongoose.connection.readyState === 1;
    const success = req.query.success;
    res.render('admin-events', { 
        usingMongoDB: usingMongoDB,
        isAuthenticated: true,
        success: success
    });
});

// Upload Event
app.post('/upload-event', requireAuth, eventUpload.single('eventImage'), async (req, res) => {
    try {
        const { title, date, venue, description, link, featured } = req.body;
        
        if (!title || !date || !venue || !description || !req.file) {
            return res.status(400).send('Please fill in all required fields');
        }

        const newEvent = {
            title: title,
            date: new Date(date),
            venue: venue,
            description: description,
            link: link || '',
            featured: featured === 'on',
            active: true
        };

        // Store image in MongoDB
        if (req.file) {
            newEvent.imageFile = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
                filename: req.file.originalname,
                size: req.file.size
            };
            newEvent.imagePath = `/event-image/${Date.now()}-${req.file.originalname}`;
        }

        console.log('📅 Admin uploading event:', newEvent.title);

        try {
            if (mongoose.connection.readyState === 1) {
                const savedEvent = new Event(newEvent);
                await savedEvent.save();
                console.log('✅ Event saved to MongoDB Atlas');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            newEvent._id = Date.now().toString();
            tempEvents.unshift(newEvent);
            console.log('✅ Event saved to temporary storage');
        }

        res.redirect('/admin-events?success=Event uploaded successfully');
    } catch (err) {
        console.log('Event upload error:', err);
        res.status(500).send('Error uploading event: ' + err.message);
    }
});

// Get events data (JSON API)
app.get('/events-data', requireAuth, async (req, res) => {
    try {
        let events;
        
        try {
            if (mongoose.connection.readyState === 1) {
                events = await Event.find().sort({ date: 1 }); // Sort by date (soonest first)
            } else {
                events = tempEvents;
            }
        } catch (dbError) {
            events = tempEvents;
        }

        res.json(events);
    } catch (err) {
        console.log('Error loading events data:', err);
        res.status(500).json({ error: 'Failed to load events' });
    }
});

// Serve event images
app.get('/event-image/:id', async (req, res) => {
    try {
        const eventId = req.params.id;
        let event;
        
        try {
            if (mongoose.connection.readyState === 1) {
                event = await Event.findById(eventId);
            } else {
                event = tempEvents.find(evt => evt._id === eventId);
            }
        } catch (dbError) {
            event = tempEvents.find(evt => evt._id === eventId);
        }

        if (!event || !event.imageFile) {
            return res.status(404).send('Event image not found');
        }

        res.setHeader('Content-Type', event.imageFile.contentType);
        res.send(event.imageFile.data);
    } catch (err) {
        console.log('Event image error:', err);
        res.status(500).send('Error retrieving event image');
    }
});

// Delete Event
app.post('/delete-event/:id', requireAuth, async (req, res) => {
    try {
        const eventId = req.params.id;
        console.log('🗑️ Admin deleting event:', eventId);
        
        try {
            if (mongoose.connection.readyState === 1) {
                await Event.findByIdAndDelete(eventId);
                console.log('✅ Event deleted from MongoDB Atlas');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            tempEvents = tempEvents.filter(evt => evt._id !== eventId);
            console.log('✅ Event deleted from temporary storage');
        }

        res.redirect('/admin-events?success=Event deleted successfully');
    } catch (err) {
        console.log('Event delete error:', err);
        res.status(500).send('Error deleting event');
    }
});

// Get messages data for admin panel (JSON API)
app.get('/messages-data', requireAuth, async (req, res) => {
    try {
        let messages;
        
        try {
            if (mongoose.connection.readyState === 1) {
                messages = await Message.find().sort({ date: -1 });
            } else {
                messages = tempMessages;
            }
        } catch (dbError) {
            messages = tempMessages;
        }

        res.json(messages);
    } catch (err) {
        console.log('Error loading messages data:', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// Admin Login Page
app.get('/admin-login', (req, res) => {
    if (req.session.isAuthenticated) {
        return res.redirect('/admin');
    }
    res.render('admin-login', { error: null });
});

// Admin Login Handler
app.post('/admin-login', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        console.log('🔐 Admin logged in successfully');
        res.redirect('/admin');
    } else {
        console.log('❌ Failed login attempt');
        res.render('admin-login', { error: 'Invalid password' });
    }
});

// Admin Logout
app.get('/admin-logout', (req, res) => {
    req.session.destroy();
    console.log('🔒 Admin logged out');
    res.redirect('/');
});

// Admin Dashboard (Protected)
app.get('/admin', requireAuth, (req, res) => {
    const usingMongoDB = mongoose.connection.readyState === 1;
    const success = req.query.success;
    res.render('admin', { 
        usingMongoDB: usingMongoDB,
        isAuthenticated: true,
        success: success
    });
});

// Edit Message Page (Protected - Admin only)
app.get('/edit/:id', requireAuth, async (req, res) => {
    try {
        const messageId = req.params.id;
        let message;
        
        try {
            if (mongoose.connection.readyState === 1) {
                message = await Message.findById(messageId);
            } else {
                message = tempMessages.find(msg => msg._id === messageId);
            }
        } catch (dbError) {
            message = tempMessages.find(msg => msg._id === messageId);
        }

        if (!message) {
            return res.status(404).send('Message not found');
        }

        res.render('edit-message', { 
            message: message,
            isAuthenticated: true,
            usingMongoDB: mongoose.connection.readyState === 1
        });
    } catch (err) {
        console.log('Edit page error:', err);
        res.status(500).send('Error loading edit page');
    }
});

// Update Message (Protected - Admin only)
app.post('/update/:id', requireAuth, upload.single('messageFile'), async (req, res) => {
    try {
        const messageId = req.params.id;
        const { title, code, date, author, description, removeFile } = req.body;
        
        if (!title || !code || !date || !author || !description) {
            return res.status(400).send('Please fill in all required fields');
        }

        const updatedMessage = {
            title: title,
            code: code,
            date: new Date(date),
            author: author,
            description: description
        };

        // Handle file updates
        if (removeFile === 'on') {
            updatedMessage.filePath = '';
            updatedMessage.pdfFile = null;
        } else if (req.file) {
            // Store new PDF in MongoDB
            updatedMessage.pdfFile = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
                filename: req.file.originalname,
                size: req.file.size
            };
            updatedMessage.filePath = `/pdf/${messageId}`;
        } else {
            // Keep existing file
            let existingMessage;
            try {
                if (mongoose.connection.readyState === 1) {
                    existingMessage = await Message.findById(messageId);
                } else {
                    existingMessage = tempMessages.find(msg => msg._id === messageId);
                }
                updatedMessage.filePath = existingMessage?.filePath || '';
                updatedMessage.pdfFile = existingMessage?.pdfFile || null;
            } catch (dbError) {
                existingMessage = tempMessages.find(msg => msg._id === messageId);
                updatedMessage.filePath = existingMessage?.filePath || '';
                updatedMessage.pdfFile = existingMessage?.pdfFile || null;
            }
        }

        console.log('📝 Admin updating message:', messageId, updatedMessage.title);

        try {
            if (mongoose.connection.readyState === 1) {
                const result = await Message.findByIdAndUpdate(messageId, updatedMessage, { new: true });
                if (result) {
                    console.log('✅ Message updated in MongoDB Atlas');
                } else {
                    console.log('❌ Message not found in MongoDB');
                    return res.status(404).send('Message not found');
                }
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            const messageIndex = tempMessages.findIndex(msg => msg._id === messageId);
            if (messageIndex !== -1) {
                tempMessages[messageIndex] = { ...tempMessages[messageIndex], ...updatedMessage };
                console.log('✅ Message updated in temporary storage');
            } else {
                console.log('❌ Message not found in temporary storage');
                return res.status(404).send('Message not found');
            }
        }

        res.redirect('/admin?success=Message updated successfully');
    } catch (err) {
        console.log('Update error:', err);
        res.status(500).send('Error updating message: ' + err.message);
    }
});

// Set Featured Message (Protected - Admin only)
app.post('/featured/:id', requireAuth, async (req, res) => {
    try {
        const messageId = req.params.id;
        console.log('⭐ Admin setting featured message:', messageId);
        
        try {
            if (mongoose.connection.readyState === 1) {
                // First, unfeature all other messages
                await Message.updateMany({}, { featured: false });
                // Then set this one as featured
                const result = await Message.findByIdAndUpdate(messageId, { featured: true }, { new: true });
                if (result) {
                    console.log('✅ Message set as featured in MongoDB Atlas');
                } else {
                    console.log('❌ Message not found in MongoDB');
                    return res.status(404).send('Message not found');
                }
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            // For temporary storage
            tempMessages.forEach(msg => msg.featured = false);
            const messageIndex = tempMessages.findIndex(msg => msg._id === messageId);
            if (messageIndex !== -1) {
                tempMessages[messageIndex].featured = true;
                console.log('✅ Message set as featured in temporary storage');
            } else {
                console.log('❌ Message not found in temporary storage');
                return res.status(404).send('Message not found');
            }
        }

        res.redirect('/admin?success=Message set as featured successfully');
    } catch (err) {
        console.log('Featured error:', err);
        res.status(500).send('Error setting featured message');
    }
});

// Unfeature Message (Protected - Admin only)
app.post('/unfeature/:id', requireAuth, async (req, res) => {
    try {
        const messageId = req.params.id;
        console.log('❌ Admin unfeaturing message:', messageId);
        
        try {
            if (mongoose.connection.readyState === 1) {
                const result = await Message.findByIdAndUpdate(messageId, { featured: false }, { new: true });
                if (result) {
                    console.log('✅ Message unfeatured in MongoDB Atlas');
                    res.status(200).json({ success: true });
                } else {
                    console.log('❌ Message not found in MongoDB');
                    res.status(404).json({ error: 'Message not found' });
                }
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            // For temporary storage
            const messageIndex = tempMessages.findIndex(msg => msg._id === messageId);
            if (messageIndex !== -1) {
                tempMessages[messageIndex].featured = false;
                console.log('✅ Message unfeatured in temporary storage');
                res.status(200).json({ success: true });
            } else {
                console.log('❌ Message not found in temporary storage');
                res.status(404).json({ error: 'Message not found' });
            }
        }
    } catch (err) {
        console.log('Unfeature error:', err);
        res.status(500).json({ error: 'Error unfeaturing message' });
    }
});

// Upload Message (Protected - Admin only)
app.post('/upload', requireAuth, upload.single('messageFile'), async (req, res) => {
    try {
        const { title, code, date, author, description } = req.body;
        
        if (!title || !code || !date || !author || !description) {
            return res.status(400).send('Please fill in all required fields');
        }

        const newMessage = {
            title: title,
            code: code,
            date: new Date(date),
            author: author,
            description: description,
            filePath: '',
            featured: false
        };

        // If a PDF file was uploaded, store it in MongoDB
        if (req.file) {
            newMessage.pdfFile = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
                filename: req.file.originalname,
                size: req.file.size
            };
            // Also set filePath for backward compatibility
            newMessage.filePath = `/pdf/${Date.now()}-${req.file.originalname}`;
        }

        console.log('📤 Admin uploading message:', newMessage.title);

        try {
            if (mongoose.connection.readyState === 1) {
                const savedMessage = new Message(newMessage);
                await savedMessage.save();
                console.log('✅ Message saved to MongoDB Atlas with PDF');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            newMessage._id = Date.now().toString();
            // For temporary storage, we can't store the file buffer, so we skip PDF
            if (req.file) {
                console.log('⚠️ PDF not saved in temporary storage mode');
                newMessage.filePath = ''; // No file storage in temp mode
            }
            tempMessages.unshift(newMessage);
            console.log('✅ Message saved to temporary storage');
        }

        res.redirect('/admin?success=Message uploaded successfully');
    } catch (err) {
        console.log('Upload error:', err);
        res.status(500).send('Error uploading message: ' + err.message);
    }
});

// Delete Message (Protected - Admin only)
app.post('/delete/:id', requireAuth, async (req, res) => {
    try {
        const messageId = req.params.id;
        console.log('🗑️ Admin deleting message:', messageId);
        
        try {
            if (mongoose.connection.readyState === 1) {
                const result = await Message.findByIdAndDelete(messageId);
                if (result) {
                    console.log('✅ Message deleted from MongoDB Atlas');
                } else {
                    console.log('❌ Message not found in MongoDB');
                }
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            const initialLength = tempMessages.length;
            tempMessages = tempMessages.filter(msg => msg._id !== messageId);
            if (tempMessages.length < initialLength) {
                console.log('✅ Message deleted from temporary storage');
            } else {
                console.log('❌ Message not found in temporary storage');
            }
        }

        res.redirect('/admin?success=Message deleted successfully');
    } catch (err) {
        console.log('Delete error:', err);
        res.status(500).send('Error deleting message');
    }
});

// ===== MIGRATION ROUTE (Run once then remove) =====
app.get('/migrate-pdfs', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.send('MongoDB not connected');
        }

        const messages = await Message.find({ filePath: { $ne: '' } });
        let migratedCount = 0;

        for (const message of messages) {
            if (message.filePath && !message.pdfFile) {
                const filePath = path.join(__dirname, 'public', message.filePath);
                if (fs.existsSync(filePath)) {
                    const fileBuffer = fs.readFileSync(filePath);
                    message.pdfFile = {
                        data: fileBuffer,
                        contentType: 'application/pdf',
                        filename: path.basename(message.filePath),
                        size: fileBuffer.length
                    };
                    await message.save();
                    migratedCount++;
                    console.log(`✅ Migrated PDF for: ${message.title}`);
                }
            }
        }

        res.send(`Migration complete. ${migratedCount} PDFs migrated to MongoDB.`);
    } catch (err) {
        console.log('Migration error:', err);
        res.status(500).send('Migration failed: ' + err.message);
    }
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).send('File too large. Maximum size is 10MB.');
        }
    }
    console.log('Server error:', err);
    res.status(500).send('Something went wrong!');
});

app.use((req, res) => {
    res.status(404).send('Page not found');
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log('\n🎯 ===== CHURCH WEBSITE SERVER =====');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Website: http://localhost:${PORT}`);
    console.log(`📚 All Messages: http://localhost:${PORT}/messages`);
    console.log(`🔍 Search Messages: http://localhost:${PORT}/search`);
    console.log(`🔐 Admin Login: http://localhost:${PORT}/admin-login`);
    console.log(`⚙️  Admin Panel: http://localhost:${PORT}/admin (after login)`);
    console.log(`✏️  Edit Messages: http://localhost:${PORT}/edit/:id`);
    console.log(`📄 PDF Storage: MongoDB Database`);
    console.log(`⭐ Featured Messages: Enabled`);
    
    if (mongoose.connection.readyState === 1) {
        console.log('🗄️  Database: MongoDB Atlas (Persistent)');
    } else {
        console.log('💾 Storage: Temporary (Data resets on server restart)');
    }
    console.log('✅ Admin authentication enabled');
    console.log('✅ PDF files stored in MongoDB');
    console.log('✅ Search functionality added');
    console.log('================================\n');
});