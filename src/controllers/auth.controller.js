import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { createUser } from '../services/user.service.js';
import { generateAuthTokens,generateResetPasswordToken,generateVerifyEmailToken } from '../services/token.service.js';
import { loginUserWithEmailAndPassword,logout as logout2,refreshAuth,resetPassword as resetPassword2,verifyEmail as verifyEmail2  } from '../services/auth.service.js';
import { sendResetPasswordEmail,sendVerificationEmail as sendVerificationEmail2  } from '../services/email.service.js';
// import { authService, userService, tokenService, emailService } from '../services/index.js';
// import { authService, userService, tokenService, emailService } from '../services';


const register = catchAsync(async (req, res) => {
  const user = await createUser(req.body);
  const tokens = await generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user, tokens });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await loginUserWithEmailAndPassword(email, password);
  const tokens = await generateAuthTokens(user);
  res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
  await logout2(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await refreshAuth(req.body.refreshToken);
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

export {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
};
