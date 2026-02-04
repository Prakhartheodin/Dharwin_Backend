import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import config from '../config/config.js';
import { createUser } from '../services/user.service.js';
import { generateAuthTokens, generateResetPasswordToken, generateVerifyEmailToken } from '../services/token.service.js';
import { loginUserWithEmailAndPassword, logout as logout2, refreshAuth, resetPassword as resetPassword2, verifyEmail as verifyEmail2 } from '../services/auth.service.js';
import { sendResetPasswordEmail, sendVerificationEmail as sendVerificationEmail2 } from '../services/email.service.js';
// import { authService, userService, tokenService, emailService } from '../services/index.js';
// import { authService, userService, tokenService, emailService } from '../services';


const ACCESS_TOKEN_COOKIE = 'accessToken';
const REFRESH_TOKEN_COOKIE = 'refreshToken';

const cookieOptions = (expires) => ({
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: config.env === 'production' ? 'strict' : 'lax',
  path: '/',
  ...(expires && { expires }),
});

const setAuthCookies = (res, tokens) => {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.access.token, cookieOptions(tokens.access.expires));
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refresh.token, cookieOptions(tokens.refresh.expires));
};

const clearAuthCookies = (res) => {
  const options = cookieOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
};

/**
 * Administrator registers a user (POST /v1/auth/register).
 * Do not issue tokens or set cookies for the new user — leave the requester (admin) logged in.
 */
const register = catchAsync(async (req, res) => {
  const user = await createUser(req.body);
  res.status(httpStatus.CREATED).send({ user });
});

/**
 * Public registration: no auth required. User is created with status 'pending'.
 * They cannot login or access the system until an administrator sets status to 'active'.
 * No tokens or cookies are issued.
 */
const publicRegister = catchAsync(async (req, res) => {
  const user = await createUser({ ...req.body, status: 'pending' });
  res.status(httpStatus.CREATED).send({
    user,
    message: 'Registration successful. Your account is pending administrator approval. You will be able to sign in once activated.',
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await loginUserWithEmailAndPassword(email, password);
  const tokens = await generateAuthTokens(user);
  setAuthCookies(res, tokens);
  res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
  const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
  if (!refreshToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
  await logout2(refreshToken);
  clearAuthCookies(res);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
  if (!refreshToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
  const tokens = await refreshAuth(refreshToken);
  setAuthCookies(res, tokens);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await generateResetPasswordToken(req.body.email);
  await sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await resetPassword2(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await generateVerifyEmailToken(req.user);
  await sendVerificationEmail2(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const verifyEmail = catchAsync(async (req, res) => {
  await verifyEmail2(req.query.token);
  res.status(httpStatus.NO_CONTENT).send();
});

const getMe = catchAsync(async (req, res) => {
  res.send(req.user);
});

export {
  register,
  publicRegister,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  getMe,
};
