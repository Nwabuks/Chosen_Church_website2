// ===== ENVIRONMENT SETUP =====
const path = require('path');
const fs = require('fs');

// Load environment variables
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

// ===== MIDDLEWARE =====
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');

// ===== MONGODB CONNECTION =====
const connectDB = async () => {
    try {
        if (MONGODB_URI && MONGODB_URI.includes('mongodb+srv://')) {
            await mongoose.connect(MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            console.log('✅ Connected to MongoDB Atlas successfully');
            return true;
        } else {
            console.log('❌ No valid MONGODB_URI found');
            console.log('💡 Please add MONGO_URI to your environment variables');
            return false;
        }
    } catch (error) {
        console.log('❌ MongoDB connection failed:', error.message);
        return false;
    }
};

// ===== SESSION CONFIGURATION (After DB connection) =====
const setupSession = () => {
    let sessionConfig = {
        secret: process.env.SESSION_SECRET || 'church-website-secret-key-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: { 
            secure: false, // Set to true if using HTTPS
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    };

    // Only use MongoDB session store if DB is connected
    if (MONGODB_URI && MONGODB_URI.includes('mongodb+srv://')) {
        try {
            const MongoStore = require('connect-mongo');
            sessionConfig.store = MongoStore.create({
                mongoUrl: MONGODB_URI,
                ttl: 24 * 60 * 60 // 1 day
            });
            console.log('✅ MongoDB session store configured');
        } catch (error) {
            console.log('⚠️  Could not setup MongoDB session store, using MemoryStore');
        }
    } else {
        console.log('⚠️  Using MemoryStore for sessions (not recommended for production)');
    }

    return sessionConfig;
};

app.use(session(setupSession()));

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

// Health check route
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

// Homepage - Show only 3 recent messages
app.get('/', async (req, res) => {
    try {
        let messages = [];
        let totalMessages = 0;
        
        if (mongoose.connection.readyState === 1) {
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

// PDF Preview Route
app.get('/preview/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public/uploads', filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('PDF not found');
    }
    
    res.render('pdf-preview', { 
        filename: filename,
        filePath: `/uploads/${filename}`
    });
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
        
        if (mongoose.connection.readyState === 1) {
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
            console.log('❌ MongoDB not connected - cannot search');
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
        let messages = [];
        
        if (mongoose.connection.readyState === 1) {
            messages = await Message.find().sort({ date: -1 });
        } else {
            console.log('❌ MongoDB not connected');
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
        let message = null;
        
        if (mongoose.connection.readyState === 1) {
            message = await Message.findById(messageId);
        } else {
            console.log('❌ MongoDB not connected - cannot edit message');
            return res.status(500).send('Database not available');
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
            if (mongoose.connection.readyState === 1) {
                const existingMessage = await Message.findById(messageId);
                updatedMessage.filePath = existingMessage?.filePath || '';
            }
        }

        console.log('📝 Admin updating message:', messageId, updatedMessage);

        if (mongoose.connection.readyState === 1) {
            const result = await Message.findByIdAndUpdate(messageId, updatedMessage, { new: true });
            if (result) {
                console.log('✅ Message updated in MongoDB Atlas');
                res.redirect('/admin?success=Message updated successfully');
            } else {
                console.log('❌ Message not found in MongoDB');
                res.status(404).send('Message not found');
            }
        } else {
            console.log('❌ MongoDB not connected - cannot update');
            res.status(500).send('Database not available');
        }
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
        
        if (mongoose.connection.readyState === 1) {
            // First, unfeature all other messages
            await Message.updateMany({}, { featured: false });
            // Then set this one as featured
            const result = await Message.findByIdAndUpdate(messageId, { featured: true }, { new: true });
            if (result) {
                console.log('✅ Message set as featured in MongoDB Atlas');
                res.redirect('/admin?success=Message set as featured successfully');
            } else {
                console.log('❌ Message not found in MongoDB');
                res.status(404).send('Message not found');
            }
        } else {
            console.log('❌ MongoDB not connected - cannot set featured');
            res.status(500).send('Database not available');
        }
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
const startServer = async () => {
    // Try to connect to MongoDB
    await connectDB();
    
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
        console.log(`📄 PDF Preview: Enabled`);
        
        if (mongoose.connection.readyState === 1) {
            console.log('🗄️  Database: MongoDB Atlas (Persistent)');
            console.log('✅ All database features enabled');
        } else {
            console.log('❌ Database: NOT CONNECTED');
            console.log('💡 Please add MONGO_URI to your environment variables');
            console.log('💾 Using temporary storage (data resets on restart)');
        }
        
        console.log('✅ Admin authentication enabled');
        console.log('✅ File upload functionality enabled');
        console.log('================================\n');
    });
};

startServer();
