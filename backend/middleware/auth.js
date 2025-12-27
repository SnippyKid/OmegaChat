import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access token required' 
      });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, decoded) => {
      if (err) {
        console.error('Token verification error:', err.message);
        return res.status(403).json({ 
          success: false,
          error: err.name === 'TokenExpiredError' 
            ? 'Token expired. Please login again.' 
            : 'Invalid or expired token' 
        });
      }
      
      if (!decoded || !decoded.userId) {
        return res.status(403).json({ 
          success: false,
          error: 'Invalid token format' 
        });
      }
      
      req.userId = decoded.userId;
      next();
    });
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Authentication error' 
    });
  }
};
