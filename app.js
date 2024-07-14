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
const bcrypt = require('bcryptjs');  // Add bcrypt import
const multer = require("multer")

require("dotenv").config() 

mongoDb = process.env.MONGODB_URL

mongoose.connect(mongoDb);
const db = mongoose.connection;
db.on("error", console.error.bind(console, "mongo connection error"));

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
    profilePic: { type:String, required: true },
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

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));  // Change from 'views' to 'public'

app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Middleware to make user available in templates
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

// Routes
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
    return res.redirect('/login'); // Ensure user is logged in
  }

  console.log('Form data:', req.body); // Add this line to debug form data

  try {
    const newPost = new Post({
      text: req.body.post,
      sender: req.user._id
    });

    const savedPost = await newPost.save();
    console.log('Post saved:', savedPost); // Add this line to confirm the post was saved
    res.redirect('/');
  } catch (err) {
    console.error('Error saving post:', err); // Add this line to debug errors
    next(err);
  }
});

app.post('/like-post/:postId', async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id; // Assuming you have user authentication middleware

  try {
    // Check if the user has already liked the post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (post.likedBy.includes(userId)) {
      return res.json({ alreadyLiked: true });
    }

    // Update the post with new likes count and add userId to likedBy array
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
    const comment = { user: req.user._id, text: req.body.text }; // Ensure req.user is populated
    const post = await Post.findById(postId);
    post.comments.push(comment);
    await post.save();
    // Redirect to the main page after adding the comment
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

// Profile page route
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
  // Create a guest user session
  const guest = { username: 'Guest', isGuest: true };
  const posts = await Post.find().populate("sender").populate('comments.user').exec();
  res.render('index', { user: guest, posts }); // Pass guest as user object
});

app.post('/follow/:id', async (req, res) => {
  const userId = req.user._id; // ID of the user who is following
  const followUserId = req.params.id; // ID of the user to be followed

  try {
    // Find both users
    const user = await User.findById(userId);
    const followUser = await User.findById(followUserId);

    if (!user || !followUser) {
      return res.status(404).send('User not found');
    }

    // Check if the user is already following the other user
    if (user.following.includes(followUserId)) {
      return res.status(400).send('You are already following this user');
    }

    // Add to the following and followers arrays
    user.following.push(followUserId);
    followUser.followers.push(userId);

    // Save both users
    await user.save();
    await followUser.save();

    res.redirect(`/profile/${followUserId}`);
  } catch (err) {
    console.error(err);
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

// Catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// Error handler
app.use(function (err, req, res, next) {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Render the error page
  res.status(err.status || 500);
  res.render('error', { title: "Error" });
});

// Passport configuration
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
