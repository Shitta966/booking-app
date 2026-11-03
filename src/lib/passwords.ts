const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'iloveyou', 'futminna', 'futick123', 'admin123', 'letmein123', '11111111', 'abc12345'])

/** Returns a reason the password is too weak, or null when it is acceptable. */
export function passwordProblem(password: string, email = '') {
  if (password.length < 10) return 'Use at least 10 characters.'
  if (password.length > 200) return 'That password is too long.'
  if (COMMON.has(password.toLowerCase())) return 'That password is too common. Choose something less guessable.'
  const local = email.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return 'Do not use your email name in your password.'
  return null
}
