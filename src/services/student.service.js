import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';
import Student from '../models/student.model.js';
import { createUser } from './user.service.js';
import { getRoleByName } from './role.service.js';
import * as uploadService from './upload.service.js';

/**
 * Register a new student
 * Creates both User and Student profile records
 * @param {Object} studentBody - Registration data including user fields and student profile fields
 * @param {boolean} isAdminRegistration - Whether this is an admin registering the student
 * @returns {Promise<{user: User, student: Student}>}
 */
const registerStudent = async (studentBody, isAdminRegistration = false) => {
  // Find Student role
  const studentRole = await getRoleByName('Student');
  if (!studentRole) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Student role not found. Please contact administrator.');
  }

  // Extract user fields and student profile fields
  const { phone, dateOfBirth, gender, address, education, experience, skills, documents, bio, profileImageUrl, profileImageKey, ...userFields } = studentBody;

  // Prepare user data
  const userData = {
    ...userFields,
    roleIds: [studentRole.id], // Automatically assign Student role ID
    status: 'active', // Students are active by default
    isEmailVerified: isAdminRegistration ? true : false, // Admin registration = verified, self-registration = not verified
  };

  // Create user
  const user = await createUser(userData);

  // Prepare student profile data
  const studentData = {
    user: user.id, // Reference to Users table
    phone,
    dateOfBirth,
    gender,
    address,
    education: education || [],
    experience: experience || [],
    skills: skills || [],
    documents: documents || [],
    bio,
    profileImageUrl: profileImageUrl || null,
    profileImageKey: profileImageKey || null,
    status: 'active',
  };

  // Create student profile
  const student = await Student.create(studentData);

  return { user, student };
};

/**
 * Query for students
 * @param {Object} filter - Mongo filter (status, search)
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryStudents = async (filter, options) => {
  const { search, ...restFilter } = filter;
  const mongoFilter = { ...restFilter };
  if (search && search.trim()) {
    const trimmed = search.trim();
    const searchRegex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    mongoFilter.$or = [
      { phone: { $regex: searchRegex } },
    ];
  }
  const students = await Student.paginate(mongoFilter, {
    ...options,
    populate: 'user',
  });
  return students;
};

/**
 * Get student by id
 * @param {ObjectId} id
 * @returns {Promise<Student>}
 */
const getStudentById = async (id) => {
  return Student.findById(id).populate('user', 'name email role roleIds status isEmailVerified');
};

/**
 * Get student by user id
 * @param {ObjectId} userId
 * @returns {Promise<Student>}
 */
const getStudentByUserId = async (userId) => {
  return Student.findOne({ user: userId }).populate('user', 'name email role roleIds status isEmailVerified');
};

/**
 * Update student by id
 * @param {ObjectId} studentId
 * @param {Object} updateBody
 * @returns {Promise<Student>}
 */
const updateStudentById = async (studentId, updateBody) => {
  const student = await getStudentById(studentId);
  if (!student) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  }
  Object.assign(student, updateBody);
  await student.save();
  return student;
};

/**
 * Delete student by id
 * @param {ObjectId} studentId
 * @returns {Promise<Student>}
 */
const deleteStudentById = async (studentId) => {
  const student = await getStudentById(studentId);
  if (!student) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  }
  await student.remove();
  return student;
};

/**
 * Upload profile picture for a student. Uploads file to S3 and updates student with key and API URL.
 * @param {ObjectId} studentId
 * @param {object} file - Multer file (buffer, originalname, mimetype, size)
 * @returns {Promise<Student>}
 */
const uploadStudentProfilePicture = async (studentId, file) => {
  const student = await getStudentById(studentId);
  if (!student) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  }
  const result = await uploadService.uploadFileToS3(file, String(studentId), 'profile-pictures');
  const profileImageUrl = `/training/students/${studentId}/profile-picture`;
  await updateStudentById(studentId, {
    profileImageKey: result.key,
    profileImageUrl,
  });
  return getStudentById(studentId);
};

/**
 * Get a short-lived presigned URL for the student's profile picture.
 * @param {ObjectId} studentId
 * @returns {Promise<string|null>} Presigned URL or null if no profile picture
 */
const getStudentProfilePictureUrl = async (studentId) => {
  const student = await getStudentById(studentId);
  if (!student || !student.profileImageKey) {
    return null;
  }
  return uploadService.getPresignedDownloadUrlForKey(student.profileImageKey, 5 * 60); // 5 minutes
};

export {
  registerStudent,
  queryStudents,
  getStudentById,
  getStudentByUserId,
  updateStudentById,
  deleteStudentById,
  uploadStudentProfilePicture,
  getStudentProfilePictureUrl,
};
