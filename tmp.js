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
    filePath: { type: String, default: '' }
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
let tempMessages = [
    {
        _id: '1',
        title: 'The Power of Faith',
        code: 'PF',
        date: new Date('2023-10-15'),
        author: 'Pastor John',
        description: 'Exploring how faith can move mountains in our daily lives and strengthen our relationship with God.',
        filePath: '/uploads/sample-faith.pdf'
    },
    {
        _id: '2', 
        title: 'Divine Mercy',
        code: 'MD',
        date: new Date('2023-10-08'),
        author: 'Pastor Mark',
        description: 'Understanding God\'s infinite mercy and how it transforms our lives when we accept it.',
        filePath: '/uploads/sample-mercy.pdf'
    },
    {
        _id: '3',
        title: 'Joy in Giving',
        code: 'JPEG',
        date: new Date('2023-10-01'),
        author: 'Pastor Sarah',
        description: 'Discovering the joy and blessings that come from a generous heart and giving spirit.',
        filePath: '/uploads/sample-joy.pdf'
    },
    {
        _id: '4',
        title: 'Hope in Trials',
        code: 'HT',
        date: new Date('2023-09-24'),
        author: 'Pastor James',
        description: 'Finding hope and strength in God during difficult times and trials.',
        filePath: ''
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

// Homepage - Show only 3 recent messages
app.get('/', async (req, res) => {
    try {
        let messages;
        let usingMongoDB = false;
        let totalMessages = 0;
        
        try {
            if (mongoose.connection.readyState === 1) {
                // Get only 3 most recent messages for homepage
                messages = await Message.find().sort({ date: -1 }).limit(3);
                totalMessages = await Message.countDocuments();
                usingMongoDB = true;
                console.log('📥 Loaded', messages.length, 'recent messages for homepage');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            // Get first 3 messages from temporary storage
            messages = tempMessages.slice(0, 3);
            totalMessages = tempMessages.length;
            console.log('📥 Loaded', messages.length, 'recent messages from temporary storage');
        }
        
        res.render('index', { 
            messages: messages, 
            isAdmin: false,
            usingMongoDB: usingMongoDB,
            totalMessages: totalMessages
        });
    } catch (err) {
        console.log('Error loading messages:', err);
        res.render('index', { 
            messages: tempMessages.slice(0, 3), 
            isAdmin: false,
            usingMongoDB: false,
            totalMessages: tempMessages.length
        });
    }
});

// Messages Page - Show ALL messages
app.get('/messages', async (req, res) => {
    try {
        let messages;
        let usingMongoDB = false;
        
        try {
            if (mongoose.connection.readyState === 1) {
                messages = await Message.find().sort({ date: -1 });
                usingMongoDB = true;
                console.log('📥 Loaded', messages.length, 'messages for messages page');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            messages = tempMessages;
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
            filePath: req.file ? '/uploads/' + req.file.filename : ''
        };

        console.log('📤 Admin uploading message:', newMessage);

        try {
            if (mongoose.connection.readyState === 1) {
                const savedMessage = new Message(newMessage);
                await savedMessage.save();
                console.log('✅ Message saved to MongoDB Atlas');
            } else {
                throw new Error('MongoDB not connected');
            }
        } catch (dbError) {
            newMessage._id = Date.now().toString();
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
    console.log(`🔐 Admin Login: http://localhost:${PORT}/admin-login`);
    console.log(`⚙️  Admin Panel: http://localhost:${PORT}/admin (after login)`);
    
    if (mongoose.connection.readyState === 1) {
        console.log('🗄️  Database: MongoDB Atlas (Persistent)');
    } else {
        console.log('💾 Storage: Temporary (Data resets on server restart)');
    }
    console.log('✅ Admin authentication enabled');
    console.log('✅ Separate messages page created');
    console.log('✅ Homepage shows 3 recent messages only');
    console.log('✅ Admin panel shows all messages with delete options');
    console.log('================================\n');
});