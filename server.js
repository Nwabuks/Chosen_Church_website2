// ===== ENVIRONMENT SETUP =====
const path = require('path');
const fs = require('fs');

// Load environment variables (Render will provide these)
require('dotenv').config();

// ===== IMPORTS =====
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const session = require('express-session');
const app = express();

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGO_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

console.log('🔧 Configuration:');
console.log('   PORT:', PORT);
console.log('   MONGODB_URI:', MONGODB_URI ? '*** loaded ***' : 'NOT SET');
console.log('   NODE_ENV:', process.env.NODE_ENV);

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
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// ===== MONGODB CONNECTION =====
// ===== MONGODB CONNECTION =====
if (MONGODB_URI && MONGODB_URI.includes('mongodb+srv://')) {
    mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // 5 second timeout
        socketTimeoutMS: 45000, // 45 second socket timeout
    })
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas successfully');
    })
    .catch(err => {
        console.log('❌ MongoDB Atlas connection failed:', err.message);
        console.log('💡 Please check your MONGO_URI environment variable');
    });
} else {
    console.log('❌ No valid MONGODB_URI found - Database features disabled');
}

// ===== MESSAGE SCHEMA =====
const messageSchema = new mongoose.Schema({
    title: { type: String, required: true },
    code: { type: String, required: true },
    date: { type: Date, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    filePath: { type: String, default: '' },
    featured: { type: Boolean, default: false }
}, {
    timestamps: true
});

const Message = mongoose.model('Message', messageSchema);

// ===== FILE UPLOAD CONFIGURATION =====
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = path.join(__dirname, 'public/uploads/');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

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
        fileSize: 10 * 1024 * 1024
    }
});

// ===== TEMPORARY STORAGE (FALLBACK) =====
/*let tempMessages = [
    {
        _id: '1',
        title: 'The Power of Faith',
        code: 'PF',
        date: new Date('2023-10-15'),
        author: 'Pastor John',
        description: 'Exploring how faith can move mountains in our daily lives and strengthen our relationship with God.',
        filePath: '/uploads/sample-faith.pdf',
        featured: true
    },
    {
        _id: '2', 
        title: 'Divine Mercy',
        code: 'MD',
        date: new Date('2023-10-08'),
        author: 'Pastor Mark',
        description: 'Understanding God\'s infinite mercy and how it transforms our lives when we accept it.',
        filePath: '/uploads/sample-mercy.pdf',
        featured: false
    },
    {
        _id: '3',
        title: 'Joy in Giving',
        code: 'JPEG',
        date: new Date('2023-10-01'),
        author: 'Pastor Sarah',
        description: 'Discovering the joy and blessings that come from a generous heart and giving spirit.',
        filePath: '/uploads/sample-joy.pdf',
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
*/

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
// ===== PDF PREVIEW ROUTE =====
app.get('/preview/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public/uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('PDF not found');
    }
    
    res.render('pdf-preview', { 
        filename: filename,
        filePath: `/uploads/${filename}`
    });
});
// Homepage - Show only 3 recent messages

// Homepage - Show only 3 recent messages
app.get('/', async (req, res) => {
    try {
        let messages = [];
        let totalMessages = 0;
        
        if (mongoose.connection.readyState === 1) {
            // Get only 3 most recent messages for homepage
            messages = await Message.find().sort({ date: -1 }).limit(3);
            totalMessages = await Message.countDocuments();
            console.log('📥 Loaded', messages.length, 'recent messages for homepage from MongoDB');
        } else {
            console.log('❌ MongoDB not connected - showing empty state');
        }
        
        res.render('index', { 
            messages: messages, 
            isAdmin: false,
            usingMongoDB: mongoose.connection.readyState === 1,
            totalMessages: totalMessages
        });
    } catch (err) {
        console.log('Error loading messages:', err);
        res.render('index', { 
            messages: [], 
            isAdmin: false,
            usingMongoDB: false,
            totalMessages: 0
        });
    }
});

// Messages Page - Show ALL messages with featured first
app.get('/messages', async (req, res) => {
    try {
        let messages = [];
        
        if (mongoose.connection.readyState === 1) {
            // Get messages with featured first, then by date
            messages = await Message.find().sort({ featured: -1, date: -1 });
            console.log('📥 Loaded', messages.length, 'messages for messages page from MongoDB');
        } else {
            console.log('❌ MongoDB not connected');
        }
        
        res.render('messages', { 
            messages: messages, 
            isAdmin: false,
            usingMongoDB: mongoose.connection.readyState === 1
        });
    } catch (err) {
        console.log('Error loading messages:', err);
        res.render('messages', { 
            messages: [], 
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
        
        if (!query || query.trim() === '') {
            return res.redirect('/messages');
        }

        const searchTerm = query.trim();
        
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
            console.log('🔍 Search results from MongoDB:', messages.length, 'messages found');
        } else {
            console.log('❌ MongoDB not connected - cannot search');
        }
        
        res.render('search', { 
            messages: messages, 
            isAdmin: false,
            usingMongoDB: mongoose.connection.readyState === 1,
            searchQuery: searchTerm,
            resultsCount: messages.length
        });
    } catch (err) {
        console.log('Search error:', err);
        res.render('search', { 
            messages: [], 
            isAdmin: false,
            usingMongoDB: false,
            searchQuery: req.query.q || '',
            resultsCount: 0
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
        } else if (req.file) {
            updatedMessage.filePath = '/uploads/' + req.file.filename;
        } else {
            // Keep existing file path
            let existingMessage;
            try {
                if (mongoose.connection.readyState === 1) {
                    existingMessage = await Message.findById(messageId);
                } else {
                    existingMessage = tempMessages.find(msg => msg._id === messageId);
                }
                updatedMessage.filePath = existingMessage?.filePath || '';
            } catch (dbError) {
                existingMessage = tempMessages.find(msg => msg._id === messageId);
                updatedMessage.filePath = existingMessage?.filePath || '';
            }
        }

        console.log('📝 Admin updating message:', messageId, updatedMessage);

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
            filePath: req.file ? '/uploads/' + req.file.filename : '',
            featured: false
        };

        console.log('📤 Admin uploading message:', newMessage);

        if (mongoose.connection.readyState === 1) {
            const savedMessage = new Message(newMessage);
            await savedMessage.save();
            console.log('✅ Message saved to MongoDB Atlas');
            res.redirect('/admin?success=Message uploaded successfully');
        } else {
            console.log('❌ MongoDB not connected - cannot save message');
            res.status(500).send('Database not available. Please check MongoDB connection.');
        }
    } catch (err) {
        console.log('Upload error:', err);
        res.status(500).send('Error uploading message: ' + err.message);
    }
});

// Delete Message (Protected - Admin only)
// Delete Message (Protected - Admin only)
app.post('/delete/:id', requireAuth, async (req, res) => {
    try {
        const messageId = req.params.id;
        console.log('🗑️ Admin deleting message:', messageId);
        
        if (mongoose.connection.readyState === 1) {
            const result = await Message.findByIdAndDelete(messageId);
            if (result) {
                console.log('✅ Message deleted from MongoDB Atlas');
                res.redirect('/admin?success=Message deleted successfully');
            } else {
                console.log('❌ Message not found in MongoDB');
                res.redirect('/admin?error=Message not found');
            }
        } else {
            console.log('❌ MongoDB not connected - cannot delete');
            res.status(500).send('Database not available. Please check MongoDB connection.');
        }
    } catch (err) {
        console.log('Delete error:', err);
        res.status(500).send('Error deleting message');
    }
});
// Get messages data for admin panel (JSON API)
app.get('/messages-data', requireAuth, async (req, res) => {
    try {
        let messages = [];
        
        if (mongoose.connection.readyState === 1) {
            // Get all messages from MongoDB, sorted by date (newest first)
            messages = await Message.find().sort({ date: -1 });
        } else {
            console.log('❌ MongoDB not connected');
        }

        // Send messages as JSON data (not HTML)
        res.json(messages);
    } catch (err) {
        console.log('Error loading messages data:', err);
        res.status(500).json({ error: 'Failed to load messages' });
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
    console.log(`⭐ Featured Messages: Enabled`);
    
    if (mongoose.connection.readyState === 1) {
        console.log('🗄️  Database: MongoDB Atlas (Persistent)');
    } else {
        console.log('💾 Storage: Temporary (Data resets on server restart)');
    }
    console.log('✅ Admin authentication enabled');
    console.log('✅ Separate messages page created');
    console.log('✅ Homepage shows 3 recent messages only');
    console.log('✅ Admin panel shows all messages with delete options');
    console.log('✅ Search functionality added');
    console.log('✅ Admin search functionality added');
    console.log('✅ Message editing functionality added');
    console.log('================================\n');
});