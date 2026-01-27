import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

export function requireAuth(req, res, next){
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ message: 'No token provided' })
  const parts = auth.split(' ')
  if (parts.length !== 2) return res.status(401).json({ message: 'Invalid token format' })
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET)
    req.user = payload
    return next()
  } catch (err){
    return res.status(401).json({ message: 'Invalid token' })
  }
}

export function requireRole(...roles){
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' })
    return next()
  }
}

export function signToken(user){
  return jwt.sign({
    id: user._id.toString(),
    role: user.role,
    email: user.email || null,
    name: user.name
  }, JWT_SECRET, { expiresIn: '7d' })
}
