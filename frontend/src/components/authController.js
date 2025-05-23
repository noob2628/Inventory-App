const jwt = require('jsonwebtoken');
const User = require('../models/User');

// User model would need to be created (see below)
const createToken = (userId, role) => {
  return jwt.sign({ _id: userId, role }, process.env.JWT_SECRET || 'your_jwt_secret', {
    expiresIn: '24h'
  });
};

exports.signup = async (req, res) => {
  try {
    // Default to 'user' role - only existing admins can create other admins
    const role = req.body.role === 'admin' && req.user?.role === 'admin' ? 'admin' : 'user';
    
    const user = new User({
      ...req.body,
      role,
      password: req.body.password // Will be hashed in pre-save hook
    });

    await user.save();
    const token = createToken(user._id, user.role);
    
    res.status(201).json({ 
      message: 'User created successfully',
      token,
      role: user.role
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = createToken(user._id, user.role);
    
    res.json({
      token,
      role: user.role,
      message: 'Logged in successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter(token => token.token !== req.token);
    await req.user.save();
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};