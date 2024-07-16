var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require('bcryptjs'); 
const multer = require("multer")
const helmet = require("helmet")

const { RateLimiterMemory } = require("rate-limiter-flexible");

require("dotenv").config() 

const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
  throw new Error('MONGODB_URI environment variable not set');
}

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const Post = mongoose.model(
  "Post",
  new Schema({
    text: { type: String, required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    likes: { type: Number, default:0},
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ]
}))

const User = mongoose.model(
  "User",
  new Schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    profilePic: { type:String },
    followers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  })
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); 

app.use(helmet())

app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

app.get("/sign-up", (req, res) => res.render("sign-up-form", { title: "Sign up" }));

app.post("/sign-up", async (req, res, next) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({
      username: req.body.username,
      password: hashedPassword
    });
    const result = await user.save();
    res.redirect("/");
  } catch (err) {
    return next(err);
  }
});

app.post(
  "/log-in",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/"
  })
);

app.get("/", async (req, res) => {
  const posts = await Post.find().populate("sender").populate('comments.user').exec();
  res.render("index", { user: req.user, posts });
});

app.post('/send-post', async (req, res, next) => {
  if (!req.user) {
    return res.redirect('/login'); 
  }

  console.log('Form data:', req.body); 

  try {
    const newPost = new Post({
      text: req.body.post,
      sender: req.user._id
    });

    const savedPost = await newPost.save();
    console.log('Post saved:', savedPost); 
    res.redirect('/');
  } catch (err) {
    console.error('Error saving post:', err);
    next(err);
  }
});

app.post('/like-post/:postId', async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id;
  try {
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (post.likedBy.includes(userId)) {
      return res.json({ alreadyLiked: true });
    }

    post.likes += 1;
    post.likedBy.push(userId);
    await post.save();

    res.json({ alreadyLiked: false, message: 'Post liked successfully', post });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ message: 'Failed to like post' });
  }
});


app.post('/add-comment/:id', async (req, res, next) => {
  try {
    const postId = req.params.id;
    const comment = { user: req.user._id, text: req.body.text };
    const post = await Post.findById(postId);
    post.comments.push(comment);
    await post.save();
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

app.post('/upload-profile-pic', upload.single('profilePic'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send('User not found');
    }
    user.profilePic = `/uploads/${req.file.filename}`;
    await user.save();
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error uploading file');
  }
});

app.get('/profile', async (req, res) => {
  const user = await User.findById(req.user._id);  
  const posts = await Post.find({sender: req.user._id})
  res.render('profile', { user, posts });
});

app.get("/list-of-users", async(req,res)=>{
  const users = await User.find().exec()
  res.render("list-of-users", {users})
})

app.get('/profile/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    const posts = await Post.find({ sender: req.params.id }).exec();
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.render('profile', { user, posts });
  } catch (err) {
    next(err);
  }
});

app.post('/visit-as-guest', async (req, res) => {
  const guest = { username: 'Guest', isGuest: true };
  const posts = await Post.find().populate("sender").populate('comments.user').exec();
  res.render('index', { user: guest, posts }); 
});

app.post('/follow/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const currentUserId = req.user._id;

    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res.status(404).send('User not found');
    }

    
    if (userToFollow.followers.includes(currentUserId)) {
      return res.status(400).send('You are already following this user');
    }

    userToFollow.followers.push(currentUserId);

    const currentUser = await User.findById(currentUserId);

    currentUser.following.push(userId);

    await userToFollow.save();
    await currentUser.save();
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).send('Error following user');
  }
});

app.get("/log-out", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error', { title: "Error" });
});

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username });
      if (!user) {
        return done(null, false, { message: "Incorrect username" });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: "Incorrect password" });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

app.use('/', indexRouter);
app.use('/users', usersRouter);

module.exports = app;